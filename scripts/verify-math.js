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
  const h = await require('./live-test-harness').start(), { page } = h;
  try {
    await page.setViewportSize({ width: 1440, height: 6000 });
    const content = fs.readFileSync(path.join(root, 'docs/fixtures/math-demo.md'), 'utf8').replace(/\r\n/g, '\n');
    await h.load(content);
    assert.equal(await page.locator('.reader-math-display').count(), 5);
    assert.equal(await page.locator('.reader-math-error').count(), 1);
    assert.equal(await page.locator('.katex').count(), 15);
    assert.equal(await page.locator('table tr').nth(1).locator('td').count(), 2);
    assert((await page.locator('#reportContent').innerText()).includes('价格 $5 和 $10'));
    assert.equal(await page.locator('.lp-strong .katex').count(), 1);
    assert.equal(h.text(), content);
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.fonts.check('16px KaTeX_Main')));
    const screenshots = path.join(os.tmpdir(), 'markdown-reader-math-qa'); fs.mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, 'live-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.LivePreview.goto(window.LivePreview.bridge.text.indexOf('## 长公式')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.waitForTimeout(150);
    assert(await page.locator('.reader-math-display').last().evaluate(el => el.scrollWidth > el.clientWidth));
    await page.screenshot({ path: path.join(screenshots, 'live-narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const editable = '# 编辑\n\n正文 $p_i$ 和 \\(x_i\\)。\n\n| 项目 | 公式 |\n| --- | --- |\n| 概率 | $P(A|B)$ |\n\n$$\nx_i+y_i\n$$\n';
    await h.load(editable);
    await page.evaluate(() => window.LivePreview.goto(window.LivePreview.bridge.text.indexOf('正文') + 2));
    await page.keyboard.type('追加'); await h.idle(); assert(h.text().includes('正文追加 $p_i$'));
    await page.locator('.lp-table td').nth(2).click(); await page.keyboard.press('End'); await page.keyboard.type('修改'); await h.idle();
    assert(h.text().includes('| 概率修改 | $P(A|B)$ |')); assert(h.text().includes('$$\nx_i+y_i\n$$'));
    await page.keyboard.press('Escape');
    await page.locator('.lp-math-block').click();
    await page.keyboard.press('ArrowRight'); await page.keyboard.type(' '); await h.idle();
    assert(h.text().includes('x_i+y_i'));
    assert.deepEqual(h.errors, []);
    console.log('Math checks passed: original fixture, invalid/escaped/code math, nested formatting, fonts, source/table editing and narrow scrolling. Screenshots: ' + screenshots);
  } finally { if (h.errors.length) console.log(h.errors); await h.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
