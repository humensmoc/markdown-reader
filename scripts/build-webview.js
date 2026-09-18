const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const frontend = esbuild.buildSync({ entryPoints: ['webview/editor.ts'], bundle: true, outfile: 'media/livePreview.js',
  platform: 'browser', format: 'iife', target: 'chrome120', sourcemap: true, minify: true, metafile: true });

const host = esbuild.buildSync({ entryPoints: ["src/extension.ts"], bundle: true, outfile: "out/extension.js", platform: "node", format: "cjs", target: "node18", external: ["vscode"], sourcemap: true, metafile: true });
const packages = new Set([...Object.keys(frontend.metafile.inputs), ...Object.keys(host.metafile.inputs)]
  .map(input => /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1]).filter(Boolean));
const notices = [...packages].sort().map(name => {
  const directory = path.join('node_modules', name), pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const files = fs.readdirSync(directory).filter(file => /^licen[sc]e(?:[.-].*)?$/i.test(file));
  if (!files.length) throw new Error('Missing bundled dependency license: ' + name);
  return `${name} ${pkg.version}\n${files.map(file => fs.readFileSync(path.join(directory, file), 'utf8')).join('\n')}`;
});
fs.writeFileSync('media/livePreview.LICENSE.txt', notices.join('\n\n----------------------------------------\n\n'));
