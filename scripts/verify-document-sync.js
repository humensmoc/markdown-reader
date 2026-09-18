const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const modulePath = path.join(os.tmpdir(), 'markdown-reader-bridge-test.cjs');
esbuild.buildSync({ entryPoints: [path.join(__dirname, '../webview/documentBridge.ts')], bundle: true, platform: 'node', outfile: modulePath });
const { DocumentBridge } = require(modulePath);
const { normalizeText, diffText, applyChanges, toWire, fromWire, rebaseChanges } = require('../out/textChanges');
for (const raw of ['甲\r\nA𝄞😀B\r\n末尾', '\uFEFF# H\n\nbody', '']) {
  const text = normalizeText(raw), next = text + '\n中文𠮷';
  assert.equal(applyChanges(text, fromWire(text, toWire(text, diffText(text, next)))), next);
}
assert.throws(() => rebaseChanges([{ from: 1, to: 3, insert: 'x' }], [{ from: 2, to: 4, insert: '' }]), /重叠/);
assert.throws(() => rebaseChanges([{ from: 1, to: 1, insert: 'x' }], [{ from: 1, to: 1, insert: 'y' }]), /重叠/);

function scenario(initial) {
  let text = initial, version = 1;
  const pending = [], views = [], snapshots = new Map([[version, text]]);
  function view() {
    const client = new DocumentBridge(m => pending.push(m), () => {}, () => {});
    views.push(client); client.receive({ type: 'documentInit', documentUri: 'test', content: text, version, dirty: false }); return client;
  }
  function patch(next, origin = {}) {
    const old = text, baseVersion = version; text = next; snapshots.set(++version, text);
    for (const client of views) client.receive({ type: 'documentPatch', documentUri: 'test', baseVersion, version, changes: toWire(old, diffText(old, text)), dirty: true, ...origin });
  }
  function deliver() {
    const m = pending.shift(); assert(m);
    if (m.type !== 'applyEdits') return m;
    const base = snapshots.get(m.baseVersion), edits = rebaseChanges(fromWire(base, m.changes), diffText(base, text));
    patch(applyChanges(text, edits), { clientId: m.clientId, operationId: m.operationId });
    return () => views.find(v => v.clientId === m.clientId).receive({ type: 'editAck', operationId: m.operationId, version });
  }
  return { view, patch, deliver, pending, text: () => text };
}
{
  const s = scenario('abc\n末尾'), a = s.view(), b = s.view();
  a.local('abcX\n末尾'); a.local('abcXY\n末尾'); a.local('abcXYZ\n末尾');
  assert.equal(s.pending.length, 1, 'one batch in flight');
  const lateAck = s.deliver(); assert.equal(s.pending.length, 1);
  lateAck(); s.deliver()(); assert.equal(s.text(), 'abcXYZ\n末尾'); assert.equal(b.text, a.text); assert.equal(a.pending, false);
}
{
  const s = scenario('alpha\nbeta'), a = s.view(), b = s.view();
  a.local('alpha!\nbeta'); s.patch('alpha\nBETA'); a.local('alpha!?\nBETA');
  s.deliver()(); s.deliver()(); assert.equal(s.text(), 'alpha!?\nBETA'); assert.equal(b.text, a.text);
}
{
  const s = scenario('abc'), a = s.view(); a.local('aXc'); s.patch('aYc');
  assert(a.conflict); assert.equal(a.text, 'aXc', 'overlapping external change preserves local draft');
  a.local('aLOCALc'); assert.equal(a.text, 'aLOCALc'); assert.equal(s.pending.length, 1);
}
{
  const s = scenario('abc'), a = s.view(); a.local('abcd'); a.command({ type: 'editorCommand', command: 'save' });
  assert.equal(s.pending.length, 1); s.deliver()(); assert.equal(s.deliver().command, 'save');
  a.receive({ type: 'documentSaved', dirty: false }); assert.equal(a.dirty, false);
}
console.log('Source and bridge checks passed: UTF-16, BOM, CRLF normalization, delayed receipts, continuous input, multiple views, disjoint replay, overlapping conflicts and save ordering.');
