const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
exports.start = async function () {
  const source = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  const values = { nonce: 'live-test', 'webview.cspSource': "'self'", cssUri: '/media/report.css', liveCssUri: '/media/livePreview.css',
    jsUri: '/media/reportViewer.js', mermaidUri: '/media/mermaid.min.js', katexUri: '/media/katex/katex.min.js', katexCssUri: '/media/katex/katex.min.css',
    mathUri: '/media/readerMath.js', highlightFormatUri: '/media/highlightFormat.js', highlightsUri: '/media/readerHighlights.js', livePreviewUri: '/media/livePreview.js' };
  const html = source.match(/return `(<\!doctype html>[\s\S]*?<\/html>)`;/)[1].replace(/\$\{([^}]+)\}/g, (_, key) => { if (!(key in values)) throw Error(key); return values[key]; });
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [], sent = [];
  page.setDefaultTimeout(8000);
  let text = '', version = 0, undo = [], redo = [];
  const { applyChanges, fromWire, toWire, diffText } = require('../out/textChanges');
  async function message(m) { await page.evaluate(m => window.postMessage(m, '*'), m); }
  async function change(next, origin = {}) {
    const old = text, baseVersion = version; text = next; version++;
    await message({ type: 'documentPatch', documentUri: 'file:///live-test.md', baseVersion, version, changes: toWire(old, diffText(old, next)), dirty: true, ...origin });
  }
  const { updateReadingHighlight } = require('../out/readingHighlights');
  await page.exposeFunction('hostPost', async m => {
    sent.push(m);
    try {
      if (m.type === 'applyEdits') {
        if (m.baseVersion !== version) throw Error('stale test operation');
        const next = applyChanges(text, fromWire(text, m.changes)); undo.push(text); redo = [];
        await change(next, { clientId: m.clientId, operationId: m.operationId });
        await message({ type: 'editAck', operationId: m.operationId, version });
      } else if (m.type === 'editorCommand') {
        if (m.command === 'undo' && undo.length) { redo.push(text); await change(undo.pop()); }
        if (m.command === 'redo' && redo.length) { undo.push(text); await change(redo.pop()); }
        if (m.command === 'save') await message({ type: 'documentSaved', dirty: false });
      } else if (m.type === 'saveReadingHighlight' || m.type === 'deleteReadingHighlight') {
        undo.push(text); await change(updateReadingHighlight(text, m)); await message({ type: 'readingHighlightSaved' });
      }
    } catch (e) { errors.push('HOST: ' + e.message); }
  });
  page.on('pageerror', e => errors.push(e.stack));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: m => window.hostPost(m), getState: () => ({}), setState: () => {} }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.addStyleTag({ content: ':root { --vscode-editor-background:#faf9f6; --vscode-editor-foreground:#292929; --vscode-sideBar-background:#eeedea; --vscode-descriptionForeground:#777; --vscode-panel-border:#ddd; --vscode-font-family:"Segoe UI",sans-serif; --vscode-font-size:14px; }' });
  return { page, errors, sent, text: () => text, change,
    async load(content) { text = content; version++; undo = []; redo = []; await message({ type: 'documentInit', documentUri: 'file:///live-test.md', content, version, dirty: false }); await page.waitForFunction(t => window.LivePreview?.view?.state.doc.toString() === t, content); },
    async idle() { await page.waitForFunction(() => !window.LivePreview.bridge.pending); },
    async close() { await browser.close(); await new Promise(r => server.close(r)); }
  };
};
