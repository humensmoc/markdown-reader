import { EditorState, StateEffect, StateField, EditorSelection, Transaction, type Range } from "@codemirror/state";
import { EditorView, Decoration, WidgetType, keymap, drawSelection, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxTree, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { GFM } from "@lezer/markdown";
import { extractMarkdownHeadings } from "../src/markdownHeadings";
import { diffText, type TextChange } from "../src/textChanges";
import { DocumentBridge } from "./documentBridge";

declare global { interface Window { ReaderServices: any; ReaderMath: any; ReaderHighlightFormat: any; ReaderHighlights: any; LivePreview: LiveEditor; } }
const S = window.ReaderServices;
const refresh = StateEffect.define<null>();
const remote = StateEffect.define<null>();
const jumpHighlight = StateEffect.define<{ position: number; returning?: boolean } | null>();
const jumpDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(jumpHighlight)) {
      value = effect.value ? Decoration.set([Decoration.line({
        class: effect.value.returning ? "lp-cite-return-highlight" : "lp-source-highlight"
      }).range(tr.state.doc.lineAt(Math.min(effect.value.position, tr.state.doc.length)).from)]) : Decoration.none;
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field)
});
type Block = { from: number; to: number; type: string; raw: string; data?: any };
type TableCell = { from: number; to: number; text: string };
type Table = Block & { rows: TableCell[][]; align: string[] };
const intersects = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from <= b.to && b.from <= a.to;
const contains = (a: { from: number; to: number }, b: { from: number; to: number }) => a.from <= b.from && a.to >= b.to;

class PreviewWidget extends WidgetType {
  readonly resource: string;
  readonly theme: string;
  readonly draggable: boolean;
  constructor(readonly owner: LiveEditor, readonly block: Block) { super(); this.resource = owner.imageUrls.get(block.data?.src) || ""; this.theme = document.body.dataset.vscodeThemeId || document.body.className; this.draggable = S.settings().enableBlockDrag; }
  eq(other: PreviewWidget) { return other.draggable === this.draggable && other.resource === this.resource && other.theme === this.theme && other.block.from === this.block.from && other.block.raw === this.block.raw && other.block.type === this.block.type; }
  toDOM() {
    const b = this.block, dom = document.createElement(b.type === "math-inline" || b.type === "image" || b.type === "cite" || b.type === "footnote" ? "span" : "div");
    dom.className = `lp-widget lp-${b.type}${dom.tagName === "DIV" ? " lp-block-widget" : ""}`; dom.dataset.sourceFrom = String(b.from); dom.dataset.sourceTo = String(b.to);
    if (b.type.startsWith("math")) dom.append(window.ReaderMath.render(b.data, b.type === "math-block"));
    else if (b.type === "mermaid") {
      dom.innerHTML = '<div class="mermaid-block"><div class="mermaid-toolbar"><button class="mermaid-expand-btn" type="button" title="全屏查看">放大</button></div><div class="mermaid-content"></div></div>';
      (dom.firstElementChild as HTMLElement).dataset.mermaidSource = b.data;
      // Existing renderer checks attachment before updating; detached/stale widgets are ignored.
      requestAnimationFrame(() => { if (dom.isConnected) S.hydrateMermaid(dom); });
    } else if (b.type === "definition-list") {
      const dl = document.createElement("dl"), dt = document.createElement("dt"); S.inline(dt, b.data.term); dl.append(dt);
      for (const text of b.data.descriptions) { const dd = document.createElement("dd"); S.inline(dd, text); dl.append(dd); } dom.append(dl);
    } else if (b.type === "properties") dom.append(S.properties(b.data) || document.createTextNode("笔记属性"));
    else if (b.type === "cite") {
      for (const n of b.data as string[]) {
        const button = document.createElement("button"); button.className = "cite-ref"; button.textContent = n; button.dataset.citeNumber = n;
        button.onclick = e => { e.stopPropagation(); this.owner.jumpCitation(n, b.from); };
        button.title = this.owner.sources.get(n)?.text || `来源 ${n}`; dom.append(button);
      }
    } else if (b.type === "footnote") {
      const button = document.createElement("button"); button.className = "footnote-ref"; button.textContent = b.data;
      const def = this.owner.parsed.definitions.find((d: any) => d.id === b.data);
      button.title = def?.comment || b.data;
      button.onclick = e => { e.stopPropagation(); if (def) this.owner.jumpToSource(def.start, b.from); }; dom.append(button);
    } else if (b.type === "definition") {
      const label = document.createElement("strong"); label.textContent = `${b.data.id}: `; dom.append(label); S.inline(dom, b.data.comment);
    } else if (b.type === "image") {
      const img = document.createElement("img"); img.alt = b.data.alt; img.src = this.owner.imageUrls.get(b.data.src) || (/^(https:|data:image\/)/i.test(b.data.src) ? b.data.src : "");
      img.title = "点击编辑图片语法"; img.loading = "lazy"; dom.append(img);
      if (!img.getAttribute("src")) this.owner.send({ type: "resolveImage", href: b.data.src });
    } else if (b.type === "html") dom.append(S.safeHtml(b.raw));
    else if (b.type === "rule") dom.append(document.createElement("hr"));
    else if (b.type === "hidden") { dom.className += " lp-hidden"; }
    if (this.draggable && ["mermaid", "math-block", "html", "definition-list"].includes(b.type)) dom.prepend(this.owner.dragHandle(b.from, b.to));
    dom.addEventListener("mousedown", e => {
      if ((e.target as Element).closest("button, a, summary, .lp-drag") || ["cite", "footnote", "hidden"].includes(b.type)) return;
      e.preventDefault(); this.owner.goto(b.from + (b.type.startsWith("math") ? 1 : 0));
    });
    return dom;
  }
  ignoreEvent() { return true; }
}

class HeadingWidget extends WidgetType {
  readonly showNumber: boolean;
  constructor(readonly owner: LiveEditor, readonly from: number, readonly number: string, readonly collapsed: boolean) { super(); this.showNumber = S.settings().showContentNumbers; }
  eq(o: HeadingWidget) { return o.showNumber === this.showNumber && o.from === this.from && o.number === this.number && o.collapsed === this.collapsed; }
  toDOM() {
    const span = document.createElement("span"); span.className = "lp-heading-controls";
    const button = document.createElement("button"); button.type = "button"; button.className = "content-fold";
    button.textContent = this.collapsed ? "▸" : "▾"; button.title = "折叠或展开本节";
    button.setAttribute("aria-expanded", String(!this.collapsed));
    button.onmousedown = e => e.preventDefault(); button.onclick = e => { e.stopPropagation(); this.owner.toggleFold(this.from); };
    span.append(button);
    if (this.number && this.showNumber) { const n = document.createElement("span"); n.className = "outline-number"; n.textContent = `${this.number} `; span.append(n); }
    return span;
  }
  ignoreEvent() { return true; }
}

class MarkerWidget extends WidgetType {
  constructor(readonly owner: LiveEditor, readonly from: number, readonly to: number, readonly text: string, readonly kind: "task" | "list" | "drag") { super(); }
  eq(o: MarkerWidget) { return o.from === this.from && o.to === this.to && o.text === this.text && o.kind === this.kind; }
  toDOM() {
    if (this.kind === "task") {
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "task-checkbox";
      input.checked = /x/i.test(this.text); input.setAttribute("aria-label", "切换任务完成状态");
      input.onmousedown = e => e.preventDefault();
      input.onchange = () => this.owner.view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? "x" : " " }, userEvent: "input.task" });
      return input;
    }
    const span = document.createElement("span"); span.className = this.kind === "drag" ? "lp-drag" : "lp-list-marker";
    span.textContent = this.kind === "drag" ? "⠿" : /^\d/.test(this.text) ? this.text : "•";
    if (this.kind === "drag") {
      span.draggable = true; span.title = "拖动文本块";
      span.ondragstart = e => { this.owner.startDrag(this.from, this.to); e.dataTransfer?.setData("text/plain", this.owner.view.state.sliceDoc(this.from, this.to)); };
    }
    return span;
  }
  ignoreEvent() { return true; }
}

class TableWidget extends WidgetType {
  readonly semanticKey: string;
  constructor(readonly owner: LiveEditor, readonly table: Table) { super(); this.semanticKey = owner.semanticKey + S.settings().enableBlockDrag; }
  eq(o: TableWidget) { return o.semanticKey === this.semanticKey && o.table.from === this.table.from && o.table.raw === this.table.raw; }
  toDOM() { const dom = document.createElement("div"); dom.className = "lp-table"; this.owner.updateTable(dom, this.table); return dom; }
  updateDOM(dom: HTMLElement) { this.owner.updateTable(dom, this.table); return true; }
  destroy(dom: HTMLElement) { if (this.owner.cell && dom.contains(this.owner.cell.view.dom)) { this.owner.cell.view.destroy(); this.owner.cell = undefined; } }
  ignoreEvent() { return true; }
}

export class LiveEditor {
  view!: EditorView;
  bridge: DocumentBridge;
  sourceMode = false;
  parsed: any;
  blocks: Block[] = [];
  tables: Table[] = [];
  headings: any[] = [];
  annotations: any[] = [];
  sources = new Map<string, { from: number; text: string }>();
  legacyHighlights: any[] = [];
  annotationSpans: { from: number; to: number; id: string }[] = [];
  semanticKey = "";
  imageUrls = new Map<string, string>();
  folded = new Set<number>();
  cell?: { view: EditorView; element: HTMLElement; tableFrom: number; row: number; col: number };
  private cache = "\0";
  private asideTimer = 0;
  private selectingTable = false;
  private textNodes = new WeakMap<Node, number[]>();
  private statusNode: HTMLElement;
  private conflictNode: HTMLElement;
  private dragFrom?: { from: number; to: number };
  private returnPosition = 0;
  private returnHighlightTimer = 0;
  private replacingRemote = false;
  private updatingCell = false;

  constructor() {
    this.statusNode = document.createElement("span"); this.statusNode.className = "lp-status"; this.statusNode.setAttribute("role", "status");
    this.conflictNode = document.createElement("div"); this.conflictNode.className = "lp-conflict"; this.conflictNode.hidden = true;
    document.body.append(this.statusNode, this.conflictNode);
    this.bridge = new DocumentBridge(m => S.post(m), (text, reset) => this.setText(text, reset), () => this.updateStatus());
    document.body.classList.add("live-preview");
    window.addEventListener("message", e => {
      if (this.bridge.receive(e.data)) return;
      if (e.data.type === "resolvedImage") { this.imageUrls.set(e.data.href, e.data.url); this.redecorate(); }
      if (e.data.type === "toggleSource") this.toggleSource();
    });
    document.getElementById("showMarkdownSource")?.addEventListener("change", () => this.toggleSource());
    document.getElementById("reloadDocumentBtn")?.addEventListener("click", e => { e.stopImmediatePropagation(); this.reload(); }, true);
    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      this.selectingTable = !!selection?.rangeCount && !selection.isCollapsed && !!(selection.anchorNode?.parentElement?.closest(".lp-table") || selection.focusNode?.parentElement?.closest(".lp-table"));
    });
    document.addEventListener("click", e => this.handleClick(e), true);
    document.addEventListener("mousedown", e => {
      if (this.cell && !(e.target as Element).closest(".lp-cell-active, .annotation-action, .reading-highlight-panel, .annotation-dialog, .reader-tools-root")) {
        const previous = this.cell;
        // Let the main editor resolve the click against the layout the user saw.
        // Closing an expanded cell first can move the clicked paragraph up a line.
        window.setTimeout(() => { if (this.cell === previous) this.closeCell(); }, 0);
      }
    }, true);
    document.addEventListener("dragover", e => { if (this.dragFrom && (e.target as Element).closest("#reportContent")) e.preventDefault(); }, true);
    document.addEventListener("drop", e => {
      if (!this.dragFrom || !(e.target as Element).closest("#reportContent")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const at = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (at !== null) this.moveBlock(this.dragFrom.from, this.dragFrom.to, this.view.state.doc.lineAt(at).from);
      this.dragFrom = undefined;
    }, true);
    document.addEventListener("dragend", () => { this.dragFrom = undefined; });
    document.addEventListener("keydown", e => {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !this.bridge.conflict) { e.preventDefault(); this.send({ type: "editorCommand", command: "save" }); }
    });
    window.addEventListener("scroll", () => this.scrollSpy(), { passive: true });
    let previousWidth = innerWidth;
    if (innerWidth < 650) S.compactToc();
    window.addEventListener("resize", () => { if (innerWidth < 650 && previousWidth >= 650) S.compactToc(); previousWidth = innerWidth; });
    new MutationObserver(() => this.redecorate()).observe(document.body, { attributes: true, attributeFilter: ["data-vscode-theme-id", "data-vscode-theme-kind"] });
  }

  private updateStatus() {
    this.statusNode.textContent = this.bridge.conflict ? "同步冲突，输入已保留" : this.bridge.error ? "操作失败，修改仍保留" : this.bridge.pending ? "正在同步…" : this.bridge.dirty ? "未保存" : "已保存";
    this.statusNode.title = this.bridge.error || "";
    this.conflictNode.hidden = !this.bridge.conflict;
    if (this.bridge.conflict && !this.conflictNode.childNodes.length) {
      const label = document.createElement("span"); label.textContent = "文档发生冲突。本地输入已保留。";
      const compare = document.createElement("button"); compare.textContent = "查看差异";
      compare.onclick = () => S.post({ type: "compareDraft", content: this.bridge.text });
      const reload = document.createElement("button"); reload.textContent = "放弃本地输入并重新加载";
      reload.onclick = () => { if (confirm("确认放弃尚未同步的本地输入？建议先查看差异保留草稿。")) S.post({ type: "reloadLiveDocument" }); };
      this.conflictNode.append(label, compare, reload);
    }
  }
  send(message: any) {
    if (["openFile", "openExternal", "resolveImage"].includes(message.type)) S.post(message);
    else this.bridge.command({ ...message, livePreview: true });
  }
  reload() { if (!this.bridge.pending && !this.bridge.conflict) S.post({ type: "reloadLiveDocument" }); else this.updateStatus(); }
  toggleSource() {
    this.sourceMode = !this.sourceMode; this.closeCell(); this.redecorate();
    const box = document.getElementById("showMarkdownSource") as HTMLInputElement; if (box) box.checked = this.sourceMode;
  }
  refreshLayout() { this.redecorate(); this.updateAsides(); }
  redecorate() { this.view?.dispatch({ effects: refresh.of(null) }); }

  private setText(text: string, reset: boolean) {
    S.setText(text);
    if (!this.view) {
      const mount = document.getElementById("reportContent")!; mount.classList.add("markdown-body");
      const pre = S.preprocess(text), firstBody = pre.frontmatter ? Math.min(pre.frontmatter.length + 1, text.length) : 0;
      this.view = new EditorView({ parent: mount, state: EditorState.create({ doc: text, selection: { anchor: firstBody }, extensions: this.extensions(false) }) });
      this.updateAsides();
    } else if (text !== this.view.state.doc.toString()) {
      this.replacingRemote = true;
      const changes = this.view.state.changes(diffText(this.view.state.doc.toString(), text));
      if (this.cell) this.cell.tableFrom = changes.mapPos(this.cell.tableFrom, 1);
      this.view.dispatch({ changes, effects: remote.of(null), annotations: Transaction.addToHistory.of(false) });
      if (this.cell) {
        const next = this.tables.find(t => t.from === this.cell!.tableFrom)?.rows[this.cell.row]?.[this.cell.col];
        if (!next) this.closeCell();
        else if (next.text !== this.cell.view.state.doc.toString()) {
          this.updatingCell = true;
          this.cell.view.dispatch({ changes: diffText(this.cell.view.state.doc.toString(), next.text) });
          this.updatingCell = false;
        }
      }
      this.replacingRemote = false;
    }
    if (reset) {
      this.closeCell(); this.folded.clear(); clearTimeout(this.returnHighlightTimer);
      document.getElementById("lpReturn")?.remove();
      this.view.dispatch({ effects: jumpHighlight.of(null) }); this.redecorate();
    }
  }

  private extensions(cell: boolean): any[] {
    const owner = this;
    const decorations = StateField.define<DecorationSet>({
      create: state => owner.decorations(state, cell),
      update(value, tr) {
        if (tr.isUserEvent("input.type.compose") || owner.view?.composing || owner.cell?.view.composing) return value.map(tr.changes);
        if (tr.docChanged || tr.selection || tr.effects.length || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return owner.decorations(tr.state, cell);
        return value;
      },
      provide: field => EditorView.decorations.from(field)
    });
    return [markdown({ extensions: GFM }), syntaxHighlighting(defaultHighlightStyle), bracketMatching(), drawSelection(), EditorView.lineWrapping,
      ...(cell ? [EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged || !tr.newDoc.toString().includes("\n")) return tr;
        const next = tr.newDoc.toString().replace(/\n/g, "<br>");
        return { changes: diffText(tr.startState.doc.toString(), next), selection: { anchor: Math.min(tr.newSelection.main.head, next.length) } };
      })] : []),
      EditorState.allowMultipleSelections.of(true), decorations, ...(cell ? [] : [jumpDecorations]),
      EditorView.contentAttributes.of({ "aria-label": cell ? "表格单元格" : "Markdown 实时预览编辑器", spellcheck: "true" }),
      keymap.of([
        { key: "Mod-z", run: () => { owner.send({ type: "editorCommand", command: "undo" }); return true; } },
        { key: "Mod-Shift-z", run: () => { owner.send({ type: "editorCommand", command: "redo" }); return true; } },
        { key: "Mod-y", run: () => { owner.send({ type: "editorCommand", command: "redo" }); return true; } },
        { key: "Mod-b", run: v => owner.format(v, "**") }, { key: "Mod-i", run: v => owner.format(v, "*") },
        ...(cell ? [
          { key: "Tab", run: () => owner.navigateCell(0, 1) }, { key: "Shift-Tab", run: () => owner.navigateCell(0, -1) },
          { key: "Enter", run: () => owner.navigateCell(1, 0) }, { key: "Escape", run: () => { owner.closeCell(); owner.view.focus(); return true; } }
        ] : markdownKeymap), ...defaultKeymap, indentWithTab
      ]),
      EditorView.domEventHandlers({
        compositionend: () => { requestAnimationFrame(() => owner.redecorate()); },
        drop: (event, view) => {
          if (cell || !owner.dragFrom) return false;
          const at = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (at !== null) { event.preventDefault(); owner.moveBlock(owner.dragFrom.from, owner.dragFrom.to, view.state.doc.lineAt(at).from); }
          owner.dragFrom = undefined; return true;
        }
      }),
      EditorView.updateListener.of(update => {
        if (cell) { if (update.docChanged) owner.cellChanged(update); return; }
        if (update.docChanged) {
          const text = update.state.doc.toString(); S.setText(text);
          owner.folded = new Set([...owner.folded].map(p => update.changes.mapPos(p)));
          owner.returnPosition = update.changes.mapPos(owner.returnPosition);
          if (!owner.replacingRemote) owner.bridge.local(text);
          clearTimeout(owner.asideTimer); owner.asideTimer = window.setTimeout(() => owner.updateAsides(), 120);
        }
        if (update.selectionSet) requestAnimationFrame(() => {
          S.selectionChanged();
          const selection = update.state.selection.main;
          if (!owner.sourceMode && selection.empty && !owner.cell) {
            const table = owner.tables.find(t => selection.head >= t.from && selection.head <= t.to);
            if (table) {
              let row = table.rows.findIndex(r => selection.head <= r.at(-1)!.to); if (row < 0) row = table.rows.length - 1;
              let col = table.rows[row].findIndex(c => selection.head <= c.to); if (col < 0) col = table.rows[row].length - 1;
              const td = owner.view.dom.querySelector(`.lp-table[data-table-from="${table.from}"] td[data-row="${row}"][data-col="${col}"]`) as HTMLElement;
              if (td) owner.openCell(td, table.from, row, col);
            }
          }
        });
      })];
  }

  private analyze(state: EditorState) {
    const text = state.doc.toString(); if (this.cache === text) return;
    this.cache = text; this.parsed = window.ReaderHighlightFormat.parse(text); this.blocks = []; this.tables = []; this.sources.clear();
    const pre = S.preprocess(text); this.annotations = pre.annotations;
    this.legacyHighlights = [];
    for (const line of pre.readingHighlights || []) {
      try {
        const raw = /^<!-- mr-highlight (\{.*\}) -->$/.exec(line)?.[1];
        const item = JSON.parse(raw || "");
        this.legacyHighlights.push({ ...item, raw, ranges: window.ReaderHighlightFormat.resolve(text, item, this.parsed) });
      } catch { /* Ambiguous old anchors remain in the file and are never guessed. */ }
    }
    this.annotationSpans = [];
    for (const annotation of this.annotations) {
      if (annotation.status === "resolved") continue;
      for (const quote of S.annotationQuotes(annotation)) {
        const plain = window.ReaderHighlightFormat.parse(quote).text.trim(), index = this.parsed.text.indexOf(plain);
        if (plain && index >= 0) this.annotationSpans.push({ from: this.parsed.points[index], to: this.parsed.ends[index + plain.length - 1], id: annotation.id });
      }
    }
    this.semanticKey = JSON.stringify([this.annotationSpans, this.legacyHighlights]);
    const name = decodeURIComponent(this.bridge.uri.split("/").at(-1) || "document.md");
    this.headings = S.number({ name, content: text, headings: extractMarkdownHeadings(text, name) }).numberedHeadings;
    const doc = state.doc;
    for (let n = 1; n <= doc.lines; n++) {
      const line = doc.line(n), raw = line.text;
      if (n === 1 && pre.frontmatter) {
        const end = line.from + pre.frontmatter.length;
        this.blocks.push({ from: 0, to: end, raw: text.slice(0, end), type: "properties", data: pre.frontmatterFields }); n = doc.lineAt(end).number; continue;
      }
      const annotationStart = /^\s*<!--\s*(mr-annotation:(start|ai-guide)|mr-highlight\s)/.test(raw);
      if (annotationStart) {
        let end = n;
        const endToken = raw.includes("mr-annotation:start") ? "<!-- mr-annotation:end -->" : "-->";
        while (end <= doc.lines && !doc.line(end).text.includes(endToken)) end++;
        if (end <= doc.lines) { const to = doc.line(end).to; this.blocks.push({ from: line.from, to, raw: text.slice(line.from, to), type: "hidden" }); n = end; continue; }
      }
      const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
      if (fence) {
        let end = n + 1;
        while (end <= doc.lines && !(new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`)).test(doc.line(end).text)) end++;
        if (end <= doc.lines) {
          const to = doc.line(end).to;
          if (fence[2].trim() === "mermaid") this.blocks.push({ from: line.from, to, raw: text.slice(line.from, to), type: "mermaid", data: text.slice(line.to + 1, doc.line(end).from).trimEnd() });
          n = end; continue;
        } else break;
      }
      if (/^\s*(\$\$|\\\[)/.test(raw)) {
        const math = window.ReaderMath.readBlock(text.split("\n"), n - 1);
        if (math) { const to = doc.line(math.endLine + 1).to; this.blocks.push({ from: line.from, to, raw: text.slice(line.from, to), type: "math-block", data: math }); n = math.endLine + 1; continue; }
      }
      const cells = window.ReaderHighlightFormat.tableCells(raw);
      if (n < doc.lines && raw.trim() && /^:\s+/.test(doc.line(n + 1).text)) {
        let end = n + 1; while (end + 1 <= doc.lines && /^:\s+/.test(doc.line(end + 1).text)) end++;
        this.blocks.push({ from: line.from, to: doc.line(end).to, raw: text.slice(line.from, doc.line(end).to), type: "definition-list", data: { term: raw, descriptions: Array.from({ length: end - n }, (_, i) => doc.line(n + i + 1).text.replace(/^:\s+/, "")) } });
        n = end; continue;
      }
      if (n < doc.lines && cells.length && raw.includes("|") && /^\s*\|?\s*:?-{3,}/.test(doc.line(n + 1).text)) {
        const separators = window.ReaderHighlightFormat.tableCells(doc.line(n + 1).text);
        if (separators.length === cells.length && separators.every((c: any) => /^\s*:?-{3,}:?\s*$/.test(c.text))) {
          const rows: TableCell[][] = [], align = separators.map((c: any) => c.text.trim().endsWith(":") ? c.text.trim().startsWith(":") ? "center" : "right" : "left");
          let end = n;
          for (; end <= doc.lines; end++) {
            if (end === n + 1) continue;
            const row = doc.line(end); if (!row.text.includes("|") || !row.text.trim()) break;
            rows.push(window.ReaderHighlightFormat.tableCells(row.text).map((c: any) => ({ from: row.from + c.start, to: row.from + c.end, text: c.text })));
          }
          const to = doc.line(end - 1).to;
          const table: Table = { from: line.from, to, raw: text.slice(line.from, to), type: "table", rows, align };
          this.tables.push(table); this.blocks.push(table); n = end - 1; continue;
        }
      }
      const source = /^\s*\[cite[- ]source\]\s*(\d+)[.)]\s*(.*)$/i.exec(raw);
      if (source) this.sources.set(source[1], { from: line.from, text: source[2] });
      if (/^\s*(?:---+|\*\s*\*\s*\*[-*\s]*|___+)\s*$/.test(raw)) this.blocks.push({ from: line.from, to: line.to, raw, type: "rule" });
    }
    for (const definition of this.parsed.definitions) {
      const from = doc.lineAt(definition.start).from, to = doc.lineAt(Math.max(definition.start, definition.end - 1)).to;
      if (!this.blocks.some(b => b.from <= from && b.to >= to)) this.blocks.push({ from, to, raw: text.slice(from, to), type: "definition", data: definition });
    }
    syntaxTree(state).iterate({ enter: node => {
      if (node.name === "HTMLBlock" && !this.blocks.some(b => intersects(b, node))) {
        this.blocks.push({ from: node.from, to: node.to, raw: text.slice(node.from, node.to), type: "html" }); return false;
      }
    } });
  }

  private decorations(state: EditorState, cell: boolean): DecorationSet {
    if (!cell) this.analyze(state);
    const text = state.doc.toString(), ranges: Range<Decoration>[] = [], hidden: { from: number; to: number }[] = [];
    const active = (from: number, to: number) => this.sourceMode || state.selection.ranges.some(r => intersects(r, { from, to }));
    const mark = (from: number, to: number, spec: any) => { if (to > from) ranges.push(Decoration.mark(spec).range(from, to)); };
    const replace = (from: number, to: number, widget?: WidgetType, block = false) => {
      if (to <= from || hidden.some(r => intersects({ from, to: to - 1 }, { from: r.from, to: r.to - 1 }))) return;
      hidden.push({ from, to }); ranges.push(Decoration.replace({ widget, block, inclusive: false }).range(from, to));
    };
    if (!cell && !this.sourceMode) {
      for (const block of this.blocks) {
        if (block.type === "table") replace(block.from, block.to, new TableWidget(this, block as Table), true);
        else if (block.type === "hidden" || !active(block.from, block.to)) replace(block.from, block.to, new PreviewWidget(this, block), true);
      }
      for (const from of this.folded) {
        const heading = this.headings.find(h => state.doc.line(h.line).from === from); if (!heading) continue;
        const next = this.headings.find(h => h.line > heading.line && h.level <= heading.level);
        const start = state.doc.line(heading.line).to, end = next ? state.doc.line(next.line).from - 1 : state.doc.length;
        if (end > start && !hidden.some(b => b.from <= start && b.to > start)) {
          for (let i = ranges.length - 1; i >= 0; i--) if (ranges[i].from > start && ranges[i].to <= end) ranges.splice(i, 1);
          for (let i = hidden.length - 1; i >= 0; i--) if (hidden[i].from > start && hidden[i].to <= end) hidden.splice(i, 1);
          replace(start, end, undefined, true);
        }
      }
    }
    const covered = (from: number, to: number) => hidden.some(r => contains(r, { from, to }));
    syntaxTree(state).iterate({ enter: node => {
      if (covered(node.from, node.to)) return false;
      const name = node.name;
      if (name === "Image") {
        const url = node.node.getChild("URL"), raw = text.slice(node.from, node.to);
        if (url && !active(node.from, node.to)) {
          const b: Block = { from: node.from, to: node.to, raw, type: "image", data: { src: text.slice(url.from, url.to), alt: /^!\[([^\]]*)\]/.exec(raw)?.[1] || "" } };
          replace(node.from, node.to, new PreviewWidget(this, cell ? { ...b, from: b.from + this.cellSourceFrom(), to: b.to + this.cellSourceFrom() } : b));
        }
        return false;
      }
      if (name === "Link" && (!node.node.getChild("URL") || /^\[(cite:|cite[ -]source|\^)/i.test(text.slice(node.from, node.to)))) return false;
      const styles: Record<string, string> = { StrongEmphasis: "lp-strong", Emphasis: "lp-em", Strikethrough: "lp-strike", InlineCode: "lp-code", Link: "lp-link" };
      if (styles[name]) mark(node.from, node.to, { class: styles[name] });
      if (/^(EmphasisMark|CodeMark|StrikethroughMark|LinkMark|URL)$/.test(name)) {
        const parent = node.node.parent;
        if (parent && !active(parent.from, parent.to)) replace(node.from, node.to);
      }
      if (/^ATXHeading/.test(name)) {
        const line = state.doc.lineAt(node.from), level = name.at(-1);
        ranges.push(Decoration.line({ class: `lp-heading lp-h${level}` }).range(line.from));
        if (!active(node.from, node.to)) { const prefix = /^#{1,6}\s+/.exec(line.text); if (prefix) replace(node.from, node.from + prefix[0].length); }
      }
      if (name === "QuoteMark" || name === "ListMark") {
        const line = state.doc.lineAt(node.from);
        ranges.push(Decoration.line({ class: name === "QuoteMark" ? "lp-quote" : "lp-list" }).range(line.from));
        if (name === "QuoteMark" && !active(line.from, line.to)) replace(node.from, Math.min(node.to + 1, line.to));
        if (name === "ListMark" && !active(line.from, line.to)) replace(node.from, node.to, new MarkerWidget(this, node.from, node.to, text.slice(node.from, node.to), "list"));
      }
      if (name === "TaskMarker" && !active(node.from, node.to)) replace(node.from, node.to, new MarkerWidget(this, node.from, node.to, text.slice(node.from, node.to), "task"));
      if (/^(FencedCode|CodeBlock)$/.test(name)) {
        for (let n = state.doc.lineAt(node.from).number; n <= state.doc.lineAt(node.to).number; n++) ranges.push(Decoration.line({ class: "lp-code-block" }).range(state.doc.line(n).from));
        return false;
      }
    } });
    // Project extensions use the existing source-aware parser (highlights, math and footnotes).
    const parsed = cell ? window.ReaderHighlightFormat.parse(text) : this.parsed;
    for (const wrapper of parsed.wrappers) {
      if (wrapper.kind !== "mark" || covered(wrapper.start, wrapper.end)) continue;
      mark(wrapper.inside, wrapper.insideEnd, { tagName: "mark", class: "reading-native-highlight", attributes: { "data-native-start": String(cell ? this.cellSourceFrom() + wrapper.start : wrapper.start) } });
      if (!active(wrapper.start, wrapper.end)) { replace(wrapper.start, wrapper.inside); replace(wrapper.insideEnd, wrapper.end); }
    }
    const codeRanges: { from: number; to: number }[] = [];
    syntaxTree(state).iterate({ enter: n => { if (["InlineCode", "FencedCode", "CodeBlock", "URL"].includes(n.name)) { codeRanges.push({ from: n.from, to: n.to }); return false; } } });
    const opaque = (from: number, to: number) => covered(from, to) || codeRanges.some(r => contains(r, { from, to }));
    const scan = /\[cite:\s*([\d,\s]+)\]|\[\^([^\]]+)\]|!\[([^\]]*)\]\(([^)]+)\)|==|\$|\\[([]/gi;
    let m: RegExpExecArray | null;
    while ((m = scan.exec(text))) {
      const from = m.index; if (opaque(from, from + m[0].length)) continue;
      let b: Block | undefined;
      if (m[1]) b = { from, to: scan.lastIndex, raw: m[0], type: "cite", data: m[1].split(",").map(s => s.trim()).filter(Boolean) };
      else if (m[2] && text[scan.lastIndex] !== ":") b = { from, to: scan.lastIndex, raw: m[0], type: "footnote", data: m[2] };
      else if (m[4]) b = { from, to: scan.lastIndex, raw: m[0], type: "image", data: { alt: m[3], src: m[4] } };
      else if (m[0] !== "==") {
        const math = window.ReaderMath.readMath(text, from);
        if (math && text.slice(from).startsWith(math.raw)) b = { from, to: from + math.raw.length, raw: math.raw, type: "math-inline", data: math };
      }
      if (b && !active(b.from, b.to)) { replace(b.from, b.to, new PreviewWidget(this, cell ? { ...b, from: b.from + this.cellSourceFrom(), to: b.to + this.cellSourceFrom() } : b)); scan.lastIndex = b.to; }
    }
    const wikilinks = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;
    while ((m = wikilinks.exec(text))) {
      const from = m.index, to = wikilinks.lastIndex; if (opaque(from, to)) continue;
      mark(from, to, { class: "lp-wiki lp-link", attributes: { "data-href": m[1] } });
      if (!active(from, to)) { replace(from, from + (m[2] ? m[0].indexOf("|") + 1 : 2)); replace(to - 2, to); }
    }
    const html = /<(mark|kbd|sub|sup|strong|em|b|i|del|s|u)\b[^>]*>([^<>\n]*)<\/\1\s*>/gi;
    while ((m = html.exec(text))) {
      const from = m.index, to = html.lastIndex; if (opaque(from, to)) continue;
      const inside = from + m[0].indexOf(">") + 1, end = from + m[0].lastIndexOf("</");
      mark(inside, end, { tagName: m[1].toLowerCase() });
      if (!active(from, to)) { replace(from, inside); replace(end, to); }
    }
    if (!cell) {
      for (let n = 1; n <= state.doc.lines; n++) {
        const line = state.doc.line(n);
        if (!line.text && !covered(line.from, line.to)) ranges.push(Decoration.line({ class: "lp-blank" }).range(line.from));
      }
      if (S.settings().enableBlockDrag) {
        syntaxTree(state).iterate({ enter: node => {
          if (node.name === "Document") return;
          const line = state.doc.lineAt(node.from);
          let end = node.to;
          if (/ATXHeading/.test(node.name)) {
            const heading = this.headings.find(h => h.line === line.number), next = this.headings.find(h => h.line > line.number && h.level <= heading?.level);
            end = next ? Math.max(line.to, state.doc.line(next.line).from - 1) : state.doc.length;
          }
          if (!covered(node.from, node.to)) ranges.push(Decoration.widget({ widget: new MarkerWidget(this, line.from, this.blockEnd(end, state.doc), "", "drag"), side: -1 }).range(line.from));
          return false;
        } });
      }
      for (const h of this.headings) {
        const line = state.doc.line(h.line); if (covered(line.from, line.to)) continue;
        ranges.push(Decoration.widget({ widget: new HeadingWidget(this, line.from, h.outlineNumber, this.folded.has(line.from)), side: -1 }).range(line.from));
      }
      for (const line of this.sources.values()) {
        const l = state.doc.lineAt(line.from), prefix = /^\s*\[cite[- ]source\]\s*/i.exec(l.text);
        if (prefix && !active(l.from, l.to)) replace(l.from, l.from + prefix[0].length);
      }
      for (const span of this.annotationSpans) if (!covered(span.from, span.to)) mark(span.from, span.to, { class: "annotation-change-highlight", attributes: { "data-annotation-id": span.id } });
      for (const legacy of this.legacyHighlights) for (const range of legacy.ranges) {
        if (!covered(range.start, range.end)) mark(range.start, range.end, { tagName: "mark", class: `lp-legacy lp-highlight-${legacy.color}`, attributes: { "data-legacy-id": legacy.id } });
      }
    }
    // Marks crossing an opaque replacement may split it; omit those marks.
    return Decoration.set(ranges, true);
  }

  private format(view: EditorView, delimiter: string) {
    const changes: TextChange[] = [], selections: any[] = [];
    let shift = 0;
    for (const r of view.state.selection.ranges) {
      const selected = view.state.sliceDoc(r.from, r.to);
      if (r.from >= delimiter.length && view.state.sliceDoc(r.from - delimiter.length, r.from) === delimiter && view.state.sliceDoc(r.to, r.to + delimiter.length) === delimiter) {
        changes.push({ from: r.from - delimiter.length, to: r.to + delimiter.length, insert: selected });
        selections.push(EditorSelection.range(r.from + shift - delimiter.length, r.to + shift - delimiter.length)); shift -= delimiter.length * 2;
      } else if (selected.startsWith(delimiter) && selected.endsWith(delimiter) && selected.length >= delimiter.length * 2) {
        const inner = selected.slice(delimiter.length, -delimiter.length); changes.push({ from: r.from, to: r.to, insert: inner });
        selections.push(EditorSelection.range(r.from + shift, r.from + shift + inner.length)); shift -= delimiter.length * 2;
      } else { changes.push({ from: r.from, to: r.to, insert: delimiter + selected + delimiter }); selections.push(EditorSelection.range(r.from + shift + delimiter.length, r.to + shift + delimiter.length)); shift += delimiter.length * 2; }
    }
    view.dispatch({ changes, selection: EditorSelection.create(selections), userEvent: "input.format" }); return true;
  }
  goto(position: number) {
    this.closeCell(); const pos = Math.max(0, Math.min(position, this.view.state.doc.length));
    this.folded.clear(); this.view.dispatch({ selection: { anchor: pos }, effects: [refresh.of(null), EditorView.scrollIntoView(pos, { y: "center" })] }); this.view.focus();
  }
  toggleFold(from: number) { if (this.folded.has(from)) this.folded.delete(from); else this.folded.add(from); this.redecorate(); }
  jumpCitation(number: string, from: number) {
    const source = this.sources.get(number); if (!source) return; this.jumpToSource(source.from, from);
  }
  jumpToSource(target: number, from: number) {
    clearTimeout(this.returnHighlightTimer);
    this.returnPosition = from; this.goto(target);
    this.view.dispatch({ effects: jumpHighlight.of({ position: target }) });
    let button = document.getElementById("lpReturn");
    if (!button) {
      button = document.createElement("button"); button.id = "lpReturn"; button.className = "lp-return"; button.textContent = "返回原文";
      button.onclick = () => {
        this.goto(this.returnPosition); button!.remove();
        this.view.dispatch({ effects: jumpHighlight.of({ position: this.returnPosition, returning: true }) });
        this.returnHighlightTimer = window.setTimeout(() => this.view.dispatch({ effects: jumpHighlight.of(null) }), 1300);
      };
      document.body.append(button);
    }
  }
  private handleClick(event: MouseEvent) {
    const target = event.target as Element;
    const wiki = target.closest(".lp-wiki") as HTMLElement;
    if (wiki && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopImmediatePropagation(); this.openLink(wiki.dataset.href!); return; }
    const tocLink = target.closest("#toc a[data-anchor]") as HTMLElement;
    if (tocLink) { const h = this.headings.find(h => h.anchor === tocLink.dataset.anchor); if (h) { event.preventDefault(); event.stopImmediatePropagation(); this.goto(this.view.state.doc.line(h.line).from); } return; }
    const link = target.closest("#reportContent a") as HTMLAnchorElement;
    if (link) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.ctrlKey || event.metaKey) this.openLink(link.getAttribute("href") || "");
      else {
        const td = link.closest("td[data-row]") as HTMLElement;
        if (td) this.openCell(td, Number((td.closest(".lp-table") as HTMLElement).dataset.tableFrom), Number(td.dataset.row), Number(td.dataset.col));
      }
      return;
    }
    const cmLink = target.closest(".lp-link");
    if (cmLink && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const view = this.cell?.view.dom.contains(cmLink) ? this.cell.view : this.view;
      const pos = view.posAtDOM(cmLink); let n = syntaxTree(view.state).resolveInner(pos, 1);
      while (n.parent && n.name !== "Link") n = n.parent;
      const url = n.getChild("URL"); if (url) this.openLink(view.state.sliceDoc(url.from, url.to));
    }
  }
  private openLink(href: string) {
    if (href.startsWith("#")) { const h = this.headings.find(h => h.anchor === href.slice(1) || h.text === decodeURIComponent(href.slice(1))); if (h) this.goto(this.view.state.doc.line(h.line).from); }
    else this.send({ type: /^(https?:|mailto:)/i.test(href) ? "openExternal" : "openFile", href });
  }

  updateTable(dom: HTMLElement, model: Table) {
    dom.dataset.tableFrom = String(model.from); dom.dataset.sourceFrom = String(model.from); dom.dataset.sourceTo = String(model.to);
    dom.querySelector(":scope > .lp-drag")?.remove();
    if (S.settings().enableBlockDrag) dom.prepend(this.dragHandle(model.from, model.to));
    let table = dom.querySelector("table");
    if (!table) {
      const scroll = document.createElement("div"); scroll.className = "table-wrap";
      table = document.createElement("table"); table.className = "markdown-table"; scroll.append(table); dom.append(scroll);
    }
    while (table.rows.length > model.rows.length) table.deleteRow(-1);
    model.rows.forEach((row, r) => {
      const tr = table!.rows[r] || table!.insertRow();
      while (tr.cells.length > row.length) tr.deleteCell(-1);
      row.forEach((cell, c) => {
        const td = tr.cells[c] || tr.insertCell(); td.style.textAlign = model.align[c] || "left";
        td.dataset.sourceFrom = String(cell.from); td.dataset.sourceTo = String(cell.to); td.dataset.row = String(r); td.dataset.col = String(c);
        if (this.cell?.element === td) { this.cell.tableFrom = model.from; return; }
        if (td.dataset.raw !== cell.text || td.dataset.semanticKey !== this.semanticKey) {
          td.replaceChildren(); td.dataset.raw = cell.text;
          td.dataset.semanticKey = this.semanticKey;
          const task = /^(\s*(?:[-*+]\s+)?)(\[[ xX]\])\s*(.*)$/.exec(cell.text);
          if (task) {
            const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "task-checkbox"; checkbox.checked = /x/i.test(task[2]); checkbox.setAttribute("aria-label", "切换任务完成状态");
            checkbox.onchange = () => this.view.dispatch({ changes: { from: Number(td.dataset.sourceFrom) + task[1].length + 1, to: Number(td.dataset.sourceFrom) + task[1].length + 2, insert: checkbox.checked ? "x" : " " }, userEvent: "input.task" });
            td.append(checkbox); S.inline(td, task[3]);
          } else S.inline(td, cell.text);
          this.mapCellText(td, cell);
          const spans = [
            ...this.annotationSpans.map(s => ({ ...s, className: "annotation-change-highlight", attribute: "data-annotation-id" })),
            ...this.legacyHighlights.flatMap(m => m.ranges.map((r: any) => ({ from: r.start, to: r.end, id: m.id, className: `lp-legacy lp-highlight-${m.color}`, attribute: "data-legacy-id" })))
          ];
          for (const span of spans) {
            if (span.to <= cell.from || span.from >= cell.to) continue;
            const nodes: Text[] = [], walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) nodes.push(walker.currentNode as Text);
            for (const node of nodes) {
              const positions = this.textNodes.get(node); if (!positions) continue;
              const indices = positions.slice(0, node.length).map((p, i) => p >= span.from && p < span.to ? i : -1).filter(i => i >= 0);
              if (!indices.length) continue;
              node.splitText(indices.at(-1)! + 1); const selected = node.splitText(indices[0]);
              const mark = document.createElement("mark"); mark.className = span.className; mark.setAttribute(span.attribute, span.id); selected.replaceWith(mark); mark.append(selected);
            }
            this.mapCellText(td, cell);
          }
        }
        this.mapCellText(td, cell);
        const marks = window.ReaderHighlightFormat.parse(cell.text).marks;
        td.querySelectorAll("mark.reading-native-highlight").forEach((el, i) => { if (marks[i]) (el as HTMLElement).dataset.nativeStart = String(cell.from + marks[i].start); });
        td.querySelectorAll("button.cite-ref").forEach(button => {
          const number = button.textContent!.trim(); (button as HTMLElement).dataset.citeNumber = number;
          (button as HTMLElement).onclick = e => { e.stopPropagation(); this.jumpCitation(number, cell.from); };
        });
        td.onmouseup = e => {
          if (!window.getSelection()?.isCollapsed || this.selectingTable || (e.target as Element).closest("button,input,a,mark")) return;
          this.openCell(td, model.from, r, c);
        };
      });
    });
  }
  private mapCellText(td: HTMLElement, cell: TableCell) {
    const parsed = window.ReaderHighlightFormat.parse(cell.text), walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
    let node: Node | null, index = 0;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest(".reader-math, .footnote-ref, button")) continue;
      const points: number[] = [];
      for (let offset = 0; offset < (node.textContent || "").length; offset++) {
        const char = node.textContent![offset];
        const at = parsed.text.indexOf(/\s/.test(char) ? " " : char, index);
        points.push(cell.from + (at >= 0 ? parsed.points[at] : 0)); if (at >= 0) index = at + char.length;
      }
      points.push(cell.from + (parsed.ends[index - 1] ?? cell.text.length)); this.textNodes.set(node, points);
    }
  }
  private openCell(element: HTMLElement, tableFrom: number, row: number, col: number) {
    this.closeCell();
    const model = this.tables.find(t => t.from === tableFrom), cell = model?.rows[row]?.[col]; if (!cell) return;
    element.replaceChildren(); element.dataset.raw = ""; element.classList.add("lp-cell-active");
    const view = new EditorView({ parent: element, state: EditorState.create({ doc: cell.text, extensions: this.extensions(true) }) });
    this.cell = { view, element, tableFrom, row, col }; view.focus();
    view.dispatch({ effects: refresh.of(null) });
  }
  private cellSourceFrom() { const cell = this.cell; return cell ? this.tables.find(t => t.from === cell.tableFrom)?.rows[cell.row]?.[cell.col]?.from || 0 : 0; }
  private cellChanged(update: ViewUpdate) {
    if (!this.cell || this.replacingRemote || this.updatingCell) return;
    const sourceFrom = this.cellSourceFrom(), changes: TextChange[] = [];
    update.changes.iterChanges((from, to, _a, _b, inserted) => changes.push({ from: sourceFrom + from, to: sourceFrom + to, insert: inserted.toString().replace(/\n/g, "<br>") }));
    this.view.dispatch({ changes, userEvent: "input.table" });
  }
  closeCell() {
    const cell = this.cell; if (!cell) return; this.cell = undefined;
    cell.view.destroy(); cell.element.classList.remove("lp-cell-active"); cell.element.dataset.raw = "";
    const table = this.tables.find(t => t.from === cell.tableFrom); if (table && cell.element.closest(".lp-table")) this.updateTable(cell.element.closest(".lp-table") as HTMLElement, table);
  }
  navigateCell(dr: number, dc: number) {
    const cell = this.cell; if (!cell) return false;
    const table = this.tables.find(t => t.from === cell.tableFrom); if (!table) return false;
    let r = cell.row + dr, c = cell.col + dc;
    if (dc && c >= table.rows[r].length) { r++; c = 0; }
    if (dc && c < 0) { r--; c = r >= 0 ? table.rows[r].length - 1 : 0; }
    const container = cell.element.closest(".lp-table"); this.closeCell();
    const td = container?.querySelector(`td[data-row="${r}"][data-col="${c}"]`) as HTMLElement;
    if (td) this.openCell(td, table.from, r, c); else this.goto(Math.min(table.to + 1, this.view.state.doc.length));
    return true;
  }

  private sourcePosition(node: Node, offset: number): number | null {
    const mapped = this.textNodes.get(node); if (mapped) return mapped[Math.min(offset, mapped.length - 1)];
    if (this.cell?.view.dom.contains(node)) return this.cellSourceFrom() + this.cell.view.posAtDOM(node, offset);
    try { return this.view.posAtDOM(node, offset); } catch { return null; }
  }
  selectionRange(): { from: number; to: number; rect: DOMRect | any } | null {
    const native = window.getSelection();
    if (native?.rangeCount && !native.isCollapsed && this.selectingTable) {
      const range = native.getRangeAt(0), from = this.sourcePosition(range.startContainer, range.startOffset), to = this.sourcePosition(range.endContainer, range.endOffset);
      if (from !== null && to !== null) return { from: Math.min(from, to), to: Math.max(from, to), rect: range.getBoundingClientRect() };
    }
    const view = this.cell?.view || this.view; if (!view) return null;
    const selection = view.state.selection.main; if (selection.empty) return null;
    const base = this.cell ? this.cellSourceFrom() : 0;
    const coords = view.coordsAtPos(selection.to);
    return { from: selection.from + base, to: selection.to + base, rect: coords ? { left: coords.left, right: coords.right, top: coords.top, bottom: coords.bottom, width: coords.right - coords.left, height: coords.bottom - coords.top } : { left: 10, top: 10, bottom: 30, width: 1, height: 20 } };
  }
  captureHighlight(): any {
    const selection = this.selectionRange(); if (!selection) return null;
    const parsed = this.parsed, segments = [];
    for (const region of parsed.regions) {
      const indexes: number[] = [];
      for (let i = region.textStart; i < region.textEnd; i++) if (parsed.points[i] >= selection.from && parsed.ends[i] <= selection.to) indexes.push(i);
      if (!indexes.length) continue;
      const lo = indexes[0], hi = indexes.at(-1)! + 1, exact = parsed.text.slice(lo, hi); if (!exact.trim()) continue;
      segments.push({ exact, prefix: "", suffix: "", blockText: parsed.text.slice(region.textStart, region.textEnd), textStart: lo - region.textStart,
        textEnd: hi - region.textStart, lineStart: region.line, lineEnd: region.line, ...(region.cellIndex !== undefined ? { cellIndex: region.cellIndex } : {}) });
    }
    const skipped = parsed.opaqueRanges.some((r: any) => selection.from < r.end && selection.to > r.start);
    if (!segments.length) return skipped ? { unsupportedOnly: true } : null;
    return { id: `highlight-${Date.now()}`, exact: segments.map(s => s.exact).join(" "), prefix: "", suffix: "", occurrences: 1, color: "yellow", comment: "", segments, rect: selection.rect, skipped };
  }
  annotationSelection() {
    const selection = this.selectionRange(), mark = this.captureHighlight(); if (!selection || !mark?.exact) return null;
    const line = this.view.state.doc.lineAt(selection.from).number, h = this.headings.filter(h => h.line <= line).at(-1);
    return { selectedText: mark.exact, lineStart: line, lineEnd: this.view.state.doc.lineAt(selection.to).number, heading: h?.text || "", anchor: h?.anchor || "", rect: selection.rect };
  }
  highlightAt(event: MouseEvent | PointerEvent): any[] {
    const legacy = (event.target as Element).closest("[data-legacy-id]") as HTMLElement;
    if (legacy) {
      const item = this.legacyHighlights.find(m => m.id === legacy.dataset.legacyId);
      return item ? [{ ...item, ranges: undefined, rect: legacy.getBoundingClientRect() }] : [];
    }
    const element = (event.target as Element).closest("mark[data-native-start]") as HTMLElement;
    if (!element) return [];
    const start = Number(element.dataset.nativeStart), mark = this.parsed.marks.find((m: any) => m.start === start);
    if (!mark) return [];
    return [{ id: `native-${start}`, exact: mark.markdown, prefix: "", suffix: "", occurrences: 1, color: "yellow", comment: mark.comment,
      nativeStart: start, rect: element.getBoundingClientRect(), groupSize: mark.footnoteId ? this.parsed.marks.filter((m: any) => m.footnoteId === mark.footnoteId).length : 1 }];
  }
  annotationPosition(annotation: any): number {
    const span = this.annotationSpans.find(s => s.id === annotation.id); if (span) return span.from;
    for (const quote of [...S.annotationQuotes(annotation), annotation.quote]) {
      const normalized = String(quote).replace(/\s+/g, " ").trim(), at = this.parsed.text.indexOf(normalized);
      if (normalized && at >= 0) return this.parsed.points[at];
    }
    return this.view.state.doc.line(Math.max(1, Math.min((annotation.targetLine || 0) + 1, this.view.state.doc.lines))).from;
  }
  private updateAsides() {
    if (!this.view) return;
    this.analyze(this.view.state);
    S.asides(this.view.state.doc.toString(), this.headings, this.annotations, this.parsed);
    this.scrollSpy();
  }
  scrollSpy() {
    if (!this.view) return;
    const pos = this.view.posAtCoords({ x: this.view.contentDOM.getBoundingClientRect().left + 10, y: Math.max(20, this.view.dom.getBoundingClientRect().top + 5) }, false) || 0;
    const line = this.view.state.doc.lineAt(Math.min(pos, this.view.state.doc.length)).number;
    const h = this.headings.filter(h => h.line <= line).at(-1) || this.headings[0];
    document.querySelectorAll("#toc a[data-anchor]").forEach(a => a.classList.toggle("toc-active", (a as HTMLElement).dataset.anchor === h?.anchor));
  }
  moveBlock(from: number, to: number, target: number) {
    if (target >= from && target <= to) return;
    let raw = this.view.state.sliceDoc(from, to);
    if (target < this.view.state.doc.length && !raw.endsWith("\n\n")) raw += raw.endsWith("\n") ? "\n" : "\n\n";
    this.view.dispatch({ changes: [{ from, to, insert: "" }, { from: target, to: target, insert: raw }].sort((a, b) => a.from - b.from), userEvent: "input.move" });
  }
  startDrag(from: number, to: number) { this.dragFrom = { from, to }; }
  blockEnd(to: number, doc: EditorState["doc"] | undefined = this.view?.state.doc) {
    if (!doc) return to;
    let line = doc.lineAt(Math.min(to, doc.length)).number;
    while (line < doc.lines && !doc.line(line + 1).text.trim()) line++;
    return Math.min(doc.line(line).to + 1, doc.length);
  }
  dragHandle(from: number, to: number) {
    return new MarkerWidget(this, from, this.blockEnd(to), "", "drag").toDOM();
  }
}

window.LivePreview = new LiveEditor();
S.post({ type: "ready" });
