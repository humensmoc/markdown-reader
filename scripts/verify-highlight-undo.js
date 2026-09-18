// Run with VS Code's --extensionTestsPath in an isolated user-data directory.
// Exercises the actual save-message branch with the real document undo stack.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

exports.run = async function () {
  const vscode = require("vscode");
  const root = path.resolve(__dirname, "..");
  const { updateReadingHighlight } = require(path.join(root, "out/readingHighlights"));
  const source = fs.readFileSync(path.join(root, "src/extension.ts"), "utf8");
  const ast = ts.createSourceFile("extension.ts", source, ts.ScriptTarget.Latest, true);
  let branch;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'message.type === "saveReadingHighlight" || message.type === "deleteReadingHighlight"') branch = node.thenStatement.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(branch, "Locate the production highlight message handler");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const handler = new AsyncFunction("document", "message", "vscode", "updateReadingHighlight", "postToWebview", "normalizeText",
    ts.transpileModule(branch, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-reader-undo-"));
  const resultPath = process.env.HIGHLIGHT_UNDO_RESULT || path.join(directory, "result.json");
  try {
    const before = "# 批量撤销\n\n| 类别 | 说明 |\n| --- | --- |\n| 重复 | 解释 |\n| 空洞 | 细节 |\n\n最后一段\n";
    const uri = vscode.Uri.file(path.join(directory, "batch.md"));
    fs.writeFileSync(uri.fsPath, before);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    const responses = [];
    const message = { type: "saveReadingHighlight", expectedDocument: before, highlight: {
      id: "undo-test", exact: "重复 解释 空洞 细节 最后一段", prefix: "", suffix: "", occurrences: 1, color: "yellow", comment: "整组评论"
    } };
    await handler(document, message, vscode, updateReadingHighlight, async (value) => responses.push(value), text => text.replace(/\r\n/g, "\n"));
    assert.equal(responses.at(-1).type, "readingHighlightSaved");
    const saved = document.getText();
    assert(saved.includes("| ==重复==[^mark-group-undo-test]"));
    assert(saved.includes("==最后一段==[^mark-group-undo-test]"));
    assert.equal(fs.readFileSync(uri.fsPath, "utf8"), saved);
    await vscode.commands.executeCommand("undo");
    assert.equal(document.getText(), before, "One undo restores all cells, paragraphs and comment");
    await vscode.commands.executeCommand("redo");
    assert.equal(document.getText(), saved, "One redo restores the batch");
    await handler(document, message, vscode, updateReadingHighlight, async (value) => responses.push(value), text => text.replace(/\r\n/g, "\n"));
    assert.equal(responses.at(-1).type, "readingHighlightError");
    assert.equal(document.getText(), saved, "Stale selection cannot partially change the document");
    await document.save();
    fs.writeFileSync(resultPath, JSON.stringify({ ok: true, vscode: vscode.version, checks: ["batch save", "one undo", "one redo", "stale selection atomicity"] }, null, 2));
  } catch (error) {
    fs.writeFileSync(resultPath, JSON.stringify({ ok: false, error: String(error.stack || error) }, null, 2));
    throw error;
  }
};
