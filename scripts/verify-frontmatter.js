const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { extractMarkdownHeadings } = require("../out/markdownHeadings.js");

function readFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const viewerSource = fs.readFileSync(require.resolve("../media/reportViewer.js"), "utf8");
const functionNames = [
  "parseAnnotationMeta",
  "extractAnnotationBody",
  "extractObsidianFrontmatter",
  "unquoteFrontmatterValue",
  "splitFrontmatterList",
  "parseObsidianFrontmatter",
  "parseCodeFenceLine",
  "isCodeFenceClose",
  "normalizeMarkdownLines",
  "preprocessMarkdownContent"
];
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(functionNames.map((name) => readFunction(viewerSource, name)).join("\n"), sandbox);

const source = [
  "---",
  "tags:",
  "  - Project",
  "date: 2026-09-10",
  "research_query: \"frontmatter compatibility\"",
  "---",
  "# Visible heading",
  "Body"
].join("\n");
const result = sandbox.preprocessMarkdownContent(source);
assert.equal(result.frontmatter, source.split("\n").slice(0, 6).join("\n"));
assert.deepEqual(Array.from(result.lines.slice(0, 6)), ["", "", "", "", "", ""]);
assert.equal(result.lines[6], "# Visible heading");
assert.deepEqual(
  JSON.parse(JSON.stringify(result.frontmatterFields)),
  [
    { key: "tags", type: "tags", value: ["Project"] },
    { key: "date", type: "date", value: "2026-09-10" },
    { key: "research_query", type: "text", value: "frontmatter compatibility" }
  ]
);

const headings = extractMarkdownHeadings(["---", "alias: '# Hidden heading'", "---", "# Visible heading"].join("\n"), "note.md");
assert.equal(headings.length, 1);
assert.equal(headings[0].text, "Visible heading");
assert.equal(headings[0].line, 4);

const unterminated = sandbox.preprocessMarkdownContent(["---", "tags:", "  - Project"].join("\n"));
assert.equal(unterminated.frontmatter, "");
assert.equal(unterminated.lines[0], "---");

console.log("Obsidian frontmatter verification passed.");
