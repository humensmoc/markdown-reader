import * as vscode from "vscode";
import { applyChanges, diffText, fromWire, normalizeText, rebaseChanges, toWire, type WireChange } from "./textChanges";

export type LiveMessage =
  | { type: "applyEdits"; clientId: string; operationId: number; documentUri: string; baseVersion: number; changes: WireChange[] }
  | { type: "editorCommand"; command: "undo" | "redo" | "save" }
  | { type: "compareDraft"; content: string }
  | { type: "reloadLiveDocument" };

type Sender = (message: unknown) => unknown;
const coordinators = new Map<string, LiveDocument>();

/** One serialized edit queue and change subscription per TextDocument, shared by all views. */
export class LiveDocument {
  private listeners = new Set<Sender>();
  private snapshots = new Map<number, string>();
  private version: number;
  private text: string;
  private queue: Promise<unknown> = Promise.resolve();
  private active?: { clientId: string; operationId: number; expected: string };
  private changeSub: vscode.Disposable;
  private saveSub: vscode.Disposable;
  constructor(readonly document: vscode.TextDocument) {
    this.version = document.version;
    this.text = normalizeText(document.getText());
    this.snapshots.set(this.version, this.text);
    this.changeSub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document !== document) return;
      const next = normalizeText(document.getText());
      const origin = this.active?.expected === next ? this.active : undefined;
      const message = { type: "documentPatch", documentUri: document.uri.toString(), baseVersion: this.version, version: document.version,
        changes: toWire(this.text, diffText(this.text, next)), clientId: origin?.clientId, operationId: origin?.operationId, dirty: document.isDirty };
      this.text = next; this.version = document.version;
      this.snapshots.set(this.version, next);
      if (this.snapshots.size > 128) this.snapshots.delete(this.snapshots.keys().next().value!);
      this.broadcast(message);
    });
    this.saveSub = vscode.workspace.onDidSaveTextDocument(d => {
      if (d === document) this.broadcast({ type: "documentSaved", dirty: d.isDirty });
    });
  }
  static attach(document: vscode.TextDocument, send: Sender): { coordinator: LiveDocument; dispose: () => void } {
    const key = document.uri.toString();
    let coordinator = coordinators.get(key);
    if (!coordinator) { coordinator = new LiveDocument(document); coordinators.set(key, coordinator); }
    coordinator.listeners.add(send);
    return { coordinator, dispose: () => {
      coordinator!.listeners.delete(send);
      if (!coordinator!.listeners.size) { coordinator!.changeSub.dispose(); coordinator!.saveSub.dispose(); coordinators.delete(key); }
    } };
  }
  snapshot() { return { type: "documentInit", documentUri: this.document.uri.toString(), content: this.text, version: this.version, dirty: this.document.isDirty }; }
  private broadcast(message: unknown) { for (const send of this.listeners) send(message); }
  run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action); this.queue = next.catch(() => {}); return next;
  }
  async receive(message: LiveMessage, send: Sender): Promise<void> {
    await this.run(async () => {
      if (message.type === "reloadLiveDocument") { send(this.snapshot()); return; }
      if (message.type === "compareDraft") {
        const draft = await vscode.workspace.openTextDocument({ content: message.content, language: "markdown" });
        await vscode.commands.executeCommand("vscode.diff", this.document.uri, draft.uri, "磁盘文档与保留的本地输入"); return;
      }
      if (message.type === "editorCommand") {
        try {
          if (message.command === "save") {
            if (!await this.document.save()) throw new Error("文件未能保存，修改仍保留在文档中。");
          } else await vscode.commands.executeCommand(message.command);
        } catch (error) { send({ type: "syncError", message: String(error) }); }
        return;
      }
      try {
        if (message.documentUri !== this.document.uri.toString() || typeof message.clientId !== "string" || !Number.isSafeInteger(message.operationId)) throw new Error("文档标识无效");
        const base = this.snapshots.get(message.baseVersion);
        if (base === undefined) throw new Error("文档版本已过期，请比对后重新加载");
        const changes = rebaseChanges(fromWire(base, message.changes), diffText(base, this.text));
        const expected = applyChanges(this.text, changes);
        this.active = { clientId: message.clientId, operationId: message.operationId, expected };
        if (expected !== this.text) {
          const edit = new vscode.WorkspaceEdit();
          for (const c of toWire(this.text, changes)) edit.replace(this.document.uri,
            new vscode.Range(c.from.line, c.from.character, c.to.line, c.to.character),
            this.document.eol === vscode.EndOfLine.CRLF ? c.insert.replace(/\n/g, "\r\n") : c.insert);
          if (!await vscode.workspace.applyEdit(edit)) throw new Error("无法应用文本修改");
          if (normalizeText(this.document.getText()) !== expected) throw new Error("写入期间文档发生外部变化");
        }
        send({ type: "editAck", operationId: message.operationId, version: this.document.version });
      } catch (error) {
        send({ ...this.snapshot(), type: "editRejected", operationId: message.operationId, message: error instanceof Error ? error.message : String(error) });
      } finally { this.active = undefined; }
    });
  }
}
