const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const executable = await downloadAndUnzipVSCode({ version: 'stable' });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-reader-isolated-host-'));
  const result = path.join(directory, 'result.json');
  console.log('Isolated host result: ' + result);
  const child = spawn(executable, ['--no-sandbox', '--disable-gpu', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
    '--user-data-dir', path.join(directory, 'user'), '--extensions-dir', path.join(directory, 'extensions'),
    '--extensionDevelopmentPath=' + path.resolve(__dirname, '..'), '--extensionTestsPath=' + path.join(__dirname, 'verify-live-host.js')],
    { windowsHide: true, stdio: 'inherit', env: { ...process.env, LIVE_HOST_RESULT: result } });
  const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
  if (fs.existsSync(result)) console.log(fs.readFileSync(result, 'utf8'));
  if (code !== 0 || !fs.existsSync(result) || !JSON.parse(fs.readFileSync(result)).ok) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
