const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.readFileSync(filePath, "utf8");
}

function assertContains(file, text) {
  const content = read(file);
  if (!content.includes(text)) {
    throw new Error(`Missing ${file} marker: ${text}`);
  }
}

function assertNotContains(file, text) {
  const content = read(file);
  if (content.includes(text)) {
    throw new Error(`Unexpected ${file} marker: ${text}`);
  }
}

function assertCount(file, pattern, expected) {
  const content = read(file);
  const matches = content.match(pattern) || [];
  if (matches.length !== expected) {
    throw new Error(`Expected ${expected} matches for ${pattern} in ${file}, found ${matches.length}`);
  }
}

assertContains("media/reportViewer.js", "function buildMermaidConfig()");
assertContains("media/reportViewer.js", 'theme: "base"');
assertContains("media/reportViewer.js", "darkMode: true");
assertContains("media/reportViewer.js", 'curve: "linear"');
assertNotContains("media/reportViewer.js", 'curve: "stepBefore"');
assertContains("media/reportViewer.js", 'defaultRenderer: "dagre-wrapper"');
assertContains("media/reportViewer.js", "window.__mermaidConfigKey");
assertContains("media/reportViewer.js", "function normalizeMermaidSvg(wrapper)");
assertContains("media/reportViewer.js", "normalizeMermaidSvg(wrapper);");

assertContains("media/report.css", "--mermaid-edge: #21a7c9;");
assertContains("media/report.css", ".mermaid-svg-root");
assertContains("media/report.css", "max-height: min(70vh, 760px);");
assertContains("media/report.css", "background: var(--mermaid-bg);");

assertContains("docs/fixtures/mermaid-cursor-style-demo.md", "# Mermaid Cursor Style Demo");
assertContains("docs/fixtures/mermaid-cursor-style-demo.md", "flowchart TD");
assertContains("docs/fixtures/mermaid-cursor-style-demo.md", "sequenceDiagram");
assertContains("docs/fixtures/mermaid-cursor-style-demo.md", "curve: linear");
assertNotContains("docs/fixtures/mermaid-cursor-style-demo.md", "stepBefore");
assertCount("docs/fixtures/mermaid-cursor-style-demo.md", /```mermaid/g, 3);

console.log("Mermaid style verification passed.");
