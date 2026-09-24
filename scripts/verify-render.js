/**
 * Renders Markdown through the real `media/reportViewer.js` parser using a minimal DOM shim,
 * then asserts on the produced HTML. Covers the Obsidian-oriented parsing fixes:
 *   - `![[image.png]]` / `![alt](image.png)` embeds
 *   - indentation-preserving outlines written without list markers
 *   - `==highlight==`
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* ------------------------------------------------------------------ DOM shim */

class ClassList {
  constructor() {
    this.tokens = new Set();
  }
  add(...names) {
    for (const name of names) this.tokens.add(name);
  }
  remove(...names) {
    for (const name of names) this.tokens.delete(name);
  }
  contains(name) {
    return this.tokens.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.tokens.has(name) : Boolean(force);
    if (on) this.tokens.add(name);
    else this.tokens.delete(name);
    return on;
  }
  get value() {
    return [...this.tokens].join(" ");
  }
}

class Style {
  constructor() {
    this.props = new Map();
  }
  setProperty(name, value) {
    this.props.set(name, value);
  }
  getPropertyValue(name) {
    return this.props.get(name) || "";
  }
  removeProperty(name) {
    this.props.delete(name);
  }
}

class Node {
  constructor(nodeType, nodeName) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
  }
  get children() {
    return this.childNodes.filter((child) => child.nodeType === 1);
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get firstElementChild() {
    return this.children[0] || null;
  }
  appendChild(node) {
    if (node.nodeType === 11) {
      for (const inner of [...node.childNodes]) this.appendChild(inner);
      node.childNodes = [];
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(typeof node === "string" ? new TextNode(node) : node);
    }
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    const index = this.childNodes.indexOf(ref);
    node.parentNode = this;
    this.childNodes.splice(index === -1 ? this.childNodes.length : index, 0, node);
    return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index !== -1) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  get textContent() {
    if (this.nodeType === 3) return this.data;
    return this.childNodes.map((child) => child.textContent ?? "").join("");
  }
  set textContent(value) {
    this.childNodes = [];
    if (value !== "" && value != null) this.appendChild(new TextNode(String(value)));
  }
  get isConnected() {
    return true;
  }
  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }
  descend(callback) {
    for (const child of this.childNodes) {
      callback(child);
      child.descend?.(callback);
    }
  }
  querySelectorAll() {
    return [];
  }
  querySelector() {
    return null;
  }
  closest() {
    return null;
  }
  matches() {
    return false;
  }
  cloneNode() {
    return new TextNode(this.data ?? "");
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  }
  getClientRects() {
    return [];
  }
  focus() {}
  blur() {}
  click() {}
  scrollIntoView() {}
  toggleAttribute(name, force) {
    const on = force === undefined ? !this.attributes.has(name) : Boolean(force);
    if (on) this.setAttribute(name, "");
    else this.removeAttribute(name);
    return on;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  getAttributeNames() {
    return [...this.attributes.keys()];
  }
  replaceWith() {}
  before() {}
  after() {}
  insertAdjacentHTML() {}
  insertAdjacentElement() {
    return null;
  }
  dispatchEvent() {
    return true;
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  getElementsByTagName() {
    return [];
  }
  getElementsByClassName() {
    return [];
  }
  scrollTo() {}
  setSelectionRange() {}
  select() {}
  animate() {
    return { cancel() {}, finished: Promise.resolve() };
  }
}

class TextNode extends Node {
  constructor(data) {
    super(3, "#text");
    this.data = String(data);
    this.attributes = new Map();
  }
  get textContent() {
    return this.data;
  }
}

class Element extends Node {
  constructor(tagName) {
    super(1, String(tagName).toUpperCase());
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.classList = new ClassList();
    this.dataset = {};
    this.style = new Style();
    this.attributes = new Map();
    this.hidden = false;
    this.id = "";
    this._className = "";
  }
  get className() {
    return this.classList.value || this._className;
  }
  set className(value) {
    this._className = String(value);
    this.classList = new ClassList();
    for (const token of String(value).split(/\s+/).filter(Boolean)) this.classList.add(token);
  }
  set innerHTML(value) {
    this.childNodes = [];
    this._innerHTML = String(value);
  }
  get innerHTML() {
    return this._innerHTML ?? "";
  }
  get content() {
    return { childNodes: [] };
  }
  cloneNode() {
    const copy = new Element(this.localName);
    copy.className = this.className;
    copy.id = this.id;
    copy.attributes = new Map(this.attributes);
    copy.dataset = { ...this.dataset };
    return copy;
  }
}

class Fragment extends Node {
  constructor() {
    super(11, "#document-fragment");
    this.attributes = new Map();
  }
}

/* Reflected attributes: in a real DOM `el.src = x` also updates the attribute. */
for (const name of [
  "src",
  "alt",
  "href",
  "title",
  "type",
  "value",
  "placeholder",
  "name",
  "role",
  "rel",
  "target",
  "lang",
  "width",
  "height",
  "colspan",
  "rowspan",
  "aria-label",
  "aria-hidden",
  "aria-modal",
  "aria-orientation",
  "aria-expanded",
  "aria-pressed",
  "aria-controls"
]) {
  Object.defineProperty(Element.prototype, name, {
    get() {
      return this.attributes.get(name) ?? "";
    },
    set(value) {
      if (value === null || value === undefined || value === false) this.attributes.delete(name);
      else this.attributes.set(name, String(value));
    },
    configurable: true
  });
}

for (const name of ["disabled", "checked", "readOnly", "multiple", "selected"]) {
  Object.defineProperty(Element.prototype, name, {
    get() {
      return this.attributes.has(name);
    },
    set(value) {
      if (value) this.attributes.set(name, "");
      else this.attributes.delete(name);
    },
    configurable: true
  });
}

const elementCache = new Map();
function stubElement(id) {
  if (!elementCache.has(id)) elementCache.set(id, new Element("div"));
  return elementCache.get(id);
}

const documentStub = {
  body: new Element("body"),
  documentElement: new Element("html"),
  head: new Element("head"),
  title: "",
  createElement(tag) {
    return new Element(tag);
  },
  createTextNode(text) {
    return new TextNode(text);
  },
  createDocumentFragment() {
    return new Fragment();
  },
  getElementById(id) {
    return stubElement(id);
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {},
  removeEventListener() {}
};

/* --------------------------------------------------------- load the renderer */

const viewerPath = path.join(__dirname, "..", "media", "reportViewer.js");
const viewerSource = fs.readFileSync(viewerPath, "utf8");

const sandbox = {
  document: documentStub,
  Node,
  console,
  setTimeout,
  clearTimeout,
  // Layout/scroll callbacks are irrelevant here; deferring them keeps init quiet.
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  localStorage: {
    store: new Map(),
    getItem(key) {
      return this.store.has(key) ? this.store.get(key) : null;
    },
    setItem(key, value) {
      this.store.set(key, String(value));
    },
    removeItem(key) {
      this.store.delete(key);
    }
  },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve("") }),
  URL,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  btoa: (value) => Buffer.from(value, "binary").toString("base64")
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.scrollTo = () => {};
sandbox.innerHeight = 900;
sandbox.innerWidth = 1200;
sandbox.pageYOffset = 0;
sandbox.scrollY = 0;
vm.createContext(sandbox);

// `currentImageContext` is a lexical binding, so expose a setter from inside the same scope.
vm.runInContext(
  `${viewerSource}\n;globalThis.__setImageContext = (ctx) => { currentImageContext = ctx; };`,
  sandbox,
  { filename: viewerPath }
);

/* ------------------------------------------------------------- serialization */

const VOID_ELEMENTS = new Set(["img", "br", "hr", "input", "meta", "link", "source", "wbr"]);

function toKebab(name) {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function serialize(node) {
  if (node.nodeType === 3) {
    return node.data;
  }
  const parts = [];
  for (const child of node.childNodes) parts.push(serialize(child));
  const inner = parts.join("");
  if (node.nodeType === 11) return inner;

  const attrs = [];
  if (node.id) attrs.push(`id="${node.id}"`);
  if (node.className) attrs.push(`class="${node.className}"`);
  for (const [key, value] of Object.entries(node.dataset || {})) {
    if (value !== undefined) attrs.push(`data-${toKebab(key)}="${value}"`);
  }
  for (const [key, value] of node.attributes || []) attrs.push(`${key}="${value}"`);
  const attrText = attrs.length ? ` ${attrs.join(" ")}` : "";
  if (VOID_ELEMENTS.has(node.localName)) return `<${node.localName}${attrText}>`;
  return `<${node.localName}${attrText}>${inner}</${node.localName}>`;
}

const MARKDOWN_CONTEXT = {
  imageContext: {
    images: {
      "attachments/legacy-root/Pasted image 20260112202650.png":
        "https://file+.vscode-resource.vscode-cdn.net/vault/attachments/legacy-root/Pasted%20image%2020260112202650.png",
      "attachments/legacy-root/微信图片_20251204235011_22_41 2.jpg":
        "https://file+.vscode-resource.vscode-cdn.net/vault/attachments/legacy-root/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20251204235011_22_41%202.jpg"
    },
    missing: new Set(),
    imageBaseUri: "https://file+.vscode-resource.vscode-cdn.net/doc/",
    vaultBaseUri: "https://file+.vscode-resource.vscode-cdn.net/vault/"
  }
};

// Simulates a path typed during editing: the extension has not resolved it yet, so the
// renderer must fall back to the base URIs it was given.
const FALLBACK_CONTEXT = {
  images: {},
  missing: new Set(),
  imageBaseUri: "https://file+.vscode-resource.vscode-cdn.net/doc/",
  vaultBaseUri: "https://file+.vscode-resource.vscode-cdn.net/vault/"
};

function render(markdown, imageContext) {
  sandbox.__setImageContext(imageContext || { images: {}, missing: new Set(), imageBaseUri: "", vaultBaseUri: "" });
  const fragment = sandbox.renderMarkdown(markdown, {
    name: "demo.md",
    label: "demo",
    content: markdown,
    headings: []
  });
  return serialize(fragment);
}

/* ------------------------------------------------------------------- tests */

// 1. Obsidian image embed resolves through the payload map (spaces percent-encoded).
{
  const html = render("![[attachments/legacy-root/Pasted image 20260112202650.png]]", MARKDOWN_CONTEXT.imageContext);
  assert.match(html, /<span class="md-image" data-image-target="attachments\/legacy-root\/Pasted image 20260112202650\.png">/);
  assert.match(html, /src="https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\/vault\/attachments\/legacy-root\/Pasted%20image%2020260112202650\.png"/);
  assert.doesNotMatch(html, /!\[\[/);
  console.log("ok - Obsidian ![[image]] embed renders an <img> with the resolved URI");
}

// 2. Non-ASCII file name with a space survives encoding.
{
  const html = render("![[attachments/legacy-root/微信图片_20251204235011_22_41 2.jpg]]", MARKDOWN_CONTEXT.imageContext);
  assert.match(html, /%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20251204235011_22_41%202\.jpg/);
  console.log("ok - non-ASCII/space file names render with encoded URIs");
}

// 3. A plain Markdown image renders instead of leaving a stray "!" and a link.
{
  const html = render("![示意图](images/demo.png)", FALLBACK_CONTEXT);
  assert.match(html, /<img class="md-image-el"[^>]*>/);
  assert.match(html, /alt="示意图"/);
  assert.match(html, /src="https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\/doc\/images\/demo\.png"/);
  assert.doesNotMatch(html, /<a /);
  console.log("ok - ![alt](path) renders an image, not a stray bang plus link");
}

// 4. Obsidian width syntax and a missing file fall back to a labelled placeholder.
{
  const html = render("![[images/shot.png|320]]", FALLBACK_CONTEXT);
  assert.match(html, /data-image-width="320"/);
  assert.match(html, /src="https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\/vault\/images\/shot\.png"/);

  const missing = render("![[images/nope.png]]", {
    ...FALLBACK_CONTEXT,
    missing: new Set(["images/nope.png"])
  });
  assert.match(missing, /md-image-placeholder/);
  assert.match(missing, /找不到图片/);
  assert.doesNotMatch(missing, /<img/);
  console.log("ok - |width syntax applied and missing images show a placeholder");
}

// 5. Not an image: ![[Some note]] stays a navigable wikilink, not a broken image.
{
  const html = render("![[DBG]]");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Some|<a /);
  console.log("ok - non-image ![[note]] still renders as a wikilink");
}

// 5b. `![text](note.md)` is not an image either: keep the bang and render the link.
{
  const html = render("![说明](note.md)");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /!<a href="note\.md"/);
  console.log("ok - ![text](note.md) stays a plain link with its leading bang");
}

// 5c. Remote images are passed through untouched.
{
  const html = render("![远程](https://example.com/pic.png)");
  assert.match(html, /<img class="md-image-el"/);
  assert.match(html, /src="https:\/\/example\.com\/pic\.png"/);
  console.log("ok - remote image URLs are used as-is");
}

// 6. Indented lines without list markers keep their hierarchy (the _Synergy.md case).
{
  const source = [
    "攻击方式",
    "\t类似魔王终局中的煞、幽魂、血色箭这个层级的元素",
    "\t狙击：攻击最靠左的敌人",
    "\t\t攻击力低",
    "\t奥术飞弹：攻击随机敌人",
    "\t\t攻击力低"
  ].join("\n");
  const html = render(source);
  assert.match(html, /class="md-outline-block/);
  assert.equal((html.match(/md-indent-line/g) || []).length, 6);
  // One tab = one level, two tabs = two levels.
  assert.match(html, /data-depth="0"[^>]*>攻击方式</);
  assert.match(html, /data-depth="1"[^>]*>狙击：攻击最靠左的敌人</);
  assert.match(html, /data-depth="2"[^>]*>攻击力低</);
  assert.doesNotMatch(html, /攻击方式 类似/);
  console.log("ok - tab-indented outline keeps 6 distinct lines with correct depths");
}

// 7. Plain prose still joins into a single soft-wrapped paragraph.
{
  const html = render("这是一段普通文字，\n在源码里换行继续。");
  assert.match(html, /<p class="md-block[^>]*>这是一段普通文字， 在源码里换行继续。<\/p>/);
  assert.doesNotMatch(html, /md-outline-block/);
  console.log("ok - unindented prose still soft-wraps into one paragraph");
}

// 8. Nested task list items are indented by level.
{
  const source = ["- [ ] 关键词", "\t- [x] ==充能==", "\t\t==电能值+1=="].join("\n");
  const html = render(source);
  assert.match(html, /data-depth="0"[^>]*>.*关键词/);
  assert.match(html, /data-depth="1"[^>]*>.*充能/);
  assert.match(html, /data-depth="2"[^>]*>.*电能值\+1/);
  console.log("ok - nested task list items carry increasing indent levels");
}

// 9. ==highlight== renders as <mark>, including inside headings.
{
  const inline = render("这是 ==重点== 内容");
  assert.match(inline, /<mark class="reading-native-highlight">重点<\/mark>/);

  const heading = render("## ==倾向于单色的流派==");
  assert.match(heading, /<mark class="reading-native-highlight">倾向于单色的流派<\/mark>/);
  assert.doesNotMatch(heading, /==倾向于单色的流派==/);
  console.log("ok - ==highlight== renders as <mark> in body text and headings");
}

// 10. A realistic slice of the reported document keeps images and structure together.
{
  const source = [
    "---",
    "Date: 2025-09-10",
    "---",
    "![[attachments/legacy-root/Pasted image 20260112202650.png]]",
    "",
    "# 骨架",
    "Risk",
    "\t辅助职能",
    "\tHero",
    "",
    "- [ ] 关键词",
    "\t- [x] ==充能=="
  ].join("\n");
  const html = render(source, MARKDOWN_CONTEXT.imageContext);
  assert.match(html, /<img class="md-image-el"/);
  assert.match(html, /<mark class="reading-native-highlight">充能<\/mark>/);
  assert.match(html, /md-outline-block/);
  assert.match(html, /data-depth="1"[^>]*>Hero</);
  console.log("ok - combined document keeps frontmatter, image, outline and highlight");

// 11. End-to-end on the note that reported the problem, when it is present on this machine.
{
  const reportedNote =
    "/Users/ahs/Documents/快捷指令/Games/Projects/_立项中/幸运房东like/Synergy/_Synergy.md";
  if (!fs.existsSync(reportedNote)) {
    console.log(`skip - reported note not present at ${reportedNote}`);
  } else {
    const source = fs.readFileSync(reportedNote, "utf8");
    const html = render(source, MARKDOWN_CONTEXT.imageContext);

    assert.equal((html.match(/<img /g) || []).length, 16, "all 16 embeds should render as images");
    assert.equal((html.match(/md-image-placeholder/g) || []).length, 0, "no image should fall back to a placeholder");
    assert.doesNotMatch(html, /!\[\[/, "no raw ![[ embed syntax should leak into the output");
    assert.doesNotMatch(html, /==[^=<>]{1,40}==/, "no raw ==highlight== markers should leak into the output");

    // The "棋子基础特征" outline is the clearest example of the indentation fix.
    const start = html.indexOf("棋子基础特征");
    const section = html.slice(start, start + 2000);
    assert.match(section, /data-depth="0"[^>]*>攻击方式</);
    assert.match(section, /data-depth="1"[^>]*>狙击：攻击最靠左的敌人</);
    assert.match(section, /data-depth="2"[^>]*>攻击力低</);
    // Previously the whole block collapsed into one space-joined paragraph.
    assert.doesNotMatch(section, /攻击方式 类似魔王终局/);

    const depths = new Map();
    for (const match of html.matchAll(/data-depth="(\d+)"/g)) {
      depths.set(match[1], (depths.get(match[1]) || 0) + 1);
    }
    console.log(
      `ok - _Synergy.md renders 16 images with preserved nesting (depth histogram ${JSON.stringify(
        Object.fromEntries([...depths].sort())
      )})`
    );
  }
}
}

console.log("\nRender verification passed.");
