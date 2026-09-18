const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { chromium } = require("@playwright/test");
const math = require("../media/readerMath");
const { extractMarkdownHeadings } = require("../out/markdownHeadings");
const root = path.resolve(__dirname, "..");

for (const raw of ["$x_i$", "$$ p_i=P_\\theta(t_i\\mid t_1) $$", "\\(x+1\\)", "\\[x^2\\]", "$3$"]) {
  const result = math.protect(raw);
  assert.equal(result.items.length, 1, raw);
  assert.equal(math.restoreText(result.text, result), raw);
}
for (const raw of ["`$x$`", "``$x$``", "<code>$x$</code>", "\\$x\\$", "价格 $5 和 $10", "$unclosed", "[链接](https://example.com/$x$)"]) {
  assert.equal(math.protect(raw).items.length, 0, raw);
}
assert.equal(math.readBlock(["$$", "x_1 +", "x_2", "$$"], 0).endLine, 3);
assert.equal(math.readBlock(["$$", "x", "```", "$$"], 0), null);

async function main() {
  const extension = fs.readFileSync(path.join(root, "src/extension.ts"), "utf8");
  const values = {
    nonce: "math-test", "webview.cspSource": "'self'", cssUri: "/media/report.css", jsUri: "/media/reportViewer.js",
    mermaidUri: "/media/mermaid.min.js", katexUri: "/media/katex/katex.min.js", katexCssUri: "/media/katex/katex.min.css",
    mathUri: "/media/readerMath.js", highlightFormatUri: "/media/highlightFormat.js", highlightsUri: "/media/readerHighlights.js", wysiwygUri: "/media/wysiwygEditor.js"
  };
  const html = extension.match(/return `(<\!doctype html>[\s\S]*?<\/html>)`;/)[1].replace(/\$\{([^}]+)\}/g, (_, key) => {
    assert(key in values, `Unknown webview template value: ${key}`);
    return values[key];
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (req.url === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
    const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const type = { ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" }[path.extname(file)];
    res.setHeader("Content-Type", type || "application/octet-stream"); res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const executablePath = [process.env.MATH_BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => p && fs.existsSync(p));
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(() => {
      window.sentMessages = [];
      window.acquireVsCodeApi = () => ({ postMessage: (message) => window.sentMessages.push(message), getState: () => ({}), setState: () => {} });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addStyleTag({ content: ':root { --vscode-editor-background:#111111; --vscode-editor-foreground:#cccccc; --vscode-sideBar-background:#171717; --vscode-descriptionForeground:#aaaaaa; --vscode-panel-border:#333333; --vscode-font-family:"Segoe UI",sans-serif; }' });
    async function render(content) {
      await page.evaluate(({ content, headings }) => window.postMessage({ type: "render", payload: { title: "LaTeX 公式", files: [{ name: "math-demo.md", label: "公式", content, headings }] } }, "*"), { content, headings: extractMarkdownHeadings(content, "公式") });
      await page.waitForFunction((text) => latestDocumentText === text, content);
    }
    const content = fs.readFileSync(path.join(root, "docs/fixtures/math-demo.md"), "utf8");
    await render(content);
    const main = page.locator("#reportContent");
    assert.equal(await main.locator(".reader-math-display").count(), 5);
    assert.equal(await main.locator(".reader-math-error").count(), 1);
    assert.equal(await main.locator(".katex").count(), 15);
    assert.equal(await main.locator("table tbody tr").first().locator("td").count(), 2);
    assert.equal(await main.locator("pre code").innerText(), "$$ x_i = \\frac{a}{b} $$");
    assert((await main.innerText()).includes("价格 $5 和 $10"));
    assert.equal(await main.locator("strong .katex").count(), 1);
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.fonts.check('16px KaTeX_Main')));
    const screenshots = path.join(os.tmpdir(), "markdown-reader-math-qa");
    fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, "desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.getElementById("tocDock").classList.add("collapsed"));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page must not overflow on mobile");
    assert(await main.locator(".reader-math-display").last().evaluate((node) => node.scrollWidth > node.clientWidth), "Long formulas must scroll locally");
    await page.screenshot({ path: path.join(screenshots, "narrow.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });

    // Real editing events must serialize the original TeX, never KaTeX's duplicated DOM text.
    const editableSource = "# 编辑验证\n\n概率 $p_i$ 和 \\(x_i\\)。\n\n| 项目 | 公式 |\n| --- | --- |\n| 概率 | $P(A|B)$ |\n\n$$\nx_i+y_i\n$$\n";
    await render(editableSource);
    await page.evaluate(() => { document.body.classList.add("wysiwyg-mode"); window.MeowWysiwyg.refresh(); });
    const paragraph = main.locator("p.md-block").filter({ hasText: "概率" }).first();
    await paragraph.evaluate((node) => { node.focus(); node.append(document.createTextNode("追加文字")); node.dispatchEvent(new Event("input", { bubbles: true })); node.blur(); });
    await page.waitForFunction(() => sentMessages.some((m) => m.type === "saveContent" && m.content.includes("追加文字")));
    let saved = await page.evaluate(() => sentMessages.filter((m) => m.type === "saveContent").at(-1).content);
    assert(saved.includes("概率 $p_i$ 和 \\(x_i\\)。追加文字"));
    assert(saved.includes("$$\nx_i+y_i\n$$"));
    const cell = main.locator("table tbody tr td").first();
    await cell.evaluate((node) => { node.focus(); node.append(document.createTextNode("修改")); node.blur(); });
    await page.waitForFunction(() => sentMessages.some((m) => m.type === "saveContent" && m.content.includes("概率修改")));
    saved = await page.evaluate(() => sentMessages.filter((m) => m.type === "saveContent").at(-1).content);
    assert(saved.includes("| --- | --- |"));
    assert(saved.includes("| 概率修改 | $P(A|B)$ |"));
    assert((await page.evaluate(() => serializeDocumentMarkdown())).includes("$$\nx_i+y_i\n$$"), "Drag serialization preserves blocks");
    await page.evaluate(() => document.body.classList.remove("wysiwyg-mode"));
    await render(saved);
    assert.equal(await main.locator(".reader-math-error").count(), 0);
    assert.equal(await main.locator(".katex").count(), 4);
    assert.deepEqual(errors, []);
    console.log(`Math rendering, source preservation, table editing, fonts and narrow layout passed. Screenshots: ${screenshots}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
