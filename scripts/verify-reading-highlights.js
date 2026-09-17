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
assert.throws(() => create("==选择文字=="), /已有高亮/);
assert.throws(() => create("选择\n文字", { exact: "选择 文字" }), /同一段/);
assert.equal(create("**选择文字**"), "==**选择文字**==");
assert.equal(create("**前选择文字后**"), "**前==选择文字==后**");
assert.equal(create("[选择文字](https://example.com)"), "==[选择文字](https://example.com)==");
assert.equal(create("`选择文字`"), "==`选择文字`==");
assert.equal(format.parse("`==不是高亮==`\n\n\\==也不是==").marks.length, 0);
const legacyRaw = JSON.stringify({ ...example, comment: "旧评论", color: "pink" });
const legacy = "选择文字\n\n<!-- mr-highlight " + legacyRaw + " -->\n";
const converted = updateReadingHighlight(legacy, { type: "saveReadingHighlight", highlight: { ...example, comment: "新评论" }, expected: legacyRaw, expectedDocument: legacy });
assert(converted.includes("==选择文字==[^mark-"));
assert(!converted.includes("mr-highlight"));
console.log("Native Markdown persistence passed: highlight/footnote CRUD, manual syntax, shared footnotes, conflicts, formatting, legacy conversion and CRLF.");

async function browserTests() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const http = require("node:http");
  const source = fs.readFileSync(path.join(root, "src/extension.ts"), "utf8");
  let html = source.slice(source.indexOf("<!doctype html>"), source.indexOf("</html>`") + 7);
  for (const [name, value] of Object.entries({ nonce: "test", cssUri: "/media/report.css", jsUri: "/media/reportViewer.js", highlightsUri: "/media/readerHighlights.js", highlightFormatUri: "/media/highlightFormat.js", mermaidUri: "/media/mermaid.min.js", wysiwygUri: "/media/wysiwygEditor.js", "webview.cspSource": "'self'" })) html = html.split("${" + name + "}").join(value);
  html = html.replace("</head>", `<style nonce="test">:root { --vscode-editor-background:#fff; --vscode-sideBar-background:#f8f9fb; --vscode-editor-foreground:#252a34; --vscode-descriptionForeground:#667085; --vscode-panel-border:#dde1e8; --vscode-editorWidget-border:#c3cad4; }</style></head>`);
  const server = http.createServer((req, res) => {
    if (req.url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
    const relative = req.url.split("?")[0];
    if (!/^\/media\/[a-zA-Z.]+$/.test(relative)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", relative.endsWith(".css") ? "text/css" : "application/javascript");
    res.end(fs.readFileSync(path.join(root, relative)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let documentText = "# 阅读高亮测试\n\n选择文字可以高亮，也可以添加评论。\n\n第二段有 **加粗文字** 和普通内容。\n\n重复文字在这里。\n\n不同上下文中也有重复文字。\n\n| 项目 | 说明 |\n| --- | --- |\n| 表格 | 跨节点高亮测试 |\n";
    const payload = () => ({ ok: true, title: "test.md", files: [{ name: "test.md", label: "test", content: documentText, headings: extractMarkdownHeadings(documentText, "test") }] });
    async function render() { await page.evaluate((payload) => window.postMessage({ type: "render", payload }, "*"), payload()); }
    await page.exposeFunction("hostMessage", async (message) => {
      if (message.type === "saveReadingHighlight" || message.type === "deleteReadingHighlight") {
        try {
          documentText = updateReadingHighlight(documentText, message);
          await render();
          await page.evaluate(() => window.postMessage({ type: "readingHighlightSaved" }, "*"));
        } catch (error) { await page.evaluate((message) => window.postMessage({ type: "readingHighlightError", message }, "*"), error.message); }
      }
    });
    await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: (message) => window.hostMessage(message) }); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await render();
    await page.waitForSelector(".markdown-body p");
    async function select(text, occurrence = 0) {
      await page.evaluate(({ text, occurrence }) => {
        const walker = document.createTreeWalker(document.querySelector(".markdown-body .content-root"), NodeFilter.SHOW_TEXT);
        let node, seen = 0;
        while ((node = walker.nextNode())) {
          const index = node.data.indexOf(text);
          if (index < 0 || seen++ !== occurrence) continue;
          const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + text.length);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return;
        }
        throw Error("Selection text missing: " + text);
      }, { text, occurrence });
      await page.waitForSelector(".annotation-action:not([hidden])");
    }
    async function waitCount(count) {
      await page.waitForFunction((count) => !ReaderHighlights.isOpen() && Array.from(CSS.highlights).filter(([key]) => key.startsWith("reader-")).reduce((n, [, h]) => n + h.size, 0) === count, count);
    }
    await select("选择文字");
    await page.getByRole("button", { name: "高亮选中文字", exact: true }).click();
    await waitCount(1);
    assert(documentText.includes("==选择文字=="));
    assert(!documentText.includes("mr-highlight"));
    await page.reload(); await render(); await waitCount(1);
    async function clickHighlight(index = 0) {
      const el = page.locator(".markdown-body mark.reading-native-highlight").nth(index);
      await el.click(); await page.waitForSelector(".reading-highlight-panel");
    }
    await clickHighlight();
    await page.locator("#readingHighlightComment").fill("之后再看");
    await page.locator("#readingHighlightComment").press("Enter");
    await waitCount(1);
    await page.waitForSelector(".footnotes");
    assert(documentText.includes(": 之后再看"));
    assert.equal(format.parse(documentText).marks[0].comment, "之后再看");
    assert((await page.locator(".footnotes").textContent()).includes("之后再看"));
    await clickHighlight();
    assert.equal(await page.locator("#readingHighlightComment").inputValue(), "之后再看");
    await page.locator("#readingHighlightComment").fill("输入法测试");
    await page.locator("#readingHighlightComment").evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
    assert.equal(await page.locator(".reading-highlight-panel").count(), 1);
    await page.locator("#readingHighlightComment").press("Escape");
    await select("加粗文字");
    await page.getByRole("button", { name: "高亮选中文字", exact: true }).hover();
    await page.waitForSelector(".reading-highlight-panel");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await waitCount(2);
    assert(documentText.includes("==**加粗文字**=="));
    assert.equal(await page.locator("mark.reading-native-highlight strong").textContent(), "加粗文字");
    await select("重复文字", 1);
    await page.getByRole("button", { name: "高亮选中文字", exact: true }).click();
    await waitCount(3);
    assert(documentText.includes("不同上下文中也有==重复文字=="));
    documentText = "插入新段落，不应改变已有高亮位置。\n\n" + documentText;
    await render(); await page.waitForSelector("text=插入新段落，不应改变已有高亮位置。"); await waitCount(3);
    const serialized = await page.evaluate(() => serializeDocumentMarkdown());
    assert.equal(format.parse(serialized).marks.length, 3);
    assert.equal(format.parse(serialized).marks[0].comment, "之后再看");
    await page.setViewportSize({ width: 390, height: 844 });
    await clickHighlight();
    assert(await page.locator(".reading-highlight-panel").evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    const output = process.env.HIGHLIGHT_TEST_OUTPUT || require("node:os").tmpdir();
    await page.screenshot({ path: path.join(output, "markdown-reader-highlight-mobile.png") });
    await page.getByRole("button", { name: "删除高亮", exact: true }).click();
    await waitCount(2);
    assert(!documentText.includes(": 之后再看"));
    assert(documentText.includes("选择文字可以高亮"));
    await page.setViewportSize({ width: 1280, height: 820 });
    await select("选择文字");
    await page.getByRole("button", { name: "AI 批注", exact: true }).click();
    await page.waitForSelector(".annotation-compose-dialog");
    await page.getByRole("button", { name: "取消", exact: true }).click();
    // Handwritten Obsidian format, including a reference after punctuation.
    documentText = "# ==标题高亮==\n\n这是一段==重要内容==。[^mark1]\n\n[^mark1]: 之后再看\n";
    await render(); await page.waitForSelector("h1 mark"); await waitCount(2);
    await clickHighlight(1);
    assert.equal(await page.locator("#readingHighlightComment").inputValue(), "之后再看");
    await page.screenshot({ path: path.join(output, "markdown-reader-highlight-desktop.png") });
    await page.getByRole("button", { name: "取消", exact: true }).click();
    // WYSIWYG must serialize highlight delimiters and the footnote reference.
    await page.evaluate(() => { document.body.classList.add("wysiwyg-mode"); window.MeowWysiwyg.refresh(); });
    await page.waitForFunction(() => CSS.highlights.get("reader-yellow").size === 0);
    const editable = page.locator("p.md-block[contenteditable=true]");
    await editable.evaluate((el) => { el.appendChild(document.createTextNode("补充")); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("blur")); });
    await page.waitForFunction(() => latestDocumentText.includes("补充"));
    const edited = await page.evaluate(() => latestDocumentText);
    assert(edited.includes("==重要内容==")); assert(edited.includes("[^mark1]"));
    documentText = edited;
    await page.evaluate(() => document.body.classList.remove("wysiwyg-mode"));
    await render(); await waitCount(2);
    // Legacy marks stay readable; save converts the selected record only.
    documentText = "选择文字\n\n<!-- mr-highlight " + legacyRaw + " -->\n";
    await render(); await page.waitForFunction(() => CSS.highlights.get("reader-pink").size === 1);
    const oldRect = await page.evaluate(() => { const r = [...CSS.highlights.get("reader-pink")][0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(oldRect.x, oldRect.y);
    await page.waitForSelector(".reading-highlight-panel");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await waitCount(1);
    assert(!documentText.includes("mr-highlight")); assert(documentText.includes("==选择文字=="));
    await page.evaluate(() => { document.documentElement.style.setProperty("--vscode-editor-background", "#1e2025"); document.documentElement.style.setProperty("--vscode-editor-foreground", "#e4e6eb"); document.documentElement.style.setProperty("--vscode-sideBar-background", "#292c33"); });
    await clickHighlight();
    await page.screenshot({ path: path.join(output, "markdown-reader-highlight-dark.png") });
    await page.getByRole("button", { name: "取消", exact: true }).click();
    documentText = "# 评论与引用\n\n这是一段==重要内容==。[^mark1] 引用来源 [cite: 21]\n\n[^mark1]: 第一行评论 **保留内容**\n    第二行评论\n    " + "很长的评论内容".repeat(100) + "\n\n[cite source] 21. 引用来源示例 https://example.com\n";
    await page.evaluate(() => document.body.classList.add("vscode-dark"));
    await render(); await waitCount(1);
    const ref = page.locator(".footnote-ref a");
    const cite = page.locator("button.cite-ref").first();
    const popover = page.locator("#citeHoverPopover");
    await ref.hover();
    await page.waitForSelector(".footnote-hover-popover:not([hidden])");
    assert((await popover.textContent()).includes("第一行评论 保留内容"));
    assert((await popover.textContent()).includes("第二行评论"));
    assert(!(await popover.textContent()).includes("↩"));
    assert.notEqual(await ref.evaluate((el) => getComputedStyle(el).color), await cite.evaluate((el) => getComputedStyle(el).color));
    await popover.hover();
    await page.waitForTimeout(300);
    assert(await popover.isVisible());
    await popover.locator(".cite-hover-summary").evaluate((el) => { el.scrollTop = 80; });
    assert(await popover.isVisible());
    await popover.locator(".cite-hover-summary").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, "markdown-reader-comment-hover-dark.png") });
    await page.keyboard.press("Escape");
    assert(await popover.isHidden());
    await ref.focus();
    await page.waitForSelector(".footnote-hover-popover:not([hidden])");
    await page.keyboard.press("Escape");
    assert.equal(await ref.getAttribute("aria-describedby"), null);
    await cite.hover();
    await page.waitForSelector(".cite-hover-popover:not(.footnote-hover-popover):not([hidden])");
    assert((await popover.textContent()).includes("引用来源示例"));
    await page.mouse.move(0, 0);
    await page.waitForSelector("#citeHoverPopover", { state: "hidden" });
    await page.evaluate(() => { document.body.classList.replace("vscode-dark", "vscode-light"); document.documentElement.style.colorScheme = "light"; document.documentElement.style.setProperty("--vscode-editor-background", "#fff"); document.documentElement.style.setProperty("--vscode-editor-foreground", "#252a34"); document.documentElement.style.setProperty("--vscode-sideBar-background", "#f8f9fb"); });
    await page.setViewportSize({ width: 390, height: 480 });
    await ref.hover();
    await page.waitForSelector(".footnote-hover-popover:not([hidden])");
    assert(await popover.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; }));
    await page.screenshot({ path: path.join(output, "markdown-reader-comment-hover-mobile.png") });
    await ref.click();
    assert(await popover.isHidden());
    await render();
    assert(await popover.isHidden());
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: native highlight/footnote save, manual format, reload, duplicate selection, formatting, serialization, WYSIWYG, legacy conversion, comment hover/focus/dismissal, long-comment scrolling, cite coexistence, dark/light themes, narrow layout and AI coexistence.");
    console.log("Screenshots: " + output);
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
if (process.argv.includes("--browser")) browserTests().catch((error) => { console.error(error); process.exitCode = 1; });
