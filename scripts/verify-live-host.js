// Runs inside a real VS Code development extension host, with isolated settings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
exports.run = async function () {
  const vscode = require('vscode');
  const output = process.env.LIVE_HOST_RESULT || path.join(os.tmpdir(), 'markdown-reader-host-result.json');
  const extension = vscode.extensions.getExtension('humensmoc.markdown-reader');
  await extension.activate();
  const { ReportMarkdownEditorProvider } = require('../out/extension');
  const original = ReportMarkdownEditorProvider.prototype.resolveCustomTextEditor;
  const panels = new Map(), responses = new Map(); let serial = 0;
  ReportMarkdownEditorProvider.prototype.resolveCustomTextEditor = async function (document, panel, token) {
    await original.call(this, document, panel, token);
    panels.set(document.uri.toString(), panel);
    panel.webview.onDidReceiveMessage(m => { if (m.type === 'testResponse') { responses.get(m.id)?.(m); responses.delete(m.id); } });
    const html = panel.webview.html, nonce = html.match(/script nonce="([^"]+)"/)[1];
    const script = `window.addEventListener('message', async event => {
      const m = event.data; if (m.type !== 'testAction') return;
      const e = window.ReaderController;
      try {
        if (m.action === 'mode') document.querySelector('#renderModeToggle').click();
        if (m.action === 'edit') { e.view.focus(); e.view.dispatch({ changes: m.changes }); }
        if (m.action === 'command') { e.view?.focus(); e.send({type:'editorCommand',command:m.command}); }
        if (m.action === 'business') e.send(m.message);
        if (m.action === 'cell') { const td=document.querySelector('.lp-table td[data-row="1"][data-col="0"]'); td.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); }
        window.ReaderServices.post({type:'testResponse', id:m.id, text:e.bridge.text, mode:e.editing ? 'live' : 'read', rendered:document.querySelector('.report-file')?.textContent, images:[...document.querySelectorAll('.md-image-el')].map(i=>({width:i.naturalWidth,src:i.src})), pending:e.bridge.pending, focus:document.activeElement === e.view?.contentDOM, cell:e.cell?.view.state.doc.toString(), error:null});
      } catch(err) { window.ReaderServices.post({type:'testResponse',id:m.id,error:String(err.stack||err)}); }
    });`;
    panel.webview.html = html.replace('</body>', `<script nonce="${nonce}">${script}</script></body>`);
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reader-live-host-'));
  const uri = vscode.Uri.file(path.join(directory, 'document.md'));
  const initial = '# 宿主\r\n\r\n正文😀\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 甲 | 乙 |\r\n\r\n![[image.png|120]]\r\n';
  const checks = [];
  async function waitFor(predicate, label) {
    const until = Date.now() + 15000;
    while (Date.now() < until) { if (await predicate()) return; await new Promise(r => setTimeout(r, 50)); }
    throw Error('Timeout: ' + label);
  }
  async function action(fields) {
    const panel = panels.get(uri.toString()), id = ++serial;
    const answer = new Promise((resolve, reject) => { responses.set(id, resolve); setTimeout(() => { if (responses.delete(id)) reject(Error('webview response timeout')); }, 8000); });
    await panel.webview.postMessage({ type: 'testAction', id, ...fields });
    const result = await answer; if (result.error) throw Error(result.error); return result;
  }
  async function open() {
    await vscode.commands.executeCommand('meowReportMarkdown.openPreview', uri);
    await waitFor(() => panels.has(uri.toString()), 'custom editor panel');
    await waitFor(async () => { try { return Boolean((await action({ action: 'snapshot' })).text); } catch { return false; } }, 'CodeMirror ready');
  }
  try {
    await vscode.workspace.getConfiguration('files').update('autoSave', 'off', vscode.ConfigurationTarget.Global);
    fs.writeFileSync(uri.fsPath, "\uFEFF" + initial);
    fs.writeFileSync(path.join(directory, 'image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVioAAAAASUVORK5CYII=', 'base64'));
    const document = await vscode.workspace.openTextDocument(uri);
    await open();
    await waitFor(async () => (await action({ action: 'snapshot' })).images.some(i => i.width > 0), 'ordinary image loaded through webview URI');
    assert.equal((await action({ action: 'snapshot' })).mode, 'read');
    checks.push('new panels default to ordinary rendering and load actual local images');
    assert.equal(document.getText(), initial); checks.push('open leaves BOM/EOL/source unchanged');
    await action({ action: 'mode' });
    const from = initial.replace(/\r\n/g, '\n').indexOf('正文') + 2;
    assert((await action({ action: 'edit', changes: { from, insert: '新增' } })).focus);
    await waitFor(() => document.getText().includes('正文新增'), 'input synchronized');
    assert(document.isDirty); assert.equal(fs.readFileSync(uri.fsPath, 'utf8'), '\uFEFF' + initial); checks.push('focused custom editor input stays unsaved and preserves CRLF/Unicode');
    await action({ action: 'mode' });
    await waitFor(async () => (await action({ action: 'snapshot' })).rendered?.includes('正文新增'), 'unsaved edits visible in ordinary rendering');
    assert(document.isDirty); assert.equal(fs.readFileSync(uri.fsPath, 'utf8'), '\uFEFF' + initial);
    await action({ action: 'mode' }); checks.push('round-trip switching preserves unsaved edits and native undo history');
    await action({ action: 'command', command: 'undo' });
    await waitFor(() => document.getText() === initial, 'native undo'); checks.push('native undo from custom editor focus');
    await action({ action: 'command', command: 'redo' });
    await waitFor(() => document.getText().includes('正文新增'), 'native redo'); checks.push('native redo');
    await action({ action: 'command', command: 'save' });
    await waitFor(() => !document.isDirty, 'save'); assert.equal(fs.readFileSync(uri.fsPath, 'utf8'), '\uFEFF' + document.getText()); checks.push('Ctrl+S bridge uses TextDocument.save');
    const before = document.getText();
    await action({ action: 'business', message: { type: 'saveReadingHighlight', expectedDocument: before.replace(/\r\n/g, '\n'), highlight: { id: 'host-batch', exact: '甲 乙', prefix: '', suffix: '', occurrences: 1, color: 'yellow', comment: '共用评论' } } });
    await waitFor(() => document.getText().includes('==甲=='), 'batch highlight');
    assert(document.getText().includes('==乙==')); const marked = document.getText();
    await action({ action: 'command', command: 'undo' }); await waitFor(() => document.getText() === before, 'atomic highlight undo');
    await action({ action: 'command', command: 'redo' }); await waitFor(() => document.getText() === marked, 'atomic highlight redo'); checks.push('batch highlights and shared comment are one native undo/redo');
    await document.save();
    const external = document.getText().replace('新增', '外部更新'); fs.writeFileSync(uri.fsPath, "\uFEFF" + external);
    await waitFor(() => document.getText() === external, 'external file update');
    await waitFor(async () => (await action({ action: 'snapshot' })).text === external.replace(/\r\n/g, '\n'), 'external update projected'); checks.push('external filesystem updates propagate to CodeMirror');
    panels.get(uri.toString()).dispose(); panels.delete(uri.toString());
    await waitFor(() => !vscode.window.tabGroups.all.some(g => g.tabs.some(t => t.input?.uri?.toString() === uri.toString())), 'custom editor closed');
    await open();
    assert.equal((await action({ action: 'snapshot' })).text, external.replace(/\r\n/g, '\n')); checks.push('close and reopen preserves saved source');
    assert.equal((await action({ action: 'snapshot' })).mode, 'read'); checks.push('reopened panels default to ordinary rendering');
    fs.writeFileSync(output, JSON.stringify({ ok: true, vscode: vscode.version, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(output, JSON.stringify({ ok: false, vscode: vscode.version, checks, error: String(error.stack || error) }, null, 2)); throw error;
  } finally { ReportMarkdownEditorProvider.prototype.resolveCustomTextEditor = original; }
};
