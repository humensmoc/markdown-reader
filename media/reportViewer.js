const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

const reportLayout = document.getElementById("reportLayout");
const tocDock = document.getElementById("tocDock");
const tocToggle = document.getElementById("tocToggle");
const toc = document.getElementById("toc");
const reportContent = document.getElementById("reportContent");
const reportEditor = document.getElementById("reportEditor");
const editorModeToggle = document.getElementById("editorModeToggle");
const editorSaveBtn = document.getElementById("editorSaveBtn");
const editorCancelBtn = document.getElementById("editorCancelBtn");
const readerSettingsToggle = document.getElementById("readerSettingsToggle");
const readerSettingsPanel = document.getElementById("readerSettingsPanel");
const fontDecrease = document.getElementById("fontDecrease");
const fontIncrease = document.getElementById("fontIncrease");
const fontValue = document.getElementById("fontValue");
const showTocNumbersInput = document.getElementById("showTocNumbers");
const showContentNumbersInput = document.getElementById("showContentNumbers");
const headingFontScaleInput = document.getElementById("headingFontScale");
const rainbowHeadingColorsInput = document.getElementById("rainbowHeadingColors");
let activeCitation = null;
let citeRefSerial = 0;
let citeFlashEndTimer = null;
let citeScrollMonitorFrame = null;
let activeTocLink = null;
let tocScrollSpyPaused = false;
let tocScrollSpyTimer = null;
let tocScrollSpyResumeTimer = null;
let latestDocumentText = "";
let editorDirty = false;
let activeInternalJump = null;
let internalLinkSerial = 0;

const SETTINGS_KEYS = {
  fontScale: "meowReportMarkdown.fontScale",
  showTocNumbers: "meowReportMarkdown.showTocNumbers",
  showContentNumbers: "meowReportMarkdown.showContentNumbers",
  headingFontScale: "meowReportMarkdown.headingFontScale",
  rainbowHeadingColors: "meowReportMarkdown.rainbowHeadingColors"
};
const LEGACY_SETTINGS_KEYS = {
  contentFontScale: "meowReportMarkdown.contentFontScale",
  tocFontScale: "meowReportMarkdown.tocFontScale",
  hideOutlineNumbers: "meowReportMarkdown.hideOutlineNumbers",
  hideTocNumbers: "meowReportMarkdown.hideTocNumbers"
};
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.1;

const readerSettings = {
  fontScale: 1,
  showTocNumbers: true,
  showContentNumbers: true,
  headingFontScale: true,
  rainbowHeadingColors: false
};

initTocDock();
initTocResize();
initTocScrollSpy();
initTocWheelIsolation();
initReaderSettings();
initEditorMode();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "render") {
    latestDocumentText = message?.payload?.files?.[0]?.content || "";
    if (document.body.classList.contains("editor-mode") && reportEditor && !editorDirty) {
      reportEditor.value = latestDocumentText;
    }
    renderReport(message.payload);
  }
});

document.addEventListener("click", handleReportClick);
document.addEventListener("click", handleReaderSettingsOutsideClick);
document.addEventListener("click", handleMermaidModalClick);
document.addEventListener("wheel", handleMermaidModalWheel, { passive: false });
document.addEventListener("mousedown", handleMermaidModalDragStart);
document.addEventListener("mousemove", handleMermaidModalDragMove);
document.addEventListener("mouseup", handleMermaidModalDragEnd);
document.addEventListener("keydown", handleMermaidModalKeydown);

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
  showTocNumbersInput?.addEventListener("change", () => {
    readerSettings.showTocNumbers = Boolean(showTocNumbersInput.checked);
    saveReaderSettings();
    applyReaderSettings();
    refreshOutlineLabels();
  });
  showContentNumbersInput?.addEventListener("change", () => {
    readerSettings.showContentNumbers = Boolean(showContentNumbersInput.checked);
    saveReaderSettings();
    applyReaderSettings();
    refreshOutlineLabels();
  });
  headingFontScaleInput?.addEventListener("change", () => {
    readerSettings.headingFontScale = Boolean(headingFontScaleInput.checked);
    saveReaderSettings();
    applyReaderSettings();
  });
  rainbowHeadingColorsInput?.addEventListener("change", () => {
    readerSettings.rainbowHeadingColors = Boolean(rainbowHeadingColorsInput.checked);
    saveReaderSettings();
    applyReaderSettings();
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

function initEditorMode() {
  if (!reportEditor || !editorModeToggle || !editorSaveBtn || !editorCancelBtn) {
    return;
  }

  editorModeToggle.addEventListener("click", () => {
    if (document.body.classList.contains("editor-mode")) {
      exitEditorMode({ discardChanges: false });
      return;
    }
    enterEditorMode();
  });

  editorSaveBtn.addEventListener("click", () => {
    if (!reportEditor || !vscode) {
      return;
    }
    const nextText = reportEditor.value;
    latestDocumentText = nextText;
    editorDirty = false;
    vscode.postMessage({ type: "saveContent", content: nextText });
    exitEditorMode({ discardChanges: false, skipConfirm: true });
  });

  editorCancelBtn.addEventListener("click", () => {
    exitEditorMode({ discardChanges: true });
  });

  reportEditor.addEventListener("input", () => {
    editorDirty = reportEditor.value !== latestDocumentText;
  });
}

function enterEditorMode() {
  if (!reportEditor || !editorModeToggle || !editorSaveBtn || !editorCancelBtn) {
    return;
  }
  if (isReaderSettingsOpen()) {
    setReaderSettingsOpen(false);
  }
  reportEditor.hidden = false;
  reportEditor.value = latestDocumentText;
  editorDirty = false;
  document.body.classList.add("editor-mode");
  editorModeToggle.hidden = true;
  editorSaveBtn.hidden = false;
  editorCancelBtn.hidden = false;
  window.requestAnimationFrame(() => reportEditor.focus());
}

function exitEditorMode({ discardChanges = false, skipConfirm = false } = {}) {
  if (!reportEditor || !editorModeToggle || !editorSaveBtn || !editorCancelBtn) {
    return;
  }
  if (document.body.classList.contains("editor-mode") && editorDirty && !discardChanges && !skipConfirm) {
    const confirmed = window.confirm("当前有未保存内容，确定退出编辑模式吗？");
    if (!confirmed) {
      return;
    }
  }
  if (discardChanges) {
    reportEditor.value = latestDocumentText;
  }
  editorDirty = false;
  reportEditor.hidden = true;
  document.body.classList.remove("editor-mode");
  editorModeToggle.hidden = false;
  editorSaveBtn.hidden = true;
  editorCancelBtn.hidden = true;
}

function loadReaderSettings() {
  const savedFontScale = Number.parseFloat(
    localStorage.getItem(SETTINGS_KEYS.fontScale) ||
      localStorage.getItem(LEGACY_SETTINGS_KEYS.contentFontScale) ||
      localStorage.getItem(LEGACY_SETTINGS_KEYS.tocFontScale) ||
      "1"
  );
  readerSettings.fontScale = clampFontScale(savedFontScale);

  const legacyHideNumbers =
    localStorage.getItem(LEGACY_SETTINGS_KEYS.hideOutlineNumbers) === "1" ||
    localStorage.getItem(LEGACY_SETTINGS_KEYS.hideTocNumbers) === "1";
  readerSettings.showTocNumbers = readBooleanSetting(SETTINGS_KEYS.showTocNumbers, !legacyHideNumbers);
  readerSettings.showContentNumbers = readBooleanSetting(SETTINGS_KEYS.showContentNumbers, !legacyHideNumbers);
  readerSettings.headingFontScale = readBooleanSetting(SETTINGS_KEYS.headingFontScale, true);
  readerSettings.rainbowHeadingColors = readBooleanSetting(SETTINGS_KEYS.rainbowHeadingColors, false);
}

function readBooleanSetting(key, defaultValue) {
  const saved = localStorage.getItem(key);
  if (saved === null) {
    return defaultValue;
  }
  return saved === "1";
}

function saveReaderSettings() {
  localStorage.setItem(SETTINGS_KEYS.fontScale, String(readerSettings.fontScale));
  localStorage.setItem(SETTINGS_KEYS.showTocNumbers, readerSettings.showTocNumbers ? "1" : "0");
  localStorage.setItem(SETTINGS_KEYS.showContentNumbers, readerSettings.showContentNumbers ? "1" : "0");
  localStorage.setItem(SETTINGS_KEYS.headingFontScale, readerSettings.headingFontScale ? "1" : "0");
  localStorage.setItem(SETTINGS_KEYS.rainbowHeadingColors, readerSettings.rainbowHeadingColors ? "1" : "0");
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
  document.documentElement.classList.toggle("heading-font-scale", readerSettings.headingFontScale);
  document.documentElement.classList.toggle("rainbow-headings", readerSettings.rainbowHeadingColors);
  document.documentElement.classList.toggle("show-content-numbers", readerSettings.showContentNumbers);
  document.documentElement.classList.toggle("show-toc-numbers", readerSettings.showTocNumbers);
}

function updateReaderSettingsUi() {
  if (fontValue) {
    fontValue.textContent = formatFontScaleLabel(readerSettings.fontScale);
  }
  if (showTocNumbersInput) {
    showTocNumbersInput.checked = readerSettings.showTocNumbers;
  }
  if (showContentNumbersInput) {
    showContentNumbersInput.checked = readerSettings.showContentNumbers;
  }
  if (headingFontScaleInput) {
    headingFontScaleInput.checked = readerSettings.headingFontScale;
  }
  if (rainbowHeadingColorsInput) {
    rainbowHeadingColorsInput.checked = readerSettings.rainbowHeadingColors;
  }
  fontDecrease?.toggleAttribute("disabled", readerSettings.fontScale <= FONT_SCALE_MIN);
  fontIncrease?.toggleAttribute("disabled", readerSettings.fontScale >= FONT_SCALE_MAX);
}

function formatFontScaleLabel(scale) {
  return `${Math.round(scale * 100)}%`;
}

function formatOutlineNumber(number) {
  const outline = String(number || "").trim();
  if (!outline) return "";
  return outline.includes(".") ? `${outline} ` : `${outline}. `;
}

function setOutlineLabel(element, outlineNumber, text, scope) {
  element.dataset.outlineNumber = String(outlineNumber || "");
  element.dataset.outlineText = String(text || "");
  element.dataset.outlineScope = scope;
  element.replaceChildren();

  const showNumbers = scope === "toc" ? readerSettings.showTocNumbers : readerSettings.showContentNumbers;
  const label = String(text || "").trim();

  if (showNumbers && outlineNumber) {
    const numberSpan = document.createElement("span");
    numberSpan.className = "outline-number";
    numberSpan.textContent = formatOutlineNumber(outlineNumber);

    const textSpan = document.createElement("span");
    textSpan.className = "outline-text";
    textSpan.textContent = label;

    element.append(numberSpan, textSpan);
    return;
  }

  const textSpan = document.createElement("span");
  textSpan.className = "outline-text";
  textSpan.textContent = label;
  element.appendChild(textSpan);
}

function refreshOutlineLabels() {
  for (const node of document.querySelectorAll("[data-outline-text]")) {
    const scope = node.dataset.outlineScope === "toc" ? "toc" : "content";
    setOutlineLabel(node, node.dataset.outlineNumber, node.dataset.outlineText, scope);
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

function initTocWheelIsolation() {
  if (!toc) {
    return;
  }

  toc.addEventListener(
    "wheel",
    (event) => {
      if (!toc || tocDock?.classList.contains("collapsed")) {
        return;
      }

      // Ignore mostly-horizontal trackpad gestures.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      const maxScrollTop = toc.scrollHeight - toc.clientHeight;
      const canScroll = maxScrollTop > 0;
      if (!canScroll) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const atTop = toc.scrollTop <= 0;
      const atBottom = toc.scrollTop >= maxScrollTop - 1;
      const scrollingUp = event.deltaY < 0;
      const scrollingDown = event.deltaY > 0;

      if ((scrollingUp && atTop) || (scrollingDown && atBottom)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { passive: false }
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
  const target = getAnchorTarget(anchorId);

  if (!target) {
    return null;
  }

  const link = Array.from(toc?.querySelectorAll("a[data-anchor]") || []).find(
    (item) => item.dataset.anchor === anchorId
  );
  if (link) {
    setActiveTocLink(link);
  }

  pauseTocScrollSpy();
  scrollElementToViewport(target, { block: "start", behavior: "smooth" });
  return target;
}

function getAnchorTarget(anchorId) {
  if (!anchorId) {
    return null;
  }
  const rawTarget = document.getElementById(anchorId) || document.getElementById(decodeURIComponent(anchorId));
  return normalizeAnchorTarget(rawTarget);
}

function normalizeAnchorTarget(target) {
  if (!target) {
    return null;
  }
  if (isHeadingElement(target)) {
    return target;
  }

  const isInlineAnchorMarker =
    (target.tagName === "SPAN" || target.tagName === "A") && !String(target.textContent || "").trim();
  if (!isInlineAnchorMarker) {
    return target;
  }

  let next = target.nextElementSibling;
  while (next) {
    if (isHeadingElement(next)) {
      return next;
    }
    next = next.nextElementSibling;
  }

  return target;
}

function isHeadingElement(element) {
  if (!element?.tagName) {
    return false;
  }
  return /^H[1-6]$/.test(element.tagName);
}

function createTocLink(className, anchorId, outlineNumber, text, level = 0) {
  const link = document.createElement("a");
  link.className = className;
  link.href = `#${anchorId}`;
  link.dataset.anchor = anchorId;
  link.dataset.level = String(level);
  setOutlineLabel(link, outlineNumber, text, "toc");
  return link;
}

function renderReport(payload) {
  const previousScrollTop = getScrollTop();
  document.title = payload?.title || "Report Markdown Viewer";

  closeMermaidModal();
  toc.innerHTML = "";
  reportContent.innerHTML = "";
  activeCitation = null;
  citeRefSerial = 0;
  internalLinkSerial = 0;
  clearActiveInternalJump();

  if (!payload?.files?.length) {
    renderError("No markdown content found.");
    return;
  }

  const tocInner = document.createElement("div");
  tocInner.className = "toc-inner";

  const numberedFiles = payload.files.map((file) => withOutlineNumbers(file));
  for (const file of numberedFiles) {
    tocInner.appendChild(createFileToc(file));
    reportContent.appendChild(renderFile(file));
  }
  toc.appendChild(tocInner);
  updateActiveToc();
  void hydrateMermaid(reportContent);
  window.requestAnimationFrame(() => {
    setScrollTop(previousScrollTop, "auto");
  });
}

function decorateInternalAnchorLink(link) {
  if (!link) {
    return;
  }
  link.classList.add("cite-ref");
  if (!link.id) {
    link.id = `internal-link-${internalLinkSerial}`;
    internalLinkSerial += 1;
  }
}

function ensureElementId(element, prefix = "internal-link") {
  if (!element) {
    return "";
  }
  if (element.id) {
    return element.id;
  }
  const unique = `${prefix}-${internalLinkSerial}`;
  internalLinkSerial += 1;
  element.id = unique;
  return unique;
}

function activateInternalJump(sourceLink, anchorId) {
  const target = getAnchorTarget(anchorId);
  if (!target) {
    return false;
  }

  clearCitationFlash();
  clearActiveCitation();
  clearActiveInternalJump();

  decorateInternalAnchorLink(sourceLink);
  const sourceId = sourceLink.id;
  sourceLink.classList.add("cite-active");

  activeInternalJump = {
    sourceId,
    targetId: target.id || ensureElementId(target, "jump-target")
  };

  target.classList.add("jump-target", "source-highlight");

  const tocLink = Array.from(toc?.querySelectorAll("a[data-anchor]") || []).find(
    (item) => item.dataset.anchor === anchorId
  );
  if (tocLink) {
    setActiveTocLink(tocLink);
  }

  pauseTocScrollSpy(1200);
  scrollElementToViewport(target, { block: "center", behavior: "smooth" });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "source-return";
  button.textContent = "返回来源";
  button.title = "返回内链来源并清除高亮";
  button.dataset.returnTarget = sourceId;
  target.appendChild(button);

  return true;
}

function clearActiveInternalJump() {
  activeInternalJump = null;
  document.querySelectorAll("a.cite-ref.cite-active").forEach((node) => node.classList.remove("cite-active"));
  document.querySelectorAll(".jump-target").forEach((node) => {
    node.classList.remove("jump-target", "source-highlight");
    node.querySelectorAll(".source-return").forEach((button) => button.remove());
  });
}

function createFileToc(file) {
  const section = document.createElement("section");
  section.className = "toc-file";
  const headingTree = buildHeadingTree(file.numberedHeadings || []);

  if (!headingTree.length) {
    return section;
  }

  for (const node of headingTree) {
    section.appendChild(renderHeadingNode(node));
  }
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
    className: `toc-heading level-${Math.min(node.heading.level, 6)}`,
    level: node.heading.level,
    children: node.children
  });
}

function renderFile(file) {
  const section = document.createElement("section");
  section.className = "report-file";
  section.id = `doc-${slugify(file.name)}`;
  section.appendChild(renderMarkdown(file.content, file));
  return section;
}

function withOutlineNumbers(file) {
  const counters = [];
  const numberedHeadings = (file.headings || []).map((heading) => {
    const level = Math.max(1, Math.min(Number(heading.level) || 1, 6));
    counters.length = level;
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    for (let index = 0; index < level - 1; index += 1) {
      if (!counters[index]) counters[index] = 1;
    }
    const outlineNumber = counters.slice(0, level).join(".");
    return {
      ...heading,
      cleanText: stripOutlinePrefix(heading.text),
      outlineNumber
    };
  });
  return {
    ...file,
    numberedHeadings
  };
}

function preprocessMarkdownContent(content) {
  const footnotes = new Map();
  const bodyLines = [];
  const rawLines = normalizeMarkdownLines(content);

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const match = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(String(line || "").trim());
    if (!match) {
      bodyLines.push(line);
      continue;
    }

    const id = match[1].trim().toLowerCase();
    let text = match[2].trim();
    while (index + 1 < rawLines.length && /^(?: {4,}|\t)/.test(rawLines[index + 1])) {
      index += 1;
      text += ` ${String(rawLines[index] || "").trim()}`;
    }
    footnotes.set(id, text);
  }

  return { lines: bodyLines, footnotes };
}

function parseBlockquote(lines, startIndex) {
  const parts = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = /^\s*>\s?(.*)$/.exec(lines[index]);
    if (!match) break;
    if (!match[1].trim() && parts.length) {
      parts.push({ text: "", lineIndex: -1 });
    } else if (match[1].trim()) {
      parts.push({ text: match[1].trim(), lineIndex: index });
    }
    index += 1;
  }

  return { parts, nextIndex: index };
}

function parseDefinitionList(lines, startIndex) {
  const items = [];
  let index = startIndex;
  let term = String(lines[index] || "").trim();
  let definitions = [];

  while (index < lines.length) {
    if (!term) break;

    const firstDef = /^\s*:\s+(.+)$/.exec(lines[index + 1] || "");
    if (!firstDef) {
      if (items.length) break;
      return null;
    }

    definitions = [firstDef[1].trim()];
    index += 2;

    while (index < lines.length) {
      const defLine = /^\s*:\s+(.+)$/.exec(lines[index]);
      if (defLine) {
        definitions.push(defLine[1].trim());
        index += 1;
        continue;
      }
      if (!String(lines[index] || "").trim()) break;

      const nextDef = /^\s*:\s+(.+)$/.exec(lines[index + 1] || "");
      if (!nextDef) break;

      items.push({ term, definitions });
      term = String(lines[index] || "").trim();
      definitions = [nextDef[1].trim()];
      index += 2;
    }

    items.push({ term, definitions });

    if (index >= lines.length || !String(lines[index] || "").trim()) break;
    if (!/^\s*:\s+/.test(lines[index + 1] || "")) break;

    term = String(lines[index] || "").trim();
    definitions = [];
  }

  return { items, nextIndex: index };
}

function isHtmlBlockLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.startsWith("<") || !trimmed.endsWith(">")) return false;
  if (trimmed.startsWith("<!--")) return true;
  return /^<[a-z][a-z0-9]*(?:\s|\/?>)/i.test(trimmed);
}

function renderBlockquote(parts, context) {
  const blockquote = document.createElement("blockquote");
  blockquote.className = "markdown-blockquote";
  const chunks = [];
  let current = [];

  for (const part of parts) {
    if (!part.text) {
      if (current.length) {
        chunks.push(current);
        current = [];
      }
      continue;
    }
    current.push(part);
  }
  if (current.length) chunks.push(current);

  for (const group of chunks) {
    for (const part of group) {
      const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(part.text);
      if (task) {
        blockquote.appendChild(
          renderTaskListItem(task[1].toLowerCase() === "x", task[2].trim(), context, part.lineIndex)
        );
        continue;
      }

      const unordered = /^\s*[-*+]\s+(.+)$/.exec(part.text);
      if (unordered) {
        const item = document.createElement("p");
        item.className = "list-line unordered-line";
        const marker = document.createElement("span");
        marker.className = "list-marker";
        marker.textContent = "•";
        const body = document.createElement("span");
        body.className = "list-body";
        appendInlineMarkdown(body, unordered[1].trim(), context);
        item.append(marker, body);
        blockquote.appendChild(item);
        continue;
      }

      const p = document.createElement("p");
      appendInlineMarkdown(p, part.text, context);
      blockquote.appendChild(p);
    }
  }

  return blockquote;
}

function renderDefinitionList(items, context) {
  const dl = document.createElement("dl");
  dl.className = "markdown-dl";

  for (const item of items) {
    const dt = document.createElement("dt");
    appendInlineMarkdown(dt, item.term, context);
    dl.appendChild(dt);
    for (const definition of item.definitions) {
      const dd = document.createElement("dd");
      appendInlineMarkdown(dd, definition, context);
      dl.appendChild(dd);
    }
  }

  return dl;
}

function renderTaskListItem(checked, bodyText, context, lineIndex = -1) {
  const item = document.createElement("p");
  item.className = "list-line task-line";
  if (checked) {
    item.classList.add("task-line--checked");
  }
  if (lineIndex >= 0) {
    item.dataset.lineIndex = String(lineIndex);
  }

  const marker = document.createElement("span");
  marker.className = "list-marker task-marker";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.className = "task-checkbox";
  checkbox.setAttribute("aria-label", checked ? "标记为未完成" : "标记为已完成");
  if (lineIndex >= 0 && vscode) {
    checkbox.addEventListener("change", () => {
      handleTaskCheckboxToggle(lineIndex, checkbox.checked, item, checkbox);
    });
  } else {
    checkbox.disabled = true;
  }
  marker.appendChild(checkbox);

  const body = document.createElement("span");
  body.className = "list-body";
  appendInlineMarkdown(body, bodyText, context);
  item.append(marker, body);
  return item;
}

function handleTaskCheckboxToggle(lineIndex, checked, item, checkbox) {
  if (document.body.classList.contains("editor-mode") || !vscode || lineIndex < 0) {
    checkbox.checked = !checked;
    return;
  }

  const lines = latestDocumentText.split(/\r?\n/);
  if (lineIndex >= lines.length) {
    checkbox.checked = !checked;
    return;
  }

  const line = lines[lineIndex];
  const blockquoteTask = /^(\s*>\s?)(\s*[-*+]\s+\[)([ xX])(\]\s+.+)$/.exec(line);
  if (blockquoteTask) {
    lines[lineIndex] = `${blockquoteTask[1]}${blockquoteTask[2]}${checked ? "x" : " "}${blockquoteTask[4]}`;
  } else {
    const task = /^(\s*[-*+]\s+\[)([ xX])(\]\s+.+)$/.exec(line);
    if (!task) {
      checkbox.checked = !checked;
      return;
    }
    lines[lineIndex] = `${task[1]}${checked ? "x" : " "}${task[3]}`;
  }

  const nextText = lines.join("\n");
  latestDocumentText = nextText;
  item.classList.toggle("task-line--checked", checked);
  checkbox.setAttribute("aria-label", checked ? "标记为未完成" : "标记为已完成");
  vscode.postMessage({ type: "saveContent", content: nextText });
}

function renderFootnoteRef(id, context) {
  const key = String(id || "").trim().toLowerCase();
  if (!context.footnotes?.has(key)) return null;

  if (!context.footnoteIndex) context.footnoteIndex = new Map();
  if (!context.footnoteRefs) context.footnoteRefs = [];

  let number = context.footnoteIndex.get(key);
  if (!number) {
    number = context.footnoteRefs.length + 1;
    context.footnoteIndex.set(key, number);
    context.footnoteRefs.push(key);
  }

  const sup = document.createElement("sup");
  sup.className = "footnote-ref";
  const link = document.createElement("a");
  link.href = `#fn-${context.fileKey}-${number}`;
  link.id = `fnref-${context.fileKey}-${number}`;
  link.dataset.anchor = `fn-${context.fileKey}-${number}`;
  decorateInternalAnchorLink(link);
  link.textContent = String(number);
  sup.appendChild(link);
  return sup;
}

function renderFootnotesSection(context) {
  if (!context.footnoteRefs?.length) return null;

  const section = document.createElement("section");
  section.className = "footnotes";
  section.appendChild(document.createElement("hr"));

  const list = document.createElement("ol");
  list.className = "footnote-list";

  for (const key of context.footnoteRefs) {
    const number = context.footnoteIndex.get(key);
    const item = document.createElement("li");
    item.id = `fn-${context.fileKey}-${number}`;
    appendInlineMarkdown(item, context.footnotes.get(key), {
      ...context,
      disableCitations: true
    });

    const back = document.createElement("a");
    back.href = `#fnref-${context.fileKey}-${number}`;
    back.dataset.anchor = `fnref-${context.fileKey}-${number}`;
    back.className = "footnote-backref";
    decorateInternalAnchorLink(back);
    back.textContent = " ↩";
    item.appendChild(back);
    list.appendChild(item);
  }

  section.appendChild(list);
  return section;
}

const HTML_ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

const HTML_FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "link",
  "meta",
  "base",
  "svg"
]);

const HTML_ALLOWED_ATTRS = {
  "*": ["class", "id", "title"],
  a: ["href"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"]
};

function appendSafeHtmlBlock(parent, html) {
  parent.appendChild(sanitizeHtmlToFragment(html));
}

function sanitizeHtmlToFragment(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const fragment = document.createDocumentFragment();

  for (const child of [...template.content.childNodes]) {
    const clean = sanitizeHtmlNode(child);
    if (!clean) continue;
    if (clean.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      fragment.appendChild(clean);
    } else {
      fragment.appendChild(clean);
    }
  }

  return fragment;
}

function sanitizeHtmlNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tag = node.tagName.toLowerCase();
  if (HTML_FORBIDDEN_TAGS.has(tag)) return null;

  if (!HTML_ALLOWED_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    for (const child of [...node.childNodes]) {
      const clean = sanitizeHtmlNode(child);
      if (clean) fragment.appendChild(clean);
    }
    return fragment;
  }

  const element = document.createElement(tag);
  const allowed = new Set([
    ...(HTML_ALLOWED_ATTRS["*"] || []),
    ...(HTML_ALLOWED_ATTRS[tag] || [])
  ]);

  for (const attribute of [...node.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on")) continue;
    if (!allowed.has(name)) continue;
    const value = attribute.value;
    if (name === "href" && !value.startsWith("#") && !isSafeHref(value)) continue;
    element.setAttribute(name, value);
  }

  for (const child of [...node.childNodes]) {
    const clean = sanitizeHtmlNode(child);
    if (clean) element.appendChild(clean);
  }

  return element;
}

function tryParseInlineHtml(value, start) {
  const slice = value.slice(start);
  const selfClosing = /^<(br|hr|wbr)\s*\/?>/i.exec(slice);
  if (selfClosing) {
    return { html: selfClosing[0], nextIndex: start + selfClosing[0].length };
  }

  const open = /^<([a-z][a-z0-9]*)\b([^>]*)>/i.exec(slice);
  if (!open) return null;

  const tag = open[1].toLowerCase();
  if (!HTML_ALLOWED_TAGS.has(tag)) return null;

  const openEnd = start + open[0].length;
  const closeTag = `</${tag}>`;
  const closeIndex = value.toLowerCase().indexOf(closeTag, openEnd);
  if (closeIndex === -1) return null;

  return {
    html: value.slice(start, closeIndex + closeTag.length),
    nextIndex: closeIndex + closeTag.length
  };
}

function renderMarkdown(content, file) {
  const fragment = document.createDocumentFragment();
  const preprocessed = preprocessMarkdownContent(content);
  const lines = preprocessed.lines;
  const context = {
    fileKey: slugify(file.name),
    footnotes: preprocessed.footnotes,
    footnoteIndex: new Map(),
    footnoteRefs: []
  };
  let paragraph = [];
  let inCode = false;
  let codeLang = "";
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
    const source = codeLines.join("\n");
    if (codeLang === "mermaid") {
      const block = document.createElement("div");
      block.className = "mermaid-block";
      block.dataset.mermaidSource = source;

      const toolbar = document.createElement("div");
      toolbar.className = "mermaid-toolbar";
      const expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "mermaid-expand-btn";
      expandBtn.title = "全屏查看";
      expandBtn.setAttribute("aria-label", "全屏查看");
      expandBtn.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3h3.5V4H4v2.5H3V3Zm10 0v3.5h-1V4h-2.5V3H13ZM3 13v-3.5h1V12h2.5v1H3Zm10 0h-3.5v-1H12v-2.5h1V13Z"/></svg>';
      toolbar.appendChild(expandBtn);

      const content = document.createElement("div");
      content.className = "mermaid-content";
      block.append(toolbar, content);
      fragment.appendChild(block);
    } else {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = source;
      pre.appendChild(code);
      fragment.appendChild(pre);
    }
    codeLines = [];
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (/^```/.test(line)) {
      flushParagraph();
      flushTable();
      if (inCode) {
        flushCode();
        codeLang = "";
      } else {
        const open = /^```([^\s`]*)/.exec(line.trim());
        codeLang = open && open[1] ? open[1].toLowerCase() : "";
      }
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
      const level = Math.min(heading[1].length, 6);
      const h = document.createElement(`h${level}`);
      const numberedHeading = file.numberedHeadings?.[headingIndex];
      const rawText = heading[2].replace(/\s+#*$/, "").trim();
      const cleanText = numberedHeading?.cleanText || stripOutlinePrefix(rawText);
      const outlineNumber = numberedHeading?.outlineNumber;
      if (outlineNumber) {
        setOutlineLabel(h, outlineNumber, cleanText, "content");
      } else {
        const textSpan = document.createElement("span");
        textSpan.className = "outline-text";
        textSpan.textContent = cleanText;
        h.appendChild(textSpan);
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
    if (/^\s*>/.test(line)) {
      flushParagraph();
      flushTable();
      const blockquote = parseBlockquote(lines, lineIndex);
      fragment.appendChild(renderBlockquote(blockquote.parts, context));
      lineIndex = blockquote.nextIndex - 1;
      continue;
    }
    if (isHtmlBlockLine(line)) {
      flushParagraph();
      flushTable();
      appendSafeHtmlBlock(fragment, line.trim());
      continue;
    }
    if (lineIndex + 1 < lines.length && /^\s*:\s+/.test(lines[lineIndex + 1])) {
      const definitionList = parseDefinitionList(lines, lineIndex);
      if (definitionList?.items?.length) {
        flushParagraph();
        flushTable();
        fragment.appendChild(renderDefinitionList(definitionList.items, context));
        lineIndex = definitionList.nextIndex - 1;
        continue;
      }
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (task) {
      flushParagraph();
      flushTable();
      fragment.appendChild(
        renderTaskListItem(task[1].toLowerCase() === "x", task[2].trim(), context, lineIndex)
      );
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

  const footnotesSection = renderFootnotesSection(context);
  if (footnotesSection) fragment.appendChild(footnotesSection);

  return fragment;
}

async function hydrateMermaid(root) {
  const blocks = root.querySelectorAll(".mermaid-block[data-mermaid-source]");
  if (!blocks.length || typeof mermaid === "undefined") {
    return;
  }

  if (!window.__mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: document.body.classList.contains("vscode-dark") ? "dark" : "default",
      fontFamily: "var(--vscode-font-family)"
    });
    window.__mermaidInitialized = true;
  }

  ensureMermaidModal();

  for (const block of blocks) {
    const source = block.dataset.mermaidSource || "";
    const content = block.querySelector(".mermaid-content");
    if (!content) {
      continue;
    }

    try {
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-svg-root";
      wrapper.innerHTML = svg;
      bindFunctions?.(wrapper);
      content.replaceChildren(wrapper);
      block.classList.add("mermaid-rendered");
    } catch (err) {
      showMermaidError(block, source, err);
    }
  }
}

function showMermaidError(block, source, err) {
  block.classList.remove("mermaid-rendered");
  block.classList.add("mermaid-failed");
  const content = block.querySelector(".mermaid-content");
  if (!content) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "mermaid-error";
  const message = document.createElement("p");
  message.className = "mermaid-error-message";
  message.textContent = `Mermaid 渲染失败：${err?.message || String(err)}`;
  const sourcePre = document.createElement("pre");
  sourcePre.className = "mermaid-error-source";
  sourcePre.textContent = source;
  wrapper.append(message, sourcePre);
  content.replaceChildren(wrapper);
}

let mermaidModalState = null;
const MERMAID_MODAL_SCALE_MIN = 0.4;
const MERMAID_MODAL_SCALE_MAX = 4;

function ensureMermaidModal() {
  if (document.getElementById("mermaidModal")) {
    return;
  }

  const modal = document.createElement("div");
  modal.id = "mermaidModal";
  modal.className = "mermaid-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="mermaid-modal-backdrop" data-mermaid-action="close"></div>
    <div class="mermaid-modal-panel" role="dialog" aria-modal="true" aria-label="Mermaid 全屏预览">
      <div class="mermaid-modal-toolbar">
        <button type="button" class="mermaid-modal-btn" data-mermaid-action="zoom-in" title="放大" aria-label="放大">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 4h2v3h3v2H9v3H7V9H4V7h3V4Z"/></svg>
        </button>
        <button type="button" class="mermaid-modal-btn" data-mermaid-action="zoom-out" title="缩小" aria-label="缩小">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 7h8v2H4V7Z"/></svg>
        </button>
        <button type="button" class="mermaid-modal-btn" data-mermaid-action="zoom-reset" title="重置缩放" aria-label="重置缩放">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 3a5 5 0 1 0 4.9 6h-1.8A3.2 3.2 0 1 1 8 4.7V7h4l-5 5-5-5h4V3Z"/></svg>
        </button>
        <button type="button" class="mermaid-modal-btn" data-mermaid-action="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.1 3 8 6.9 11.9 3 13 4.1 9.1 8 13 11.9 11.9 13 8 9.1 4.1 13 3 11.9 6.9 8 3 4.1Z"/></svg>
        </button>
      </div>
      <div class="mermaid-modal-viewport">
        <div class="mermaid-modal-content"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function openMermaidModal(block) {
  const svgRoot = block.querySelector(".mermaid-svg-root svg");
  if (!svgRoot) {
    return;
  }

  ensureMermaidModal();
  const modal = document.getElementById("mermaidModal");
  const content = modal?.querySelector(".mermaid-modal-content");
  if (!modal || !content) {
    return;
  }

  content.replaceChildren(svgRoot.cloneNode(true));
  mermaidModalState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0
  };
  applyMermaidModalTransform();
  modal.hidden = false;
  document.body.classList.add("mermaid-modal-open");
  modal.querySelector('[data-mermaid-action="close"]')?.focus();
}

function closeMermaidModal() {
  const modal = document.getElementById("mermaidModal");
  if (!modal || modal.hidden) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove("mermaid-modal-open");
  modal.classList.remove("is-dragging");
  modal.querySelector(".mermaid-modal-content")?.replaceChildren();
  modal.querySelector(".mermaid-modal-viewport")?.classList.remove("is-draggable");
  modal.querySelector(".mermaid-modal-viewport")?.classList.remove("is-dragging");
  mermaidModalState = null;
}

function applyMermaidModalTransform() {
  if (!mermaidModalState) {
    return;
  }

  const modal = document.getElementById("mermaidModal");
  const contentEl = modal?.querySelector(".mermaid-modal-content");
  const viewport = modal?.querySelector(".mermaid-modal-viewport");
  if (!contentEl || !viewport) {
    return;
  }

  contentEl.style.transform = `translate(${mermaidModalState.offsetX}px, ${mermaidModalState.offsetY}px) scale(${mermaidModalState.scale})`;
  viewport.classList.toggle("is-draggable", mermaidModalState.scale > 1.001);
  viewport.classList.toggle("is-dragging", mermaidModalState.isDragging);
}

function updateMermaidModalScale(nextScale) {
  if (!mermaidModalState) {
    return;
  }
  mermaidModalState.scale = Math.min(MERMAID_MODAL_SCALE_MAX, Math.max(MERMAID_MODAL_SCALE_MIN, nextScale));
  if (Math.abs(mermaidModalState.scale - 1) < 0.001) {
    mermaidModalState.offsetX = 0;
    mermaidModalState.offsetY = 0;
  }
  applyMermaidModalTransform();
}

function resetMermaidModalTransform() {
  if (!mermaidModalState) {
    return;
  }
  mermaidModalState.scale = 1;
  mermaidModalState.offsetX = 0;
  mermaidModalState.offsetY = 0;
  mermaidModalState.isDragging = false;
  applyMermaidModalTransform();
}

function ensureMermaidModalOpen() {
  const modal = document.getElementById("mermaidModal");
  if (!modal || modal.hidden || !mermaidModalState) {
    return null;
  }
  return modal;
}

function handleMermaidModalWheel(event) {
  const viewport = event.target.closest("#mermaidModal .mermaid-modal-viewport");
  if (!viewport) {
    return;
  }
  if (!ensureMermaidModalOpen()) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const delta = event.deltaY;
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }
  const step = delta < 0 ? 0.12 : -0.12;
  updateMermaidModalScale((mermaidModalState?.scale || 1) + step);
}

function handleMermaidModalDragStart(event) {
  if (event.button !== 0) {
    return;
  }

  const viewport = event.target.closest("#mermaidModal .mermaid-modal-viewport");
  if (!viewport) {
    return;
  }
  if (!ensureMermaidModalOpen()) {
    return;
  }
  if (!mermaidModalState || mermaidModalState.scale <= 1.001) {
    return;
  }

  event.preventDefault();
  mermaidModalState.isDragging = true;
  mermaidModalState.dragStartX = event.clientX;
  mermaidModalState.dragStartY = event.clientY;
  mermaidModalState.dragOriginX = mermaidModalState.offsetX;
  mermaidModalState.dragOriginY = mermaidModalState.offsetY;
  applyMermaidModalTransform();
}

function handleMermaidModalDragMove(event) {
  if (!mermaidModalState?.isDragging) {
    return;
  }
  if (!ensureMermaidModalOpen()) {
    return;
  }

  event.preventDefault();
  mermaidModalState.offsetX = mermaidModalState.dragOriginX + (event.clientX - mermaidModalState.dragStartX);
  mermaidModalState.offsetY = mermaidModalState.dragOriginY + (event.clientY - mermaidModalState.dragStartY);
  applyMermaidModalTransform();
}

function handleMermaidModalDragEnd() {
  if (!mermaidModalState?.isDragging) {
    return;
  }
  mermaidModalState.isDragging = false;
  applyMermaidModalTransform();
}

function handleMermaidModalClick(event) {
  const expandBtn = event.target.closest(".mermaid-expand-btn");
  if (expandBtn) {
    const block = expandBtn.closest(".mermaid-block.mermaid-rendered");
    if (block) {
      event.preventDefault();
      openMermaidModal(block);
    }
    return;
  }

  const actionBtn = event.target.closest("[data-mermaid-action]");
  if (!actionBtn || !actionBtn.closest("#mermaidModal")) {
    return;
  }

  const action = actionBtn.getAttribute("data-mermaid-action");
  const modal = document.getElementById("mermaidModal");
  const content = modal?.querySelector(".mermaid-modal-content");
  if (!modal || modal.hidden || !content) {
    return;
  }

  if (action === "close") {
    closeMermaidModal();
    return;
  }

  if (!mermaidModalState) {
    return;
  }

  if (action === "zoom-in") {
    updateMermaidModalScale(mermaidModalState.scale + 0.2);
  } else if (action === "zoom-out") {
    updateMermaidModalScale(mermaidModalState.scale - 0.2);
  } else if (action === "zoom-reset") {
    resetMermaidModalTransform();
  }
}

function handleMermaidModalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }
  closeMermaidModal();
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

    const footnote = /^\[\^([^\]]+)\]/.exec(value.slice(linkStart));
    if (footnote) {
      const ref = renderFootnoteRef(footnote[1], context);
      if (ref) {
        fragment.appendChild(ref);
        cursor = linkStart + footnote[0].length;
        continue;
      }
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
      if (href.startsWith("#")) {
        decorateInternalAnchorLink(link);
      }
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

  let cursor = 0;
  while (cursor < value.length) {
    const tagStart = value.indexOf("<", cursor);
    if (tagStart === -1) {
      appendInlineFormatting(parent, value.slice(cursor));
      break;
    }

    appendInlineFormatting(parent, value.slice(cursor, tagStart));
    const parsed = tryParseInlineHtml(value, tagStart);
    if (!parsed) {
      appendInlineFormatting(parent, value.slice(tagStart, tagStart + 1));
      cursor = tagStart + 1;
      continue;
    }

    parent.appendChild(sanitizeHtmlToFragment(parsed.html));
    cursor = parsed.nextIndex;
  }
}

function appendInlineFormatting(parent, text) {
  const value = String(text || "");
  if (!value) return;
  const parts = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|~~[^~]+~~)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      const code = document.createElement("code");
      code.textContent = part.slice(1, -1);
      parent.appendChild(code);
    } else if (part.startsWith("**") && part.endsWith("**") && part.length > 3) {
      const strong = document.createElement("strong");
      appendInlineFormatting(strong, part.slice(2, -2));
      parent.appendChild(strong);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      const em = document.createElement("em");
      appendInlineFormatting(em, part.slice(1, -1));
      parent.appendChild(em);
    } else if (part.startsWith("~~") && part.endsWith("~~") && part.length > 3) {
      const del = document.createElement("del");
      appendInlineFormatting(del, part.slice(2, -2));
      parent.appendChild(del);
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
  const cite = evt.target.closest("button.cite-ref");
  if (cite) {
    evt.preventDefault();
    activateCitation(cite);
    return;
  }

  const returnButton = evt.target.closest(".source-return");
  if (returnButton) {
    evt.preventDefault();
    const returnTarget = document.getElementById(returnButton.dataset.returnTarget);
    clearActiveCitation();
    clearActiveInternalJump();
    if (returnTarget) {
      returnToJumpSource(returnTarget);
    }
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
    const targetAnchor = anchorId || href.slice(1);
    if (link.closest("#toc")) {
      scrollToAnchor(targetAnchor);
      return;
    }
    if (link.closest("#reportContent")) {
      const handled = activateInternalJump(link, targetAnchor);
      if (!handled) {
        scrollToAnchor(targetAnchor);
      }
      return;
    }
    scrollToAnchor(targetAnchor);
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
  clearActiveInternalJump();

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

function returnToJumpSource(returnTarget) {
  clearCitationFlash();
  pauseTocScrollSpy(1200);
  scrollThenFlashCitation(returnTarget);
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
  if (!value) {
    return false;
  }
  if (value.startsWith("#")) {
    return true;
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
  document.title = "Report Markdown Viewer";
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
