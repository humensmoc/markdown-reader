const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/extension.ts"), "utf8");
let activeDocument;
const vscode = {
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  WorkspaceEdit: class {
    edits = [];
    replace(uri, range, text) { this.edits.push({ ...range, text }); }
    insert(uri, position, text) { this.edits.push({ start: position, end: position, text }); }
  },
  workspace: {
    async applyEdit(edit) {
      for (const { start, end, text } of edit.edits.sort((a, b) => b.start - a.start)) {
        activeDocument.content = activeDocument.content.slice(0, start) + text + activeDocument.content.slice(end);
      }
      return true;
    }
  }
};
const backend = { exports: {}, require: (name) => name === "vscode" ? vscode : name === "path" ? path : {} };
vm.createContext(backend);
vm.runInContext(ts.transpileModule(`${source}\nexports.TestProvider = ReportMarkdownEditorProvider;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, backend);
const provider = new backend.exports.TestProvider({});

const viewerSource = fs.readFileSync(path.join(root, "media/reportViewer.js"), "utf8");
const viewerAst = ts.createSourceFile("viewer.js", viewerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = viewerAst.statements.filter(ts.isFunctionDeclaration).map((node) => node.getText(viewerAst)).join("\n");
const frontend = {};
vm.createContext(frontend);
vm.runInContext(functions, frontend);

function document(content) {
  activeDocument = { content, uri: "test.md", getText() { return this.content; }, positionAt(offset) { return offset; }, async save() { return true; } };
  return activeDocument;
}
function annotation(status = "pending_review", id = "test") {
  return [
    "<!-- mr-annotation:start", `id: "${id}"`, 'quote: "原文"',
    ...(status ? [`status: "${status}"`] : []),
    'change_quotes: ["修改后正文"]', 'custom_field: "保留"',
    'resolved_at: "old-time"', "-->", "> **批注：原文**", ">", "> 原要求",
    ">", "> **AI 回复：**", ">", "> 上次改动说明", "<!-- mr-annotation:end -->"
  ].join("\n");
}
function parsed(doc) { return frontend.preprocessMarkdownContent(doc.content).annotations; }

async function verify() {
  for (const eol of ["\n", "\r\n"]) {
    const prefix = '---\ntags: [test]\n---\n# 标题\n\n修改后正文\n\n';
    const oldGuide = "<!-- mr-annotation:ai-guide\n旧版指南\n-->\n\n";
    const sibling = annotation("open", "untouched");
    const doc = document((prefix + oldGuide + annotation() + "\n\n" + sibling).replace(/\n/g, eol));
    await provider.updateAnnotation(doc, { annotationId: "test", comment: "验收失败，请补充条件", status: "open" });
    let item = parsed(doc)[0];
    assert.equal(item.status, "open");
    assert.equal(item.body, "验收失败，请补充条件");
    assert.equal(item.reply, "上次改动说明");
    assert.equal(item.resolvedAt, "");
    assert.equal(item.changeQuotes[0], "修改后正文");
    assert(doc.content.startsWith(prefix.replace(/\n/g, eol)), "Preserve body and frontmatter");
    assert(doc.content.endsWith(sibling.replace(/\n/g, eol)), "Preserve unrelated annotation");
    assert(doc.content.includes('custom_field: "保留"'));
    assert(!doc.content.includes("旧版指南"));
    assert.equal((doc.content.match(/mr-annotation:ai-guide/g) || []).length, 1);
    assert(doc.content.includes('status 改为 "pending_review"'));
    if (eol === "\r\n") assert(!/(?<!\r)\n/.test(doc.content), "Preserve CRLF");

    await provider.updateAnnotation(doc, { annotationId: "test", comment: "修订要求", status: "pending_review" });
    assert.equal(parsed(doc)[0].status, "pending_review");
    await provider.updateAnnotation(doc, { annotationId: "test", comment: "只改文字" });
    assert.equal(parsed(doc)[0].status, "pending_review", "Omitted status preserves current state");
    assert.equal((doc.content.match(/mr-annotation:ai-guide/g) || []).length, 1);
    const beforeInvalid = doc.content;
    await assert.rejects(provider.updateAnnotation(doc, { annotationId: "test", comment: "test", status: "resolved" }));
    assert.equal(doc.content, beforeInvalid, "Reject resolving through edit message");
    await provider.resolveAnnotation(doc, { annotationId: "test" });
    item = parsed(doc)[0];
    assert.equal(item.status, "resolved");
    assert(Number.isFinite(Date.parse(item.resolvedAt)));
    assert.equal(item.reply, "上次改动说明");
  }

  const legacy = document("# 原正文\n\n" + annotation(null));
  assert.equal(parsed(legacy)[0].status, "open");
  await provider.updateAnnotation(legacy, { annotationId: "test", comment: "补充要求", status: "pending_review" });
  assert.equal(parsed(legacy)[0].status, "pending_review");
  assert.equal((legacy.content.match(/mr-annotation:ai-guide/g) || []).length, 1);
  assert(legacy.content.startsWith("# 原正文\n\n"));

  const fresh = document("# 新文档\n");
  await provider.insertAnnotation(fresh, { selectedText: "新文档", comment: "请修改" });
  assert.equal(parsed(fresh)[0].status, "open");
  assert(fresh.content.includes("pending_review"));
  console.log("Annotation workflow verification passed: pending review, reopen, resolve, guide upgrade, legacy metadata, preservation and CRLF.");
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
