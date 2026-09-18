const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { updateReadingHighlight } = require("../out/readingHighlights");
const { extractMarkdownHeadings } = require("../out/markdownHeadings");
const root = path.resolve(__dirname, "..");
const example = { id: "test-mark", exact: "选择文字", prefix: "", suffix: "", occurrences: 1, color: "yellow", comment: "" };
const raw = (text) => /^<!-- mr-highlight (\{.*\}) -->$/m.exec(text)?.[1];
const viewerSource = fs.readFileSync(path.join(root, "media/reportViewer.js"), "utf8");
const ast = ts.createSourceFile("viewer.js", viewerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const frontend = {};
vm.createContext(frontend);
vm.runInContext(ast.statements.filter(ts.isFunctionDeclaration).map((n) => n.getText(ast)).join("\n"), frontend);

const format = require("../media/highlightFormat");
const create = (content, changes = {}) => updateReadingHighlight(content, { type: "saveReadingHighlight", highlight: { ...example, ...changes }, expectedDocument: content });
const edit = (content, changes = {}, deleting = false) => updateReadingHighlight(content, {
  type: deleting ? "deleteReadingHighlight" : "saveReadingHighlight", expectedDocument: content,
  highlight: { ...example, nativeStart: format.parse(content).marks[0].start, ...changes }
});
for (const eol of ["\n", "\r\n"]) {
  const body = ["---", "tags: [test]", "---", "# 标题", "", "选择文字", ""].join(eol);
  let text = create(body);
  assert(text.includes("==选择文字=="));
  assert(!text.includes("mr-highlight"));
  assert.equal(format.parse(text).marks.length, 1);
  text = edit(text, { comment: "之后再看\n第二行评论" });
  assert(/==选择文字==\[\^mark-/.test(text));
  assert.equal(format.parse(text).marks[0].comment, "之后再看\n第二行评论");
  assert(text.includes(eol + "    第二行评论"));
  assert.equal(frontend.preprocessMarkdownContent(text).annotations.length, 0);
  const snapshot = text;
  text = edit(text, { comment: "修改评论" });
  assert.equal(format.parse(text).marks[0].comment, "修改评论");
  assert.throws(() => updateReadingHighlight(text, { type: "saveReadingHighlight", highlight: example, expectedDocument: snapshot }), /文档已变化/);
  text = edit(text, { comment: "" });
  assert(!text.includes("[^mark-"));
  text = edit(text, {}, true);
  assert.equal(text.trim(), body.trim());
  if (eol === "\r\n") assert(!/(?<!\r)\n/.test(text));
}
let manual = "这是一段==重要内容==。[^mark1]\n\n[^mark1]: 之后再看\n";
assert.equal(format.parse(manual).marks[0].comment, "之后再看");
manual = edit(manual, { exact: "重要内容", comment: "新评论" });
assert(manual.includes("==重要内容==[^mark-"));
assert(!manual.includes("[^mark1]"));
const shared = "==选择文字==[^shared] 和另一处[^shared]\n\n[^shared]: 共用评论\n";
const sharedDeleted = edit(shared, {}, true);
assert(sharedDeleted.includes("另一处[^shared]"));
assert(sharedDeleted.includes("[^shared]: 共用评论"));
assert.equal(create("重复文字。\n\n不同上下文的重复文字。", { exact: "重复文字", lineStart: 2, lineEnd: 2 }), "重复文字。\n\n不同上下文的==重复文字==。");
assert.throws(() => create("选择文字。选择文字。"), /唯一定位/);
assert.throws(() => create("```md\n选择文字\n```"), /定位/);
assert.equal(create("==选择文字=="), "==选择文字==");
assert.equal(create("选择\n文字", { exact: "选择 文字" }), "==选择==\n==文字==");
assert.equal(create("**选择文字**"), "==**选择文字**==");
assert.equal(create("**前选择文字后**"), "**前==选择文字==后**");
assert.equal(create("[选择文字](https://example.com)"), "==[选择文字](https://example.com)==");
assert.equal(create("`选择文字`"), "==`选择文字`==");
assert.equal(create("普通 | 选择文字", { exact: "普通 | 选择文字" }), "==普通 | 选择文字==");
assert.equal(create("前**加粗文字**后", { exact: "粗文字后" }), "前**加==粗文字==**==后==");
assert.equal(create("前[链接文字](https://example.com)后", { exact: "接文字后" }), "前[链==接文字==](https://example.com)==后==");
assert.equal(create("前==已有==[^old]后", { exact: "前已有后" }), "==前====已有==[^old]==后==");
assert.equal(create("甲 乙\\|丙", { exact: "甲 乙|丙" }), "==甲 乙\\|丙==");
for (const eol of ["\n", "\r\n"]) {
  const table = ["| 类别 | 说明 |", "| --- | --- |", "| 重复 | 重复 |", "| 空洞 | 细节 |"].join(eol);
  assert.equal(create(table, { exact: "重复 重复 空洞 细节" }),
    ["| 类别 | 说明 |", "| --- | --- |", "| ==重复== | ==重复== |", "| ==空洞== | ==细节== |"].join(eol));
  assert.equal(create(table, { segments: [{ exact: "重复", prefix: "", suffix: "", blockText: "重复", textStart: 0, textEnd: 2, lineStart: 2, lineEnd: 2, cellIndex: 1 }] }),
    table.replace("| 重复 | 重复 |", "| 重复 | ==重复== |"));
  const paragraphs = ["未选开头选中尾部", "", "> 引用文字", "", "- 列表内容", "  - 嵌套项目", "", "选中开头未选结尾"].join(eol);
  const changed = create(paragraphs, { exact: "选中尾部 引用文字 列表内容 嵌套项目 选中开头" });
  assert.equal(changed, ["未选开头==选中尾部==", "", "> ==引用文字==", "", "- ==列表内容==", "  - ==嵌套项目==", "", "==选中开头==未选结尾"].join(eol));
}
const groupSource = "第一段\n\n第二段";
let group = create(groupSource, { exact: "第一段 第二段", comment: "共享评论" });
assert.equal(format.parse(group).marks.length, 2);
assert.equal(format.parse(group).definitions.length, 1);
assert(format.parse(group).marks.every((m) => m.comment === "共享评论"));
group = edit(group, { comment: "统一更新" });
assert(format.parse(group).marks.every((m) => m.comment === "统一更新"));
const groupWithoutComment = edit(group, { comment: "" });
assert.equal(format.parse(groupWithoutComment).definitions.length, 0);
assert.equal(format.parse(groupWithoutComment).marks.length, 2);
group = edit(group, {}, true);
assert.equal(format.parse(group).marks.length, 1);
assert.equal(format.parse(group).marks[0].comment, "统一更新");
group = edit(group, {}, true);
assert.equal(group.trim(), groupSource);
const mathAndCode = "前文 $x$ 后文\n\n```js\nconst x = 1;\n```\n\n末尾";
const skipped = create(mathAndCode, { exact: "前文 后文 末尾" });
assert.equal(skipped, "==前文== $x$ ==后文==\n\n```js\nconst x = 1;\n```\n\n==末尾==");
assert.deepEqual(format.tableCells('| 甲\\|乙 | `a|b` | $|x|$ |').map((c) => c.text), ['甲\\|乙', '`a|b`', '$|x|$']);
assert.equal(format.parse("`==不是高亮==`\n\n\\==也不是==").marks.length, 0);
const legacyRaw = JSON.stringify({ ...example, comment: "旧评论", color: "pink" });
const legacy = "选择文字\n\n<!-- mr-highlight " + legacyRaw + " -->\n";
const converted = updateReadingHighlight(legacy, { type: "saveReadingHighlight", highlight: { ...example, comment: "新评论" }, expected: legacyRaw, expectedDocument: legacy });
assert(converted.includes("==选择文字==[^mark-"));
assert(!converted.includes("mr-highlight"));
console.log("Native Markdown persistence passed: highlight/footnote CRUD, manual syntax, shared footnotes, conflicts, formatting, legacy conversion and CRLF.");

if (process.argv.includes("--browser")) require("./verify-live-highlights").run().catch(error => { console.error(error); process.exitCode = 1; });
