const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { start } = require('./live-test-harness');

// Locate actual rendered characters, independently of CodeMirror's height map.
async function textPoint(page, needle, offset = 1) {
  return page.evaluate(({ needle, offset }) => {
    const root = document.querySelector('#reportContent > .cm-editor > .cm-scroller > .cm-content');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const at = node.textContent.indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange(); range.setStart(node, at + offset); range.setEnd(node, at + offset + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: (rect.top + rect.bottom) / 2 };
    }
    throw Error(`Missing rendered text: ${needle}`);
  }, { needle, offset });
}

async function main() {
  const h = await start(), { page } = h;
  const output = path.join(os.tmpdir(), 'markdown-reader-layout-qa'); fs.mkdirSync(output, { recursive: true });
  async function setting(id, checked) {
    await page.locator('#readerSettingsToggle').click();
    if (await page.locator(`#${id}`).isChecked() !== checked) await page.locator(`label[for=${id}]`).click();
    await page.locator('#readerSettingsToggle').click();
  }
  async function load(text) {
    await h.load(''); await h.load(text);
    await page.evaluate(() => window.LivePreview.goto(0));
    await page.waitForTimeout(180);
  }
  async function clickAndType(text, needle, offset = 1) {
    const expected = text.indexOf(needle) + offset, point = await textPoint(page, needle, offset);
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.evaluate(() => LivePreview.view.state.selection.main.head), expected, `click ${needle}`);
    await page.keyboard.type('插'); await h.idle();
    assert.equal(h.text(), text.slice(0, expected) + '插' + text.slice(expected), `input ${needle}`);
  }
  try {
    await page.setViewportSize({ width: 1440, height: 1400 });
    const headings = '# 文档标题\n\n' + Array.from({ length: 6 }, (_, i) => '#'.repeat(i + 1) + ' 标题级别' + (i + 1)).join('\n\n') + '\n\n尾部\n';
    await load(headings); await setting('showContentNumbers', true);
    const plainColor = await page.locator('.lp-h2').evaluate(n => getComputedStyle(n).color);
    await setting('rainbowHeadingColors', true);
    const colors = await page.locator('.lp-heading:has(.outline-number)').filter({ hasText: '标题级别' }).evaluateAll(nodes => nodes.map(n => ({
      text: getComputedStyle(n).color, number: getComputedStyle(n.querySelector('.outline-number')).color
    })));
    assert.deepEqual(colors.map(c => c.number), ['rgb(229, 57, 53)', 'rgb(245, 124, 0)', 'rgb(249, 168, 37)', 'rgb(67, 160, 71)', 'rgb(0, 131, 143)', 'rgb(142, 36, 170)']);
    assert(colors.every(c => c.text === plainColor), 'rainbow colors only the number when numbering is enabled');
    for (const scale of [false, true]) {
      await setting('headingFontScale', scale);
      assert(await page.locator('.lp-heading:has(.outline-number)').evaluateAll(nodes => nodes.every(n =>
        getComputedStyle(n).fontSize === getComputedStyle(n.querySelector('.outline-number')).fontSize)), 'numbers match heading sizes with either heading size setting');
    }
    assert.equal(await page.locator('.content-fold').first().textContent(), await page.locator('.toc-fold').first().textContent(), 'body and TOC use the same expanded icon');
    assert.equal(h.text(), headings, 'settings never change Markdown');
    await page.screenshot({ path: path.join(output, 'numbering.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    const dragDoc = '# 标题\n\n正文块甲\n\n正文块乙\n\n| A | B |\n| --- | --- |\n| 内容 | 内容 |\n\n$$\nx^2\n$$\n\n尾部\n';
    await load(dragDoc);
    const before = await textPoint(page, '正文块甲');
    await setting('enableBlockDrag', true);
    assert.deepEqual(await textPoint(page, '正文块甲'), before, 'enabling handles must not shift or narrow body text');
    const handles = await page.locator('.lp-drag').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(), parent = n.parentElement.getBoundingClientRect();
      return { right: r.right, left: r.left, bodyLeft: parent.left, parent: n.parentElement.className };
    }));
    assert(handles.length >= 5);
    assert(handles.every(r => r.right <= r.bodyLeft && r.left >= 0), 'all block and widget handles live in the left gutter');
    assert(await page.locator('.lp-heading').first().evaluate(n => n.querySelector('.lp-drag').getBoundingClientRect().right <= n.querySelector('.content-fold').getBoundingClientRect().left), 'drag handle and folding button do not overlap');
    await page.locator('.lp-heading').first().hover();
    await page.locator('.content-fold').first().click();
    assert.equal(await page.getByText('正文块甲', { exact: true }).count(), 0);
    assert.equal(await page.locator('.content-fold').first().textContent(), '▸');
    assert.equal(await page.locator('.content-fold').first().getAttribute('aria-expanded'), 'false');
    await page.locator('.content-fold').first().click();
    assert.equal(await page.locator('.content-fold').first().textContent(), '▾');
    assert.equal(await page.locator('.content-fold').first().getAttribute('aria-expanded'), 'true');
    await page.locator('.cm-line').filter({ hasText: '正文块甲' }).hover();
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.locator('.lp-drag').nth(2).dragTo(page.locator('.cm-line').filter({ hasText: '正文块甲' }), { targetPosition: { x: 70, y: 8 } });
    await h.idle(); assert(h.text().indexOf('正文块乙') < h.text().indexOf('正文块甲'));
    await setting('enableBlockDrag', false);

    const cite = '# 标题\n\n有出处的文字 [cite:1]。\n\n[cite source] 1. 来源说明与链接\n\n尾部\n';
    await load(cite); await page.locator('.lp-cite button').click();
    const highlight = page.locator('.lp-source-highlight');
    assert((await highlight.innerText()).includes('来源说明与链接'));
    assert.notEqual(await highlight.evaluate(n => getComputedStyle(n).boxShadow), 'none');
    await page.screenshot({ path: path.join(output, 'citation.png') });
    await h.change('\n' + cite);
    assert((await page.locator('.lp-source-highlight').innerText()).includes('来源说明与链接'), 'jump target maps through edits');
    await page.locator('#lpReturn').click();
    assert.equal(await page.locator('.lp-source-highlight').count(), 0);
    assert((await page.locator('.lp-cite-return-highlight').innerText()).includes('有出处的文字'));
    assert.equal(h.text(), '\n' + cite);

    await page.setViewportSize({ width: 1440, height: 1000 });
    const blocks = [
      ['quote', '> 引用正文内容\n> 引用第二行'],
      ['table', '| A | B |\n| --- | --- |\n| 内容 | 内容 |'],
      ['list', '- 第一项\n- 第二项\n- 第三项'],
      ['math', '$$\nx^2+1\n$$'],
      ['mermaid', '```mermaid\ngraph LR\nA --> B\n```'],
      ['html', '<details><summary>摘要</summary><p>内部段落</p></details>'],
      ['definition', '术语\n: 解释内容'],
      ['rule', '---']
    ];
    for (const [name, block] of blocks) {
      const text = '# 起点\n\n' + block + '\n\n点击这一行文字\n下一行不应修改\n';
      await load(text);
      if (name === 'mermaid') await page.locator('.lp-mermaid svg').waitFor();
      if (name === 'quote') {
        const style = await page.locator('.lp-quote').first().evaluate(n => {
          const s = getComputedStyle(n); return { border: s.borderLeftColor, width: s.borderLeftWidth, color: s.color, bodyColor: getComputedStyle(n.closest('.cm-editor')).color };
        });
        assert.equal(style.border, 'rgb(255, 255, 255)'); assert.equal(style.width, '4px'); assert.equal(style.color, style.bodyColor);
      }
      await clickAndType(text, '点击这一行文字');
    }
    const properties = '---\ntags: [Project]\ndate: 2026-09-18\n---\n\n# 起点\n\n属性后正文\n下一行不应修改\n';
    await load(properties);
    await page.evaluate(() => LivePreview.goto(LivePreview.view.state.doc.toString().indexOf('# 起点')));
    await page.waitForTimeout(180); await clickAndType(properties, '属性后正文');

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const text = '# 起点\n\n## 点击标题文字\n\n这里有 **加粗文字与*内部斜体*内容** 以及普通文字。\n\n尾部\n';
      for (const needle of ['点击标题文字', '加粗文字', '内部斜体']) { await load(text); await clickAndType(text, needle); }
      const table = '# 起点\n\n| 列一 | 列二 |\n| --- | --- |\n| ' + '**单元格中较长的文字**'.repeat(8) + ' | 内容 |\n\n点击这一行文字\n下一行不应修改\n';
      await load(table); await page.locator('.lp-table td').nth(2).click(); await page.waitForTimeout(200);
      await clickAndType(table, '点击这一行文字');
      await load(dragDoc); await setting('enableBlockDrag', true);
      assert(await page.locator('.lp-drag').first().evaluate(n => n.getBoundingClientRect().left >= 0));
      const narrowBefore = await textPoint(page, '正文块甲');
      await setting('enableBlockDrag', false);
      assert.deepEqual(await textPoint(page, '正文块甲'), narrowBefore);
      if (width === 390) await page.screenshot({ path: path.join(output, 'narrow.png'), fullPage: true });
    }
    assert.deepEqual(h.errors, []);
    console.log(`Layout regressions passed: rainbow numbering, gutter handles/dragging, citation highlights and source mapping, real mouse clicks/input after every preview type and active tables at desktop/390px. Screenshots: ${output}`);
  } finally { if (h.errors.length) console.log(h.errors); await h.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
