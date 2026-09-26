const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { start } = require('./live-test-harness');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reader-modes-'));
  fs.mkdirSync(path.join(dir, '.obsidian'));
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.mkdirSync(path.join(dir, 'attachments'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVioAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(dir, 'attachments/图片 one.png'), png);
  const source = '---\ntags: [Project]\n---\n# 模式切换\n\n正文 **粗体** 与 [网站](https://example.com)。\n\n![[attachments/图片 one.png|320]]\n\n![标准](../attachments/图片%20one.png)\n\n![[missing.png]]\n\n## 表格\n\n| A | B |\n| --- | --- |\n| 内容 | 值 |\n\n- [ ] 任务\n\n公式 $x^2$。\n\n```mermaid\ngraph LR\n A-->B\n```\n';
  const file = path.join(dir, 'notes/document.md'); fs.writeFileSync(file, source);
  const h = await start({ mode: 'read', documentPath: file, editDelay: 150,
    toWebviewUri: p => p.endsWith('.png') ? 'data:image/png;base64,' + fs.readFileSync(p).toString('base64') : 'https://file.test/' });
  const { page } = h;
  const read = async () => { await page.waitForFunction(() => document.body.dataset.renderMode === 'read' && !!document.querySelector('.report-file')); };
  try {
    await h.load(source); await read();
    assert.equal(await page.locator('.cm-editor').count(), 0, 'ordinary rendering is the default');
    assert.equal(await page.locator('#renderModeToggle').getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => [...document.querySelectorAll('.md-image-el')].every(i => i.naturalWidth > 0));
    assert.equal(await page.locator('.md-image-el').count(), 2);
    assert.equal(await page.locator('[data-image-width="320"]').count(), 1);
    assert.equal(await page.locator('.md-image-placeholder').count(), 1);
    assert.equal(await page.locator('.note-properties').count(), 1);
    assert.equal(await page.locator('.task-checkbox:disabled').count(), 1);
    await page.waitForSelector('.mermaid-rendered svg');
    assert.equal(await page.locator('.katex').count(), 1);
    const mode = await page.locator('#renderModeToggle').boundingBox(), settings = await page.locator('#readerSettingsToggle').boundingBox();
    assert(mode.y + mode.height < settings.y && Math.abs(mode.x - settings.x) < 1, 'button is directly above settings');
    await page.locator('.md-image-el').first().click();
    assert(await page.locator('#mermaidModal').isVisible()); await page.keyboard.press('Escape');
    await page.locator('#readerSettingsToggle').click();
    assert(await page.locator('#showMarkdownSource').isDisabled());
    await page.locator('#readerSettingsToggle').click();
    await page.screenshot({ path: path.join(dir, 'read-desktop.png'), fullPage: true });
    await page.locator('#renderModeToggle').click();
    await page.waitForSelector('.cm-editor');
    assert.equal(await page.locator('.report-file').count(), 0);
    assert.equal(await page.locator('.note-properties').count(), 1, 'entering live mode keeps frontmatter collapsed initially');
    assert.equal(h.text(), source);
    assert.equal(h.sent.filter(m => m.type === 'applyEdits').length, 0, 'switching does not rewrite source');
    await page.locator('.lp-table td').nth(2).click();
    await page.keyboard.press('End'); await page.keyboard.type('新增');
    await page.locator('#renderModeToggle').click();
    await h.idle(); await read();
    assert((await page.locator('.report-file').innerText()).includes('内容新增'));
    assert(h.text().includes('| 内容新增 | 值 |'));
    assert.equal(fs.readFileSync(file, 'utf8'), source, 'switching never saves implicitly');
    await h.page.evaluate(() => window.ReaderController.send({ type: 'editorCommand', command: 'undo' }));
    await page.waitForFunction(() => !document.querySelector('.report-file').textContent.includes('内容新增'));
    await h.change(h.text().replace('正文', '外部更新'));
    await page.waitForFunction(() => document.querySelector('.report-file')?.textContent.includes('外部更新'));
    const request = h.sent.filter(m => m.type === 'requestReadPreview').at(-1);
    await h.message({ type: 'readPreview', requestId: request.requestId - 1, version: 0, payload: { files: [] } });
    assert((await page.locator('.report-file').innerText()).includes('外部更新'), 'stale previews cannot overwrite newer content');
    for (let i = 0; i < 3; i++) {
      await page.locator('#renderModeToggle').click(); await page.waitForSelector('.cm-editor');
      assert.equal(await page.locator('#reportContent > .cm-editor').count(), 1);
      assert.equal(await page.evaluate(() => window.LivePreview.view.state.doc.toString()), h.text());
      await page.locator('#renderModeToggle').click(); await read();
      assert.equal(await page.locator('.report-file').count(), 1);
    }
    await page.locator('#reloadDocumentBtn').click(); await read();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ordinary narrow layout does not overflow');
    await page.screenshot({ path: path.join(dir, 'read-narrow.png'), fullPage: true });
    await page.locator('#renderModeToggle').click(); await page.waitForSelector('.cm-editor');
    await page.screenshot({ path: path.join(dir, 'live-narrow.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'live narrow layout does not overflow');
    const draft = await page.evaluate(() => window.ReaderController.bridge.text);
    await h.message({ type: 'editRejected', operationId: -1, message: '测试重叠冲突', content: draft, version: 100 });
    assert(await page.locator('#renderModeToggle').isDisabled());
    await page.evaluate(() => window.ReaderController.setEditing(false));
    assert.equal(await page.locator('body').getAttribute('data-render-mode'), 'live', 'conflicts keep the editor and local draft');
    assert.equal(await page.evaluate(() => window.LivePreview.bridge.text), draft);
    assert(await page.locator('.lp-conflict').isVisible());
    const conflict = await page.locator('.lp-conflict').boundingBox(), toggle = await page.locator('#renderModeToggle').boundingBox();
    assert(conflict.y + conflict.height <= toggle.y, 'conflict notice does not cover mode controls');
    assert.deepEqual(h.errors, []);
    console.log('Render modes passed: default read, images/fullscreen, toolbar, pending table edits, undo, external updates, stale responses, repeated switches and narrow layout. Screenshots: ' + dir);
  } finally { await h.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
