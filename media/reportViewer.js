const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

const gameTitle = document.getElementById("gameTitle");
const gameMeta = document.getElementById("gameMeta");
const reportLayout = document.getElementById("reportLayout");
const tocDock = document.getElementById("tocDock");
const tocToggle = document.getElementById("tocToggle");
const toc = document.getElementById("toc");
const reportContent = document.getElementById("reportContent");
const readerSettingsToggle = document.getElementById("readerSettingsToggle");
const readerSettingsPanel = document.getElementById("readerSettingsPanel");
const fontDecrease = document.getElementById("fontDecrease");
const fontIncrease = document.getElementById("fontIncrease");
const fontValue = document.getElementById("fontValue");
const hideOutlineNumbersInput = document.getElementById("hideOutlineNumbers");
let activeCitation = null;
let citeRefSerial = 0;
let citeFlashEndTimer = null;
let citeScrollMonitorFrame = null;
let activeTocLink = null;
let tocScrollSpyPaused = false;
let tocScrollSpyTimer = null;
let tocScrollSpyResumeTimer = null;

const SETTINGS_KEYS = {
  fontScale: "meowReportMarkdown.fontScale",
  hideOutlineNumbers: "meowReportMarkdown.hideOutlineNumbers"
};
const LEGACY_SETTINGS_KEYS = {
  contentFontScale: "meowReportMarkdown.contentFontScale",
  tocFontScale: "meowReportMarkdown.tocFontScale",
  hideTocNumbers: "meowReportMarkdown.hideTocNumbers"
};
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.1;

const readerSettings = {
  fontScale: 1,
  hideOutlineNumbers: false
};

initTocDock();
initTocResize();
initTocScrollSpy();
initReaderSettings();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "render") {
    renderReport(message.payload);
  }
});

document.addEventListener("click", handleReportClick);
document.addEventListener("click", handleReaderSettingsOutsideClick);

if (vscode) {
  postReadySignal();
}

function postReadySignal() {
  vscode.postMessage({ type: "ready" });
  window.requestAnimationFrame(() => {
    vscode.postMessage({ type: "ready" });
  });
  window.setTimeout(() => {
    vscode.postMessage({ type: "ready" });
  }, 100);
}

function initTocDock() {
  if (!tocDock || !tocToggle) {
    return;
  }

  const saved = localStorage.getItem("meowReportMarkdown.tocCollapsed");
  setTocCollapsed(saved === "1");

  tocToggle.addEventListener("click", () => {
    setTocCollapsed(!tocDock.classList.contains("collapsed"));
  });
}

function setTocCollapsed(collapsed) {
  if (!tocDock || !tocToggle) {
    return;
  }

  tocDock.classList.toggle("collapsed", collapsed);
  reportLayout?.classList.toggle("layout-toc-open", !collapsed);
  reportLayout?.classList.toggle("layout-toc-collapsed", collapsed);
  tocToggle.setAttribute("aria-expanded", String(!collapsed));
  tocToggle.textContent = collapsed ? "目录" : "收起目录";
  tocToggle.title = collapsed ? "展开目录" : "收起目录";
  localStorage.setItem("meowReportMarkdown.tocCollapsed", collapsed ? "1" : "0");

  if (collapsed) {
    if (activeTocLink) {
      activeTocLink.classList.remove("toc-active");
      activeTocLink = null;
    }
  } else {
    updateActiveToc();
  }
}

function initReaderSettings() {
  if (!readerSettingsToggle || !readerSettingsPanel) {
    return;
  }

  loadReaderSettings();
  applyReaderSettings();
  updateReaderSettingsUi();

  readerSettingsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setReaderSettingsOpen(!isReaderSettingsOpen());
  });

  fontDecrease?.addEventListener("click", () => {
    adjustFontScale(-FONT_SCALE_STEP);
  });
  fontIncrease?.addEventListener("click", () => {
    adjustFontScale(FONT_SCALE_STEP);
  });
  hideOutlineNumbersInput?.addEventListener("change", () => {
    readerSettings.hideOutlineNumbers = Boolean(hideOutlineNumbersInput.checked);
    saveReaderSettings();
    refreshOutlineLabels();
  });
}

function isReaderSettingsOpen() {
  return readerSettingsToggle?.getAttribute("aria-expanded") === "true";
}

function setReaderSettingsOpen(open) {
  if (!readerSettingsToggle || !readerSettingsPanel) {
    return;
  }
  readerSettingsToggle.setAttribute("aria-expanded", String(open));
  readerSettingsPanel.hidden = !open;
}

function handleReaderSettingsOutsideClick(event) {
  if (!isReaderSettingsOpen()) {
    return;
  }
  if (event.target.closest(".reader-settings-root")) {
    return;
  }
  setReaderSettingsOpen(false);
}

function loadReaderSettings() {
  const savedFontScale = Number.parseFloat(
    localStorage.getItem(SETTINGS_KEYS.fontScale) ||
      localStorage.getItem(LEGACY_SETTINGS_KEYS.contentFontScale) ||
      localStorage.getItem(LEGACY_SETTINGS_KEYS.tocFontScale) ||
      "1"
  );
  readerSettings.fontScale = clampFontScale(savedFontScale);
  readerSettings.hideOutlineNumbers =
    localStorage.getItem(SETTINGS_KEYS.hideOutlineNumbers) === "1" ||
    localStorage.getItem(LEGACY_SETTINGS_KEYS.hideTocNumbers) === "1";
}

function saveReaderSettings() {
  localStorage.setItem(SETTINGS_KEYS.fontScale, String(readerSettings.fontScale));
  localStorage.setItem(SETTINGS_KEYS.hideOutlineNumbers, readerSettings.hideOutlineNumbers ? "1" : "0");
}

function clampFontScale(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(value * 10) / 10));
}

function adjustFontScale(delta) {
  readerSettings.fontScale = clampFontScale(readerSettings.fontScale + delta);
  saveReaderSettings();
  applyReaderSettings();
  updateReaderSettingsUi();
}

function applyReaderSettings() {
  document.documentElement.style.setProperty("--font-scale", String(readerSettings.fontScale));
}

function updateReaderSettingsUi() {
  if (fontValue) {
    fontValue.textContent = formatFontScaleLabel(readerSettings.fontScale);
  }
  if (hideOutlineNumbersInput) {
    hideOutlineNumbersInput.checked = readerSettings.hideOutlineNumbers;
  }
  fontDecrease?.toggleAttribute("disabled", readerSettings.fontScale <= FONT_SCALE_MIN);
  fontIncrease?.toggleAttribute("disabled", readerSettings.fontScale >= FONT_SCALE_MAX);
}

function formatFontScaleLabel(scale) {
  return `${Math.round(scale * 100)}%`;
}

function getOutlineLabel(outlineNumber, text) {
  if (readerSettings.hideOutlineNumbers) {
    return String(text || "").trim();
  }
  return formatOutlineLabel(outlineNumber, text);
}

function setOutlineLabel(element, outlineNumber, text) {
  element.dataset.outlineNumber = String(outlineNumber || "");
  element.dataset.outlineText = String(text || "");
  element.textContent = getOutlineLabel(outlineNumber, text);
}

function refreshOutlineLabels() {
  for (const node of document.querySelectorAll("[data-outline-text]")) {
    node.textContent = getOutlineLabel(node.dataset.outlineNumber, node.dataset.outlineText);
  }
}

function initTocScrollSpy() {
  window.addEventListener(
    "scroll",
    () => {
      if (tocScrollSpyPaused) {
        return;
      }
      if (tocScrollSpyTimer) {
        return;
      }
      tocScrollSpyTimer = window.setTimeout(() => {
        tocScrollSpyTimer = null;
        updateActiveToc();
      }, 50);
    },
    { passive: true }
  );
}

function getScrollReferenceLine() {
  const topbarHeight =
    Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--topbar-height"), 10) || 38;
  return topbarHeight + 12;
}

function getPageScroller() {
  return document.scrollingElement || document.documentElement || document.body;
}

function getScrollTop() {
  const scroller = getPageScroller();
  return scroller.scrollTop || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function setScrollTop(top, behavior = "smooth") {
  const nextTop = Math.max(0, top);
  window.scrollTo({ top: nextTop, left: 0, behavior });
}

function scrollElementToViewport(target, { block = "center", behavior = "smooth" } = {}) {
  if (!target || !document.body.contains(target)) {
    return;
  }

  const rect = target.getBoundingClientRect();
  const currentTop = getScrollTop();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const topbarOffset = getScrollReferenceLine();
  const visibleTop = topbarOffset;
  const visibleBottom = viewportHeight - 16;
  const visibleHeight = Math.max(1, visibleBottom - visibleTop);
  let nextTop = currentTop + rect.top - visibleTop - Math.max(0, (visibleHeight - rect.height) / 2);

  if (block === "start") {
    nextTop = currentTop + rect.top - visibleTop;
  } else if (block === "nearest") {
    if (rect.top >= visibleTop && rect.bottom <= visibleBottom) {
      return;
    }
    if (rect.top < visibleTop) {
      nextTop = currentTop + rect.top - topbarOffset;
    } else {
      nextTop = currentTop + rect.bottom - visibleBottom;
    }
  }

  setScrollTop(nextTop, behavior);
}

function updateActiveToc() {
  if (!toc || tocDock?.classList.contains("collapsed")) {
    return;
  }

  const links = Array.from(toc.querySelectorAll("a[data-anchor]"));
  const referenceLine = getScrollReferenceLine();
  let nextActive = null;

  for (const link of links) {
    const target = document.getElementById(link.dataset.anchor);
    if (!target) {
      continue;
    }
    if (target.getBoundingClientRect().top <= referenceLine) {
      nextActive = link;
    }
  }

  setActiveTocLink(getVisibleTocLink(nextActive), { expandAncestors: false });
}

function isTocLinkHiddenByCollapse(link) {
  if (!link) {
    return false;
  }

  let node = link;
  while (node && node !== toc) {
    const childrenWrap = node.closest(".toc-branch-children");
    if (!childrenWrap) {
      break;
    }
    const parentBranch = childrenWrap.parentElement;
    if (parentBranch?.dataset.collapsed === "1") {
      return true;
    }
    node = parentBranch;
  }

  return false;
}

function getParentTocLink(link) {
  if (!link) {
    return null;
  }

  const branch = link.closest(".toc-branch");
  if (!branch) {
    return null;
  }

  const parentChildren = branch.parentElement?.closest(".toc-branch-children");
  if (!parentChildren) {
    return null;
  }

  const parentBranch = parentChildren.parentElement;
  return parentBranch?.querySelector(":scope > .toc-branch-row > a") ?? null;
}

function getVisibleTocLink(link) {
  let current = link;
  while (current && isTocLinkHiddenByCollapse(current)) {
    current = getParentTocLink(current);
  }
  return current;
}

function initTocResize() {
  const handle = document.getElementById("tocResizeHandle");
  if (!handle || !tocDock) {
    return;
  }

  const savedWidth = localStorage.getItem("meowReportMarkdown.tocWidth");
  if (savedWidth) {
    document.documentElement.style.setProperty("--toc-width", savedWidth);
  }

  const minWidth = 200;
  const maxWidth = 520;

  handle.addEventListener("mousedown", (event) => {
    if (tocDock.classList.contains("collapsed")) {
      return;
    }
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = tocDock.getBoundingClientRect().width;
    handle.classList.add("is-dragging");
    tocDock.classList.add("is-resizing");

    const onMove = (moveEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + (moveEvent.clientX - startX)));
      document.documentElement.style.setProperty("--toc-width", `${Math.round(nextWidth)}px`);
    };

    const onUp = () => {
      handle.classList.remove("is-dragging");
      tocDock.classList.remove("is-resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const width = getComputedStyle(document.documentElement).getPropertyValue("--toc-width").trim();
      if (width) {
        localStorage.setItem("meowReportMarkdown.tocWidth", width);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function setActiveTocLink(link, { expandAncestors = true } = {}) {
  if (activeTocLink === link) {
    return;
  }

  if (activeTocLink) {
    activeTocLink.classList.remove("toc-active");
  }

  activeTocLink = link;

  if (!link) {
    return;
  }

  if (expandAncestors) {
    expandTocAncestors(link);
  }
  link.classList.add("toc-active");
  link.scrollIntoView({ block: "nearest" });
}

function expandTocAncestors(link) {
  let branch = link.closest(".toc-branch");
  while (branch) {
    branch.dataset.collapsed = "0";
    const foldButton = branch.querySelector(":scope > .toc-branch-row > .toc-fold");
    if (foldButton) {
      foldButton.setAttribute("aria-expanded", "true");
      foldButton.textContent = "▾";
    }
    branch = branch.parentElement?.closest(".toc-branch");
  }
}

function toggleTocBranch(branch) {
  if (!branch) {
    return;
  }
  const collapsed = branch.dataset.collapsed === "1";
  branch.dataset.collapsed = collapsed ? "0" : "1";
  const foldButton = branch.querySelector(":scope > .toc-branch-row > .toc-fold");
  if (foldButton) {
    foldButton.setAttribute("aria-expanded", String(!collapsed));
    foldButton.textContent = collapsed ? "▾" : "▸";
  }
  updateActiveToc();
}

function pauseTocScrollSpy(durationMs = 900) {
  tocScrollSpyPaused = true;
  if (tocScrollSpyResumeTimer) {
    window.clearTimeout(tocScrollSpyResumeTimer);
  }
  tocScrollSpyResumeTimer = window.setTimeout(() => {
    tocScrollSpyPaused = false;
    tocScrollSpyResumeTimer = null;
    updateActiveToc();
  }, durationMs);
}

function scrollToAnchor(anchorId) {
  if (!anchorId) {
    return;
  }

  const target =
    document.getElementById(anchorId) ||
    document.getElementById(decodeURIComponent(anchorId));

  if (!target) {
    return;
  }

  const link = Array.from(toc?.querySelectorAll("a[data-anchor]") || []).find(
    (item) => item.dataset.anchor === anchorId
  );
  if (link) {
    setActiveTocLink(link);
  }

  pauseTocScrollSpy();
  scrollElementToViewport(target, { block: "start", behavior: "smooth" });
}

function createTocLink(className, anchorId, outlineNumber, text, level = 0) {
  const link = document.createElement("a");
  link.className = className;
  link.href = `#${anchorId}`;
  link.dataset.anchor = anchorId;
  link.dataset.level = String(level);
  setOutlineLabel(link, outlineNumber, text);
  return link;
}

function renderReport(payload) {
  gameTitle.textContent = payload?.title || "Report Markdown Viewer";
  gameMeta.textContent = payload?.meta || "";
  gameMeta.hidden = !payload?.meta;
  document.title = payload?.title || "Report Markdown Viewer";

  toc.innerHTML = "";
  reportContent.innerHTML = "";
  activeCitation = null;
  citeRefSerial = 0;

  if (!payload?.files?.length) {
    renderError("No markdown content found.");
    return;
  }

  const tocInner = document.createElement("div");
  tocInner.className = "toc-inner";

  const numberedFiles = payload.files.map((file, index) => withOutlineNumbers(file, index + 1));
  for (const file of numberedFiles) {
    tocInner.appendChild(createFileToc(file));
    reportContent.appendChild(renderFile(file));
  }
  toc.appendChild(tocInner);
  updateActiveToc();
}

function createFileToc(file) {
  const section = document.createElement("section");
  section.className = "toc-file";
  const fileAnchor = `file-${slugify(file.name)}`;
  const headingTree = buildHeadingTree(file.numberedHeadings || []);

  if (!headingTree.length) {
    section.appendChild(createTocLink("toc-file-title", fileAnchor, file.outlineNumber, file.label, 0));
    return section;
  }

  section.appendChild(
    createTocBranch({
      anchorId: fileAnchor,
      outlineNumber: file.outlineNumber,
      text: file.label,
      className: "toc-file-title",
      level: 0,
      children: headingTree
    })
  );
  return section;
}

function buildHeadingTree(headings) {
  const root = { children: [] };
  const stack = [{ level: 0, node: root }];

  for (const heading of headings) {
    const item = { heading, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(item);
    stack.push({ level: heading.level, node: item });
  }

  return root.children;
}

function createTocBranch({ anchorId, outlineNumber, text, className, level, children }) {
  const branch = document.createElement("div");
  branch.className = "toc-branch";
  branch.dataset.collapsed = "0";

  const row = document.createElement("div");
  row.className = "toc-branch-row";

  if (children.length) {
    const foldButton = document.createElement("button");
    foldButton.type = "button";
    foldButton.className = "toc-fold";
    foldButton.setAttribute("aria-expanded", "true");
    foldButton.setAttribute("aria-label", "折叠子目录");
    foldButton.textContent = "▾";
    row.appendChild(foldButton);
  }

  row.appendChild(createTocLink(className, anchorId, outlineNumber, text, level));
  branch.appendChild(row);

  if (children.length) {
    const childWrap = document.createElement("div");
    childWrap.className = "toc-branch-children";
    for (const child of children) {
      childWrap.appendChild(renderHeadingNode(child));
    }
    branch.appendChild(childWrap);
  }

  return branch;
}

function renderHeadingNode(node) {
  return createTocBranch({
    anchorId: node.heading.anchor,
    outlineNumber: node.heading.outlineNumber,
    text: node.heading.cleanText,
    className: `toc-heading level-${Math.min(node.heading.level, 4)}`,
    level: node.heading.level,
    children: node.children
  });
}

function renderFile(file) {
  const section = document.createElement("section");
  section.className = "report-file";
  section.id = `file-${slugify(file.name)}`;
  const title = document.createElement("h1");
  setOutlineLabel(title, file.outlineNumber, file.label);
  section.appendChild(title);
  section.appendChild(renderMarkdown(file.content, file));
  return section;
}

function withOutlineNumbers(file, fileNumber) {
  const counters = [];
  const numberedHeadings = (file.headings || []).map((heading) => {
    const level = Math.max(1, Math.min(Number(heading.level) || 1, 6));
    counters.length = level;
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    for (let index = 0; index < level - 1; index += 1) {
      if (!counters[index]) counters[index] = 1;
    }
    const outlineNumber = [fileNumber, ...counters.slice(0, level)].join(".");
    return {
      ...heading,
      cleanText: stripOutlinePrefix(heading.text),
      outlineNumber
    };
  });
  return {
    ...file,
    outlineNumber: String(fileNumber),
    numberedHeadings
  };
}

function renderMarkdown(content, file) {
  const fragment = document.createDocumentFragment();
  const lines = normalizeMarkdownLines(content);
  const context = { fileKey: slugify(file.name) };
  let paragraph = [];
  let inCode = false;
  let codeLines = [];
  let tableRows = [];
  let headingIndex = 0;

  function flushParagraph() {
    if (!paragraph.length) return;
    const p = document.createElement("p");
    appendInlineMarkdown(p, paragraph.join(" "), context);
    fragment.appendChild(p);
    paragraph = [];
  }

  function flushTable() {
    if (!tableRows.length) return;
    fragment.appendChild(renderTable(tableRows, context));
    tableRows = [];
  }

  function flushCode() {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeLines.join("\n");
    pre.appendChild(code);
    fragment.appendChild(pre);
    codeLines = [];
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      flushParagraph();
      flushTable();
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (isTableRow(line)) {
      flushParagraph();
      tableRows.push(parseTableRow(line));
      continue;
    }
    const sourceLine = parseSourceLine(line);
    if (sourceLine) {
      flushParagraph();
      flushTable();
      fragment.appendChild(renderSourceLine(sourceLine, context));
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushTable();
      const level = Math.min(heading[1].length + 1, 6);
      const h = document.createElement(`h${level}`);
      const numberedHeading = file.numberedHeadings?.[headingIndex];
      const rawText = heading[2].replace(/\s+#*$/, "").trim();
      const cleanText = numberedHeading?.cleanText || stripOutlinePrefix(rawText);
      const outlineNumber = numberedHeading?.outlineNumber;
      if (outlineNumber) {
        setOutlineLabel(h, outlineNumber, cleanText);
      } else {
        h.textContent = cleanText;
      }
      h.id = numberedHeading?.anchor || makeFallbackAnchor(file.name, headingIndex, cleanText);
      headingIndex += 1;
      fragment.appendChild(h);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushTable();
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      flushTable();
      const item = document.createElement("p");
      item.className = `list-line ${ordered ? "ordered-line" : "unordered-line"}`;
      const marker = document.createElement("span");
      marker.className = "list-marker";
      marker.textContent = ordered ? `${ordered[1]}.` : "•";
      const body = document.createElement("span");
      body.className = "list-body";
      appendInlineMarkdown(body, ordered ? ordered[2].trim() : unordered[1].trim(), context);
      item.append(marker, body);
      fragment.appendChild(item);
      continue;
    }
    flushTable();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushTable();
  if (inCode) flushCode();
  return fragment;
}

function normalizeMarkdownLines(content) {
  const result = [];
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("|") && /\s+\|\s+\|/.test(line)) {
      for (const part of line.split(/\s+\|\s+\|/)) {
        const row = part.trim();
        if (!row) continue;
        const withLeftPipe = row.startsWith("|") ? row : `| ${row}`;
        result.push(withLeftPipe.endsWith("|") ? withLeftPipe : `${withLeftPipe} |`);
      }
      continue;
    }
    result.push(rawLine);
  }
  return result;
}

function isTableRow(line) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && (trimmed.match(/\|/g) || []).length >= 2;
}

function parseSourceLine(line) {
  const match = /^\[cite[\s-]source\]\s*(\d+)\.\s+(.+)$/i.exec(String(line || "").trim());
  if (!match) {
    return null;
  }
  return {
    number: match[1],
    body: match[2].trim()
  };
}

function renderSourceLine(sourceLine, context) {
  const item = document.createElement("div");
  item.className = "list-line ordered-line source-line";
  item.id = makeSourceId(context.fileKey, sourceLine.number);
  item.dataset.sourceNumber = sourceLine.number;

  const marker = document.createElement("span");
  marker.className = "list-marker";
  marker.textContent = `${sourceLine.number}.`;

  const body = document.createElement("span");
  body.className = "list-body";
  appendInlineMarkdown(body, sourceLine.body, {
    ...context,
    disableCitations: true
  });
  item.append(marker, body);
  return item;
}

function stripOutlinePrefix(text) {
  return String(text || "")
    .trim()
    .replace(/^\s*(?:第[一二三四五六七八九十百\d]+[章节部分篇]\s*[：:、.-]?\s*)/, "")
    .replace(/^\s*(?:\d+(?:\.\d+)+|\d+[.、])\s*/, "")
    .trim();
}

function formatOutlineLabel(number, text) {
  const label = String(text || "").trim();
  const outline = String(number || "").trim();
  if (!outline) return label;
  return outline.includes(".") ? `${outline} ${label}` : `${outline}. ${label}`;
}

function parseTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(row) {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderTable(rows, context = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "markdown-table";
  const hasHeader = rows.length > 1 && isTableSeparator(rows[1]);

  if (hasHeader) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    for (const cell of rows[0]) {
      const th = document.createElement("th");
      appendInlineMarkdown(th, cell, context);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = document.createElement("tbody");
  const bodyRows = hasHeader ? rows.slice(2) : rows;
  for (const row of bodyRows) {
    if (isTableSeparator(row)) continue;
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      appendInlineMarkdown(td, cell, context);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

function appendInlineMarkdown(parent, text, context = {}) {
  parent.appendChild(renderInlineMarkdown(text, context));
}

function renderInlineMarkdown(text, context = {}) {
  const fragment = document.createDocumentFragment();
  const value = String(text || "");
  let cursor = 0;

  while (cursor < value.length) {
    const linkStart = findNextInlineLinkStart(value, cursor);
    if (linkStart === -1) {
      appendInlineText(fragment, value.slice(cursor));
      break;
    }
    appendInlineText(fragment, value.slice(cursor, linkStart));

    const cite = /^\[cite:\s*([0-9,\s-]+)\]/i.exec(value.slice(linkStart));
    if (cite && !context.disableCitations) {
      fragment.appendChild(renderCitationGroup(cite[1], context));
      cursor = linkStart + cite[0].length;
      continue;
    }

    const labelEnd = value.indexOf("]", linkStart + 1);
    if (labelEnd === -1 || value[labelEnd + 1] !== "(") {
      appendInlineText(fragment, value.slice(linkStart, linkStart + 1));
      cursor = linkStart + 1;
      continue;
    }

    const hrefEnd = findMarkdownLinkEnd(value, labelEnd + 2);
    if (hrefEnd === -1) {
      appendInlineText(fragment, value.slice(linkStart, linkStart + 1));
      cursor = linkStart + 1;
      continue;
    }

    const label = value.slice(linkStart + 1, labelEnd);
    const href = value.slice(labelEnd + 2, hrefEnd).trim();
    if (isSafeHref(href)) {
      const link = document.createElement("a");
      link.href = href;
      link.title = href;
      appendInlineText(link, label || href);
      fragment.appendChild(link);
    } else {
      appendInlineText(fragment, value.slice(linkStart, hrefEnd + 1));
    }
    cursor = hrefEnd + 1;
  }

  return fragment;
}

function findNextInlineLinkStart(value, start) {
  let inCode = false;

  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "`") {
      inCode = !inCode;
      continue;
    }
    if (!inCode && value[index] === "[") {
      return index;
    }
  }

  return -1;
}

function appendInlineText(parent, text) {
  const value = String(text || "");
  if (!value) return;
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.appendChild(code);
    } else if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const em = document.createElement("em");
      em.textContent = part.slice(1, -1);
      parent.appendChild(em);
    } else {
      appendTextWithBareUrls(parent, part);
    }
  }
}

function appendTextWithBareUrls(parent, text) {
  const value = String(text || "");
  const urlPattern = /https?:\/\/[^\s<>"'，。；、（）【】《》]+/g;
  let cursor = 0;
  let match;

  while ((match = urlPattern.exec(value)) !== null) {
    const rawUrl = trimUrlTail(match[0]);
    const start = match.index;
    const end = start + rawUrl.length;
    if (start > cursor) parent.appendChild(document.createTextNode(value.slice(cursor, start)));

    if (isSafeHref(rawUrl)) {
      const link = document.createElement("a");
      link.href = rawUrl;
      link.title = rawUrl;
      link.textContent = rawUrl;
      parent.appendChild(link);
    } else {
      parent.appendChild(document.createTextNode(rawUrl));
    }

    cursor = end;
    if (end < match.index + match[0].length) {
      parent.appendChild(document.createTextNode(match[0].slice(rawUrl.length)));
      cursor = match.index + match[0].length;
    }
  }

  if (cursor < value.length) parent.appendChild(document.createTextNode(value.slice(cursor)));
}

function trimUrlTail(url) {
  return String(url || "").replace(/[),.;:!?]+$/g, "");
}

function renderCitationGroup(rawNumbers, context) {
  const group = document.createElement("span");
  group.className = "cite-group";
  const numbers = rawNumbers
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  numbers.forEach((number) => {
    const ref = document.createElement("button");
    ref.type = "button";
    ref.className = "cite-ref";
    ref.textContent = number;
    ref.id = `cite-ref-${citeRefSerial}`;
    ref.dataset.sourceTarget = makeSourceId(context.fileKey || "report", number);
    citeRefSerial += 1;
    group.appendChild(ref);
  });
  return group;
}

function handleReportClick(evt) {
  const cite = evt.target.closest(".cite-ref");
  if (cite) {
    evt.preventDefault();
    activateCitation(cite);
    return;
  }

  const returnButton = evt.target.closest(".source-return");
  if (returnButton) {
    evt.preventDefault();
    const citeRef = document.getElementById(returnButton.dataset.returnTarget);
    clearActiveCitation();
    if (citeRef) returnToCitation(citeRef);
    return;
  }

  const foldButton = evt.target.closest(".toc-fold");
  if (foldButton) {
    evt.preventDefault();
    toggleTocBranch(foldButton.closest(".toc-branch"));
    return;
  }

  const link = evt.target.closest("a");
  if (!link) {
    return;
  }

  const anchorId = link.dataset.anchor || "";
  const href = String(link.getAttribute("href") || "");

  if (anchorId || href.startsWith("#")) {
    evt.preventDefault();
    scrollToAnchor(anchorId || href.slice(1));
    return;
  }

  evt.preventDefault();
  if (/^(https?:|mailto:)/i.test(href)) {
    vscode?.postMessage({ type: "openExternal", href });
    return;
  }

  vscode?.postMessage({ type: "openFile", href });
}

function activateCitation(cite) {
  const source = document.getElementById(cite.dataset.sourceTarget);
  if (!source) return;
  clearCitationFlash();
  clearActiveCitation();

  activeCitation = {
    citeId: cite.id,
    sourceId: source.id
  };
  cite.classList.add("cite-active");
  source.classList.add("source-highlight");
  pauseTocScrollSpy(1200);
  scrollElementToViewport(source, { block: "center", behavior: "smooth" });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "source-return";
  button.textContent = "返回原文";
  button.title = "返回引用位置并清除高亮";
  button.dataset.returnTarget = cite.id;
  source.appendChild(button);
}

function clearActiveCitation() {
  activeCitation = null;
  document.querySelectorAll(".cite-active").forEach((node) => node.classList.remove("cite-active"));
  document.querySelectorAll(".source-highlight").forEach((node) => node.classList.remove("source-highlight"));
  document.querySelectorAll(".source-return").forEach((node) => node.remove());
}

function returnToCitation(citeRef) {
  clearCitationFlash();
  pauseTocScrollSpy(1200);
  scrollThenFlashCitation(citeRef);
}

function flashReturnedCitation(citeRef) {
  if (!document.body.contains(citeRef)) return;
  citeRef.classList.add("cite-return-highlight");
  citeFlashEndTimer = window.setTimeout(() => {
    citeRef.classList.remove("cite-return-highlight");
    citeFlashEndTimer = null;
  }, 1200);
}

function clearCitationFlash() {
  if (citeFlashEndTimer) {
    window.clearTimeout(citeFlashEndTimer);
    citeFlashEndTimer = null;
  }
  if (citeScrollMonitorFrame) {
    window.cancelAnimationFrame(citeScrollMonitorFrame);
    citeScrollMonitorFrame = null;
  }
  document.querySelectorAll(".cite-return-highlight").forEach((node) => {
    node.classList.remove("cite-return-highlight");
  });
}

function scrollThenFlashCitation(citeRef) {
  scrollElementToViewport(citeRef, { block: "center", behavior: "smooth" });

  const startTime = performance.now();
  let lastTop = Number.NaN;
  let stableFrames = 0;

  const monitorArrival = () => {
    if (!document.body.contains(citeRef)) {
      citeScrollMonitorFrame = null;
      return;
    }

    const rect = citeRef.getBoundingClientRect();
    const moved = Number.isNaN(lastTop) ? Infinity : Math.abs(rect.top - lastTop);
    lastTop = rect.top;
    stableFrames = moved < 1 ? stableFrames + 1 : 0;
    const arrived = stableFrames >= 3;
    const timedOut = performance.now() - startTime > 900;

    if (arrived || timedOut) {
      citeScrollMonitorFrame = null;
      flashReturnedCitation(citeRef);
      return;
    }

    citeScrollMonitorFrame = window.requestAnimationFrame(monitorArrival);
  };

  citeScrollMonitorFrame = window.requestAnimationFrame(monitorArrival);
}

function makeSourceId(fileKey, number) {
  return `source-${fileKey}-${String(number).replace(/[^0-9-]/g, "")}`;
}

function findMarkdownLinkEnd(value, start) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function isSafeHref(href) {
  const value = String(href || "").trim();
  if (!value || value.startsWith("#")) {
    return false;
  }

  if (/^(https?:|mailto:)/i.test(value)) {
    return true;
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return false;
  }

  return /\.md(?:[#?].*)?$/i.test(value);
}

function renderError(message) {
  gameTitle.textContent = "Report Markdown Viewer";
  gameMeta.textContent = message;
  gameMeta.hidden = false;
  reportContent.innerHTML = "";
  const error = document.createElement("div");
  error.className = "error-box";
  error.textContent = message;
  reportContent.appendChild(error);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeFallbackAnchor(fileName, index, text) {
  return slugify(`${fileName}-${index}-${text}`) || `${fileName}-${index}`;
}
