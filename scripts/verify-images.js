/**
 * Verifies the extension-side image resolution in `src/reportData.ts` against the compiled
 * output, including the real Obsidian note that reported the problem.
 *
 * The compiled module imports `vscode`, which only exists inside the extension host, so a
 * minimal stub is registered before requiring it.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const os = require("node:os");

/* ------------------------------------------------------------- vscode stub */

class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
    this.scheme = "file";
  }
  static file(fsPath) {
    return new Uri(fsPath);
  }
  toString() {
    return `file://${this.fsPath}`;
  }
}

const vscodeStub = {
  Uri,
  workspace: { getWorkspaceFolder: () => undefined },
  window: { showErrorMessage() {}, showWarningMessage() {} }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") return vscodeStub;
  return originalLoad.call(this, request, parent, isMain);
};

const { collectImageTargets, resolveImageReferences, resolveVaultRoot } = require("../out/reportData.js");

/* -------------------------------------------------------------- unit checks */

assert.deepEqual(
  collectImageTargets(
    ["# Title", "![[attachments/a.png]]", "", "![alt](img/b.jpg)", "", "`![[inline.png]]`", "```", "![[fenced.png]]", "```"].join("\n")
  ),
  ["attachments/a.png", "img/b.jpg"],
  "collectImageTargets should find embeds and Markdown images but ignore code"
);
console.log("ok - collectImageTargets finds embeds/images and skips code spans and fences");

const vaultRoot = path.resolve(os.tmpdir(), "markdown-reader-image-resolution-fixture");
const documentDir = path.join(vaultRoot, "notes", "sub");
const fakeExists = new Set([
  path.join(documentDir, "local.png"),
  path.join(vaultRoot, "attachments", "shot.png")
]);
const toWebviewUri = (fsPath) => `https://webview.example/${fsPath}`;
const originalStatSync = fs.statSync;
fs.statSync = (candidate) => {
  if (fakeExists.has(String(candidate))) return { isFile: () => true };
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

try {
  const result = resolveImageReferences(
    ["![[attachments/shot.png]]", "", "![](local.png)", "", "![[attachments/nope.png]]"].join("\n"),
    documentDir,
    vaultRoot,
    toWebviewUri
  );
  // Vault-relative Obsidian embed.
  assert.equal(result.resolved["attachments/shot.png"], toWebviewUri(path.join(vaultRoot, "attachments", "shot.png")));
  // Document-relative Markdown image.
  assert.equal(result.resolved["local.png"], toWebviewUri(path.join(documentDir, "local.png")));
  // Unresolvable paths are reported so the renderer can show a placeholder.
  assert.deepEqual(result.missing, ["attachments/nope.png"]);
  console.log("ok - vault-relative embeds and document-relative images both resolve");

  fs.statSync = originalStatSync;
  assert.equal(resolveVaultRoot(documentDir, undefined), documentDir);
} finally {
  fs.statSync = originalStatSync;
}
console.log("ok - vault root falls back to the document folder when no vault marker exists");

/* ------------------------------------------------- real document resolution */

const synergyPath =
  "/Users/ahs/Documents/快捷指令/Games/Projects/_立项中/幸运房东like/Synergy/_Synergy.md";

if (!fs.existsSync(synergyPath)) {
  console.log(`skip - reported note not present at ${synergyPath}`);
} else {
  const content = fs.readFileSync(synergyPath, "utf8");
  const docDir = path.dirname(synergyPath);
  const vault = resolveVaultRoot(docDir, undefined);
  assert.equal(vault, "/Users/ahs/Documents/快捷指令", "should detect the Obsidian vault root");

  const targets = collectImageTargets(content);
  assert.equal(targets.length, 16, `expected 16 image references, got ${targets.length}`);

  const result = resolveImageReferences(content, docDir, vault, (fsPath) => `webview://${fsPath}`);
  assert.deepEqual(result.missing, [], `all images should resolve, missing: ${result.missing.join(", ")}`);
  assert.equal(Object.keys(result.resolved).length, 16);

  // File names containing spaces and non-ASCII characters must survive resolution.
  const spaced =
    "attachments/legacy-root/微信图片_20251204235011_22_41 2.jpg";
  assert.ok(result.resolved[spaced], "the spaced/non-ASCII attachment should resolve");
  assert.ok(fs.existsSync(result.resolved[spaced].replace("webview://", "")));

  console.log(`ok - all ${targets.length} images in _Synergy.md resolve against the detected vault root`);
}

console.log("\nImage resolution verification passed.");
