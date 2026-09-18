import { applyChanges, diffText, fromWire, normalizeText, rebaseChanges, toWire } from "../src/textChanges";

export class DocumentBridge {
  readonly clientId = `view-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  uri = ""; version = 0; base = ""; text = ""; dirty = false; conflict = ""; error = "";
  private operationId = 0;
  private flight?: { id: number; target: string };
  private commands: unknown[] = [];
  constructor(private send: (m: any) => void, private update: (text: string, reset: boolean) => void, private status: () => void) {}
  get pending() { return !!this.flight || this.text !== this.base; }
  local(text: string) { this.text = normalizeText(text); this.flush(); this.status(); }
  command(message: unknown) { this.commands.push(message); this.flush(); }
  private flush() {
    if (this.flight || this.conflict || !this.uri) return;
    if (this.text !== this.base) {
      this.flight = { id: ++this.operationId, target: this.text };
      this.send({ type: "applyEdits", documentUri: this.uri, clientId: this.clientId, operationId: this.flight.id,
        baseVersion: this.version, changes: toWire(this.base, diffText(this.base, this.text)) });
    } else while (this.commands.length) this.send(this.commands.shift());
  }
  receive(m: any): boolean {
    if (m.type === "documentInit") {
      this.uri = m.documentUri; this.version = m.version; this.base = this.text = normalizeText(m.content);
      this.flight = undefined; this.commands = []; this.conflict = ""; this.error = ""; this.dirty = m.dirty;
      this.update(this.text, true); this.status(); return true;
    }
    if (m.type === "documentPatch") {
      if (m.documentUri !== this.uri || m.version <= this.version) return true;
      if (m.baseVersion !== this.version) { this.conflict = "文档版本不连续，请比对后重新加载"; this.status(); return true; }
      const next = applyChanges(this.base, fromWire(this.base, m.changes));
      const own = this.flight && m.clientId === this.clientId && m.operationId === this.flight.id;
      try {
        if (!this.conflict) {
          if (own) {
            this.text = applyChanges(next, rebaseChanges(diffText(this.flight!.target, this.text), diffText(this.flight!.target, next)));
            this.flight = undefined;
          } else {
            const remote = diffText(this.base, next);
            this.text = applyChanges(next, rebaseChanges(diffText(this.base, this.text), remote));
            if (this.flight) this.flight.target = applyChanges(next, rebaseChanges(diffText(this.base, this.flight.target), remote));
          }
        }
      } catch (e) { this.conflict = String(e); }
      this.base = next; this.version = m.version; this.dirty = m.dirty;
      if (!this.conflict) this.update(this.text, false);
      this.flush(); this.status(); return true;
    }
    if (m.type === "editAck") {
      if (this.flight && this.flight.id === m.operationId && this.flight.target === this.base) this.flight = undefined;
      this.flush(); this.status(); return true;
    }
    if (m.type === "editRejected") {
      // Keep the local draft and all queued commands; only explicit reload discards it.
      this.flight = undefined; this.conflict = m.message; this.base = normalizeText(m.content); this.version = m.version;
      this.status(); return true;
    }
    if (m.type === "documentSaved") { this.dirty = m.dirty; this.error = ""; this.status(); return true; }
    if (m.type === "syncError") { this.error = m.message; this.status(); return true; }
    return false;
  }
}
