const assert = require('node:assert/strict');
const { start } = require('./live-test-harness');
const format = require('../media/highlightFormat');
exports.run = async () => {
  const h = await start(), { page } = h;
  async function select(from, to) {
    await page.evaluate(({ from, to }) => { const e = window.LivePreview; e.view.focus(); e.view.dispatch({ selection: { anchor: from, head: to } }); }, { from, to });
    await page.waitForSelector('.annotation-action:not([hidden])');
  }
  async function quick() { await page.locator('.reading-highlight-quick').click(); await page.waitForFunction(() => !window.ReaderHighlights.isOpen()); await h.idle(); }
  try {
    const cases = [
      ['# H\n\n首段正文\n\n> 引用内容\n\n- 列表内容\n  - 嵌套文字\n\n末段文字\n', 6, -1, 5],
      ['# H\n\n前**加粗文字**后\n', 9, 15, 2],
      ['# H\n\n前[链接文字](https://example.com)后\n', 9, -1, 2],
      ['# H\n\n前文 $x$ 后文\n\n```js\nconst x = 1;\n```\n\n末尾\n', 5, -1, 3],
      ['# H\n\n自动折行的中文文字。'.repeat(1) + '继续写作。'.repeat(70) + '\n', 5, -1, 1]
    ];
    for (const [text, from, end, count] of cases) {
      await h.load(text); await select(from, end < 0 ? text.length - 1 : Math.min(end, text.length - 1)); await quick();
      assert.equal(format.parse(h.text()).marks.length, count, h.text());
    }
    const table = '# 表格\n\n| 类别 | 说明 |\n| --- | --- |\n| 重复 | 重复 |\n| 甲\\|乙 | `a|b` |\n\n最后一段\n';
    await h.load(table);
    // A native selection spanning separately rendered cells exercises source mapping.
    await page.evaluate(() => {
      const cells = document.querySelectorAll('.lp-table td'), range = document.createRange();
      range.setStart(cells[2].firstChild, 0); range.setEnd(cells[5].firstChild.firstChild || cells[5].firstChild, 3);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange')); document.dispatchEvent(new MouseEvent('mouseup'));
    });
    await page.waitForSelector('.annotation-action:not([hidden])'); await quick();
    assert.equal(format.parse(h.text()).marks.length, 4, h.text());
    assert(h.text().includes('==甲\\|乙==')); assert(h.text().includes('==`a|b`=='));
    await page.evaluate(() => window.LivePreview.goto(0));
    await page.locator('.lp-table mark').first().click();
    await page.locator('.reading-highlight-panel textarea').fill('共享批注');
    await page.locator('.reading-highlight-panel [data-action="save"]').click(); await page.waitForFunction(() => !ReaderHighlights.isOpen()); await h.idle();
    assert(format.parse(h.text()).marks.some(m => m.comment === '共享批注'));
    await page.locator('.lp-table mark').first().click(); await page.locator('.reading-highlight-panel [data-action="delete"]').click(); await page.waitForFunction(() => !ReaderHighlights.isOpen()); await h.idle();
    assert.equal(format.parse(h.text()).marks.length, 3);
    const legacy = { id: 'old-mark', exact: '旧高亮', prefix: '', suffix: '', occurrences: 1, color: 'pink', comment: '旧评论' };
    const old = '# H\n\n旧高亮\n\n<!-- mr-highlight ' + JSON.stringify(legacy) + ' -->\n';
    await h.load(old); assert.equal(await page.locator('.lp-legacy').innerText(), '旧高亮'); assert.equal(h.text(), old);
    await page.locator('.lp-legacy').click(); await page.locator('.reading-highlight-panel textarea').fill('新评论'); await page.locator('.reading-highlight-panel [data-action="save"]').click();
    await page.waitForFunction(() => !ReaderHighlights.isOpen()); await h.idle(); assert(!h.text().includes('mr-highlight')); assert(h.text().includes('==旧高亮=='));
    const annotated = '# 批注\n\n原始选文\n\n新增内容一\n\n新增内容二\n\n<!-- mr-annotation:start\nid: "a1"\nquote: "原始选文"\nstatus: "pending_review"\nchange_quotes: ["新增内容一", "新增内容二"]\n-->\n> **批注：原始选文**\n>\n> 修改要求\n>\n> **AI 回复：**\n> 已处理\n<!-- mr-annotation:end -->\n';
    await h.load(annotated); await page.waitForSelector(".annotation-card"); assert.equal(await page.locator('.annotation-card').count(), 1); assert.equal(await page.locator('.annotation-change-highlight').count(), 2);
    assert(!(await page.locator('#reportContent').innerText()).includes('mr-annotation')); assert.equal(h.text(), annotated);
    await page.locator('.annotation-card-quote').click();
    assert.deepEqual(h.errors, []);
    console.log('Live highlight checks passed: paragraphs, lists, nested formatting, links, skipped math/code, wrapping, cross-cell source selection, CRUD, legacy conversion and annotation coexistence.');
  } finally { if (h.errors.length) console.log(h.errors); await h.close(); }
};
if (require.main === module) exports.run().catch(e => { console.error(e); process.exitCode = 1; });
