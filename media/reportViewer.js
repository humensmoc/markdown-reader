const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;

const reportLayout = document.getElementById("reportLayout");
const tocDock = document.getElementById("tocDock");
const tocToggle = document.getElementById("tocToggle");
const tocSideToggle = document.getElementById("tocSideToggle");
const toc = document.getElementById("toc");
const annotationDock = document.getElementById("annotationDock");
const annotationHistoryRoot = document.getElementById("annotationHistoryRoot");
const annotationHistoryButton = document.getElementById("annotationHistoryButton");
const annotationHistoryPanel = document.getElementById("annotationHistoryPanel");
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
const enableBlockDragInput = document.getElementById("enableBlockDrag");
const autoOpenReaderModeInput = document.getElementById("autoOpenReaderMode");
const readerStyleButton = document.getElementById("readerStyleButton");
const tocPositionButton = document.getElementById("tocPositionButton");
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
let blockDragState = null;
const citeSourcePreviewIndex = new Map();
let citeHoverPopover = null;
let citeHoverShowTimer = null;
let citeHoverHideTimer = null;
let citeHoverActiveRef = null;
let citeHoverPointerInPopover = false;
let hasRenderedDocument = false;
let pendingAnnotationSelection = null;
let annotationAction = null;
let annotationDialog = null;
let annotationToastTimer = null;
let renderedAnnotations = [];
let annotationPositionFrame = null;
let lastAnnotationNormalizationKey = "";
let readerStyleDialog = null;
let readerStyleDialogOriginal = null;
let readerStyleFilePath = "";
let tocPositionDialog = null;
let tocPosition = { x: -28, y: 0 };

const READER_STYLE_DEFAULTS = Object.freeze({
  bodyFontSize: 16,
  lineHeight: 1.5,
  contentWidth: 700,
  tocFontSize: 13,
  paragraphSpacing: 16,
  listItemSpacing: 4.8,
  flatHeadingSize: 23,
  h1Size: 28,
  h2Size: 24,
  h3Size: 21,
  h4Size: 18,
  h5Size: 16,
  h6Size: 15,
  h1MarginTop: 0,
  h2MarginTop: 38,
  h3MarginTop: 32,
  h4MarginTop: 28,
  h5MarginTop: 24,
  h6MarginTop: 24,
  h1MarginBottom: 24,
  headingMarginBottom: 12
});

const READER_STYLE_GROUPS = [
  {
    title: "正文",
    fields: [
      { key: "bodyFontSize", label: "正文字号", unit: "px", min: 12, max: 24, step: 0.5 },
      { key: "lineHeight", label: "正文行高", unit: "倍", min: 1.2, max: 2, step: 0.05 },
      { key: "contentWidth", label: "每行最大宽度", unit: "px", min: 480, max: 1200, step: 10 },
      { key: "tocFontSize", label: "目录字号", unit: "px", min: 10, max: 20, step: 0.5 },
      { key: "paragraphSpacing", label: "段落间距", unit: "px", min: 0, max: 32, step: 1 },
      { key: "listItemSpacing", label: "列表项间距", unit: "px", min: 0, max: 20, step: 1 }
    ]
  },
  {
    title: "标题字号",
    fields: [
      { key: "h1Size", label: "H1", unit: "px", min: 18, max: 48, step: 1 },
      { key: "h2Size", label: "H2", unit: "px", min: 16, max: 40, step: 1 },
      { key: "h3Size", label: "H3", unit: "px", min: 14, max: 36, step: 1 },
      { key: "h4Size", label: "H4", unit: "px", min: 13, max: 32, step: 1 },
      { key: "h5Size", label: "H5", unit: "px", min: 12, max: 28, step: 1 },
      { key: "h6Size", label: "H6", unit: "px", min: 12, max: 28, step: 1 },
      { key: "flatHeadingSize", label: "关闭逐级缩小时", unit: "px", min: 14, max: 36, step: 1 }
    ]
  },
  {
    title: "标题间距",
    fields: [
      { key: "h1MarginTop", label: "H1 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h2MarginTop", label: "H2 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h3MarginTop", label: "H3 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h4MarginTop", label: "H4 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h5MarginTop", label: "H5 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h6MarginTop", label: "H6 段前", unit: "px", min: 0, max: 80, step: 1 },
      { key: "h1MarginBottom", label: "H1 段后", unit: "px", min: 0, max: 48, step: 1 },
      { key: "headingMarginBottom", label: "H2–H6 段后", unit: "px", min: 0, max: 48, step: 1 }
    ]
  }
];
const READER_STYLE_FIELDS = READER_STYLE_GROUPS.flatMap((group) => group.fields);
let readerStyleSettings = { ...READER_STYLE_DEFAULTS };

const SETTINGS_KEYS = {
  fontScale: "meowReportMarkdown.fontScale",
  showTocNumbers: "meowReportMarkdown.showTocNumbers",
  showContentNumbers: "meowReportMarkdown.showContentNumbers",
  headingFontScale: "meowReportMarkdown.headingFontScale",
  rainbowHeadingColors: "meowReportMarkdown.rainbowHeadingColors",
  enableBlockDrag: "meowReportMarkdown.enableBlockDrag",
  tocOffsetX: "meowReportMarkdown.tocOffsetX",
  tocOffsetY: "meowReportMarkdown.tocOffsetY"
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
  rainbowHeadingColors: false,
  enableBlockDrag: false,
  autoOpenReaderMode: false
};

initTocDock();
initTocResize();
initTocScrollSpy();
initTocWheelIsolation();
initReaderSettings();
initEditorMode();
initBlockDrag();
initCiteHover();
initAnnotations();
initAnnotationHistory();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "settings") {
    applyExtensionSettings(message);
    return;
  }
  if (message?.type === "render") {
    const nextText = message?.payload?.files?.[0]?.content || "";
    if (
      hasRenderedDocument &&
      document.body.classList.contains("wysiwyg-mode") &&
      nextText === latestDocumentText
    ) {
      return;
    }
    latestDocumentText = nextText;
    hasRenderedDocument = true;
    if (document.body.classList.contains("editor-mode") && reportEditor && !editorDirty) {
      reportEditor.value = latestDocumentText;
    }
    hideExternalChangeBanner(false);
    renderReport(message.payload);
  }
  if (message?.type === "documentChanged") {
    handleExternalDocumentChanged(message);
  }
  if (message?.type === "reloadDocument") {
    latestDocumentText = message?.content || latestDocumentText;
    editorDirty = false;
    hideExternalChangeBanner(false);
    if (reportEditor) {
      reportEditor.value = latestDocumentText;
    }
    if (message?.payload) {
      renderReport(message.payload);
    }
  }
  if (message?.type === "annotationSaved") {
    closeAnnotationDialog();
    showAnnotationToast("批注已保存到当前 Markdown");
  }
  if (message?.type === "annotationUpdated") {
    closeAnnotationDialog();
    showAnnotationToast("批注已更新");
  }
  if (message?.type === "annotationResolved") {
    closeAnnotationDialog();
    showAnnotationToast("批注已解决并归档");
  }
  if (message?.type === "annotationDeleted") {
    closeAnnotationDialog();
    showAnnotationToast("批注已删除");
  }
  if (message?.type === "annotationsNormalized") {
    showAnnotationToast("已将批注整理到 Markdown 文末");
  }
  if (message?.type === "annotationError") {
    annotationDialog?.querySelectorAll("button, textarea").forEach((element) => element.disabled = false);
    annotationDialog?.querySelector("textarea")?.focus();
    annotationDock?.querySelectorAll(".annotation-card button").forEach((element) => element.disabled = false);
    showAnnotationToast(`批注保存失败：${message.message || "未知错误"}`, true);
  }
  if (message?.type === "readerStyleSettings") {
    readerStyleSettings = normalizeReaderStyleSettings(message.settings);
    readerStyleFilePath = String(message.filePath || "");
    applyReaderStyleSettings();
    if (readerStyleDialog) {
      readerStyleDialogOriginal = { ...readerStyleSettings };
      fillReaderStyleDialog(readerStyleDialog, readerStyleSettings);
      updateReaderStyleFilePath();
    }
  }
  if (message?.type === "readerStyleSaved") {
    readerStyleSettings = normalizeReaderStyleSettings(message.settings);
    readerStyleFilePath = String(message.filePath || readerStyleFilePath);
    applyReaderStyleSettings();
    closeReaderStyleDialog({ restore: false });
    showAnnotationToast("阅读样式已保存到本地配置文件");
  }
  if (message?.type === "readerStyleError") {
    readerStyleDialog?.querySelectorAll("button, input").forEach((element) => element.disabled = false);
    showAnnotationToast(`阅读样式处理失败：${message.message || "未知错误"}`, true);
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
  requestReaderSettings();
  postReadySignal();
}

function requestReaderSettings() {
  vscode?.postMessage({ type: "requestReaderSettings" });
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

  loadTocPosition();
  applyTocPosition();
  const saved = localStorage.getItem("meowReportMarkdown.tocCollapsed");
  const savedSide = localStorage.getItem("meowReportMarkdown.tocSide");
  setTocSide(savedSide === "right" ? "right" : "left", { persist: false });
  setTocCollapsed(saved === "1");

  tocToggle.addEventListener("click", () => {
    setTocCollapsed(!tocDock.classList.contains("collapsed"));
  });

  tocSideToggle?.addEventListener("click", () => {
    setTocSide(tocDock.classList.contains("toc-right") ? "left" : "right");
  });
}

function setTocSide(side, { persist = true } = {}) {
  if (!tocDock) {
    return;
  }

  const isRight = side === "right";
  tocDock.classList.toggle("toc-right", isRight);
  tocDock.classList.toggle("toc-left", !isRight);
  annotationDock?.classList.toggle("annotation-left", isRight);
  annotationDock?.classList.toggle("annotation-right", !isRight);
  if (tocSideToggle) {
    tocSideToggle.textContent = isRight ? "←" : "→";
    tocSideToggle.setAttribute("aria-label", isRight ? "将目录移到左侧" : "将目录移到右侧");
    tocSideToggle.title = isRight ? "将目录移到左侧" : "将目录移到右侧";
  }
  if (persist) {
    localStorage.setItem("meowReportMarkdown.tocSide", isRight ? "right" : "left");
  }
  scheduleAnnotationPositions();
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
  enableBlockDragInput?.addEventListener("change", () => {
    readerSettings.enableBlockDrag = Boolean(enableBlockDragInput.checked);
    saveReaderSettings();
    applyReaderSettings();
    applyBlockDragSetting();
  });
  autoOpenReaderModeInput?.addEventListener("change", () => {
    readerSettings.autoOpenReaderMode = Boolean(autoOpenReaderModeInput.checked);
    updateReaderSettingsUi();
    vscode?.postMessage({
      type: "setAutoOpenReaderMode",
      enabled: readerSettings.autoOpenReaderMode
    });
  });

  document.getElementById("reloadDocumentBtn")?.addEventListener("click", () => {
    requestDocumentReload();
  });
  readerStyleButton?.addEventListener("click", () => {
    setReaderSettingsOpen(false);
    vscode?.postMessage({ type: "requestReaderStyle" });
    openReaderStyleDialog();
  });
  tocPositionButton?.addEventListener("click", () => {
    setReaderSettingsOpen(false);
    openTocPositionDialog();
  });
}

function normalizeReaderStyleSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {};
  for (const field of READER_STYLE_FIELDS) {
    const candidate = Number(source[field.key]);
    const fallback = READER_STYLE_DEFAULTS[field.key];
    const bounded = Number.isFinite(candidate) ? Math.min(field.max, Math.max(field.min, candidate)) : fallback;
    const precision = String(field.step).includes(".") ? String(field.step).split(".")[1].length : 0;
    normalized[field.key] = Number(bounded.toFixed(precision));
  }
  return normalized;
}

function applyReaderStyleSettings() {
  const root = document.documentElement.style;
  const pxVariables = {
    "--reader-font-size": readerStyleSettings.bodyFontSize,
    "--readable-line-width": readerStyleSettings.contentWidth,
    "--toc-font-size": readerStyleSettings.tocFontSize,
    "--paragraph-spacing": readerStyleSettings.paragraphSpacing,
    "--list-item-spacing": readerStyleSettings.listItemSpacing,
    "--flat-heading-size": readerStyleSettings.flatHeadingSize,
    "--h1-size": readerStyleSettings.h1Size,
    "--h2-size": readerStyleSettings.h2Size,
    "--h3-size": readerStyleSettings.h3Size,
    "--h4-size": readerStyleSettings.h4Size,
    "--h5-size": readerStyleSettings.h5Size,
    "--h6-size": readerStyleSettings.h6Size,
    "--h1-margin-top": readerStyleSettings.h1MarginTop,
    "--h2-margin-top": readerStyleSettings.h2MarginTop,
    "--h3-margin-top": readerStyleSettings.h3MarginTop,
    "--h4-margin-top": readerStyleSettings.h4MarginTop,
    "--h5-margin-top": readerStyleSettings.h5MarginTop,
    "--h6-margin-top": readerStyleSettings.h6MarginTop,
    "--h1-margin-bottom": readerStyleSettings.h1MarginBottom,
    "--heading-margin-bottom": readerStyleSettings.headingMarginBottom
  };
  for (const [name, value] of Object.entries(pxVariables)) {
    root.setProperty(name, `${value}px`);
  }
  root.setProperty("--reader-line-height", String(readerStyleSettings.lineHeight));
}

function openReaderStyleDialog() {
  if (readerStyleDialog) {
    return;
  }
  readerStyleDialogOriginal = { ...readerStyleSettings };
  const overlay = document.createElement("div");
  overlay.className = "reader-style-dialog";

  const card = document.createElement("div");
  card.className = "reader-style-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-labelledby", "readerStyleDialogTitle");
  card.innerHTML = `
    <div class="reader-style-header">
      <div>
        <h2 id="readerStyleDialogTitle">自定义阅读样式</h2>
        <p>输入时实时预览，保存后写入本地 JSON 配置。</p>
      </div>
      <button type="button" class="reader-style-close" data-action="cancel" aria-label="关闭">×</button>
    </div>
    <div class="reader-style-file"><span>配置文件</span><code></code></div>
    <div class="reader-style-groups"></div>
    <div class="reader-style-actions">
      <button type="button" data-action="reset">恢复默认值</button>
      <span class="reader-style-actions-spacer"></span>
      <button type="button" data-action="cancel">取消</button>
      <button type="button" class="primary" data-action="save">保存到本地</button>
    </div>`;

  const groupsRoot = card.querySelector(".reader-style-groups");
  for (const group of READER_STYLE_GROUPS) {
    const section = document.createElement("section");
    section.className = "reader-style-group";
    const title = document.createElement("h3");
    title.textContent = group.title;
    const grid = document.createElement("div");
    grid.className = "reader-style-grid";
    for (const field of group.fields) {
      const label = document.createElement("label");
      label.className = "reader-style-field";
      const labelText = document.createElement("span");
      labelText.textContent = field.label;
      const inputWrap = document.createElement("span");
      inputWrap.className = "reader-style-input-wrap";
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.styleKey = field.key;
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step);
      input.value = String(readerStyleSettings[field.key]);
      inputWrap.append(input, document.createTextNode(field.unit));
      label.append(labelText, inputWrap);
      grid.appendChild(label);
    }
    section.append(title, grid);
    groupsRoot.appendChild(section);
  }

  card.addEventListener("input", (event) => {
    if (!event.target.matches("input[data-style-key]")) {
      return;
    }
    readerStyleSettings = readReaderStyleDialog(card);
    applyReaderStyleSettings();
  });
  card.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "cancel") {
      closeReaderStyleDialog({ restore: true });
    } else if (action === "reset") {
      readerStyleSettings = { ...READER_STYLE_DEFAULTS };
      fillReaderStyleDialog(card, readerStyleSettings);
      applyReaderStyleSettings();
    } else if (action === "save") {
      readerStyleSettings = readReaderStyleDialog(card);
      applyReaderStyleSettings();
      card.querySelectorAll("button, input").forEach((element) => element.disabled = true);
      vscode?.postMessage({ type: "saveReaderStyle", settings: readerStyleSettings });
    }
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeReaderStyleDialog({ restore: true });
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeReaderStyleDialog({ restore: true });
  });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  readerStyleDialog = overlay;
  updateReaderStyleFilePath();
  window.requestAnimationFrame(() => card.querySelector("input")?.focus());
}

function readReaderStyleDialog(root) {
  const value = { ...readerStyleSettings };
  root.querySelectorAll("input[data-style-key]").forEach((input) => {
    if (!input.value.trim()) {
      return;
    }
    value[input.dataset.styleKey] = Number(input.value);
  });
  return normalizeReaderStyleSettings(value);
}

function fillReaderStyleDialog(root, value) {
  root.querySelectorAll("input[data-style-key]").forEach((input) => {
    input.value = String(value[input.dataset.styleKey]);
  });
}

function updateReaderStyleFilePath() {
  const code = readerStyleDialog?.querySelector(".reader-style-file code");
  if (code) {
    const label = readerStyleFilePath || "保存后创建 reader-style.json";
    code.textContent = label;
    code.title = label;
  }
}

function closeReaderStyleDialog({ restore = false } = {}) {
  if (restore && readerStyleDialogOriginal) {
    readerStyleSettings = { ...readerStyleDialogOriginal };
    applyReaderStyleSettings();
  }
  readerStyleDialog?.remove();
  readerStyleDialog = null;
  readerStyleDialogOriginal = null;
}

function clampTocOffset(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : 0;
}

function loadTocPosition() {
  const savedX = localStorage.getItem(SETTINGS_KEYS.tocOffsetX);
  const savedY = localStorage.getItem(SETTINGS_KEYS.tocOffsetY);
  tocPosition = {
    x: savedX === null ? -28 : clampTocOffset(savedX, -180, 180),
    y: savedY === null ? 0 : clampTocOffset(savedY, -260, 260)
  };
}

function applyTocPosition() {
  document.documentElement.style.setProperty("--toc-offset-x", `${tocPosition.x}px`);
  document.documentElement.style.setProperty("--toc-offset-y", `${tocPosition.y}px`);
}

function openTocPositionDialog() {
  if (tocPositionDialog) return;
  const original = { ...tocPosition };
  const overlay = document.createElement("div");
  overlay.className = "toc-position-dialog";
  overlay.innerHTML = `
    <div class="toc-position-card" role="dialog" aria-modal="true" aria-labelledby="tocPositionTitle">
      <h2 id="tocPositionTitle">目录位置</h2>
      <label class="toc-position-field">
        <span>水平偏移 <output data-output="x"></output></span>
        <input type="range" min="-180" max="180" step="1" data-axis="x" />
      </label>
      <label class="toc-position-field">
        <span>垂直偏移 <output data-output="y"></output></span>
        <input type="range" min="-260" max="260" step="1" data-axis="y" />
      </label>
      <p class="toc-position-hint">以空白区域中心为基准，拖动时实时预览。</p>
      <div class="toc-position-actions">
        <button type="button" data-action="reset">恢复默认</button>
        <span></span>
        <button type="button" data-action="cancel">取消</button>
        <button type="button" class="primary" data-action="save">保存</button>
      </div>
    </div>`;
  const sync = () => {
    for (const axis of ["x", "y"]) {
      overlay.querySelector(`[data-axis="${axis}"]`).value = String(tocPosition[axis]);
      overlay.querySelector(`[data-output="${axis}"]`).textContent = `${tocPosition[axis]} px`;
    }
    applyTocPosition();
  };
  overlay.addEventListener("input", (event) => {
    const axis = event.target.dataset.axis;
    if (!axis) return;
    tocPosition[axis] = clampTocOffset(event.target.value, axis === "x" ? -180 : -260, axis === "x" ? 180 : 260);
    sync();
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
      tocPosition = original;
      applyTocPosition();
      closeTocPositionDialog();
      return;
    }
    const action = event.target.closest("button")?.dataset.action;
    if (action === "reset") {
      tocPosition = { x: -28, y: 0 };
      sync();
    } else if (action === "save") {
      localStorage.setItem(SETTINGS_KEYS.tocOffsetX, String(tocPosition.x));
      localStorage.setItem(SETTINGS_KEYS.tocOffsetY, String(tocPosition.y));
      closeTocPositionDialog();
    }
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      tocPosition = original;
      applyTocPosition();
      closeTocPositionDialog();
    }
  });
  document.body.appendChild(overlay);
  tocPositionDialog = overlay;
  sync();
  window.requestAnimationFrame(() => overlay.querySelector('input[data-axis="x"]')?.focus());
}

function closeTocPositionDialog() {
  tocPositionDialog?.remove();
  tocPositionDialog = null;
}

function applyExtensionSettings(settings) {
  if (typeof settings.autoOpenReaderMode === "boolean") {
    readerSettings.autoOpenReaderMode = settings.autoOpenReaderMode;
    updateReaderSettingsUi();
  }
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
  if (open) {
    requestReaderSettings();
  }
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
    vscode.postMessage({ type: "saveContent", content: nextText, persist: true });
    exitEditorMode({ discardChanges: false, skipConfirm: true });
  });

  editorCancelBtn.addEventListener("click", () => {
    exitEditorMode({ discardChanges: true });
  });

  reportEditor.addEventListener("input", () => {
    editorDirty = reportEditor.value !== latestDocumentText;
    postEditorState();
  });
}

function postEditorState() {
  if (!vscode) {
    return;
  }
  vscode.postMessage({
    type: "editorState",
    dirty: editorDirty,
    inEditorMode: document.body.classList.contains("editor-mode"),
    inWysiwygMode: document.body.classList.contains("wysiwyg-mode")
  });
}

function parseSourcePreview(body) {
  const text = String(body || "").trim();
  if (!text) {
    return { title: "", summary: "", url: "", links: [] };
  }

  const links = [];
  const mdLinkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdLinkPattern.exec(text)) !== null) {
    const href = trimUrlTail(match[2].trim());
    if (/^(https?:|mailto:)/i.test(href)) {
      links.push({ label: (match[1] || href).trim() || href, href });
    }
  }

  const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;
  while ((match = urlPattern.exec(text)) !== null) {
    const href = trimUrlTail(match[0]);
    if (!links.some((item) => item.href === href)) {
      links.push({ label: href, href });
    }
  }

  let title = text;
  let summary = "";
  let url = links[0]?.href || "";
  let working = text;

  const trailingUrlMatch = /^(.+?)\s-\s+(https?:\/\/\S+)\s*$/i.exec(text);
  if (trailingUrlMatch) {
    working = trailingUrlMatch[1].trim();
    url = trimUrlTail(trailingUrlMatch[2]);
  }

  const emDashParts = working.split(/\s—\s/);
  if (emDashParts.length >= 2) {
    title = emDashParts[0].trim();
    summary = emDashParts.slice(1).join(" — ").trim();
  } else {
    title = working;
  }

  if (url && !links.some((item) => item.href === url)) {
    links.unshift({ label: url, href: url });
  }

  return { title, summary, url, links };
}

function ensureCiteHoverPopover() {
  if (citeHoverPopover) {
    return citeHoverPopover;
  }

  const popover = document.createElement("div");
  popover.id = "citeHoverPopover";
  popover.className = "cite-hover-popover";
  popover.hidden = true;
  popover.setAttribute("role", "tooltip");

  popover.addEventListener("mouseenter", () => {
    citeHoverPointerInPopover = true;
    window.clearTimeout(citeHoverHideTimer);
  });
  popover.addEventListener("mouseleave", () => {
    citeHoverPointerInPopover = false;
    hideCiteHoverPopover();
  });
  popover.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || !vscode) {
      return;
    }
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (/^(https?:|mailto:)/i.test(href)) {
      vscode.postMessage({ type: "openExternal", href });
    }
  });

  document.body.appendChild(popover);
  citeHoverPopover = popover;
  return popover;
}

function hideCiteHoverPopover() {
  window.clearTimeout(citeHoverShowTimer);
  window.clearTimeout(citeHoverHideTimer);
  citeHoverActiveRef = null;
  if (citeHoverPopover) {
    citeHoverPopover.hidden = true;
    citeHoverPopover.innerHTML = "";
  }
}

function scheduleHideCiteHoverPopover() {
  window.clearTimeout(citeHoverHideTimer);
  citeHoverHideTimer = window.setTimeout(() => {
    if (!citeHoverPointerInPopover) {
      hideCiteHoverPopover();
    }
  }, 120);
}

function showCiteHoverPopover(citeRef) {
  const sourceId = citeRef?.dataset?.sourceTarget;
  const preview = sourceId ? citeSourcePreviewIndex.get(sourceId) : null;
  if (!preview) {
    return;
  }

  const popover = ensureCiteHoverPopover();
  citeHoverActiveRef = citeRef;

  const titleEl = document.createElement("div");
  titleEl.className = "cite-hover-title";
  titleEl.textContent = preview.title || `来源 ${citeRef.textContent}`;

  popover.replaceChildren(titleEl);

  if (preview.summary) {
    const summaryEl = document.createElement("div");
    summaryEl.className = "cite-hover-summary";
    summaryEl.textContent = preview.summary;
    popover.appendChild(summaryEl);
  }

  if (preview.links.length) {
    const linksEl = document.createElement("div");
    linksEl.className = "cite-hover-links";
    for (const link of preview.links) {
      const anchor = document.createElement("a");
      anchor.href = link.href;
      anchor.textContent = link.label;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      linksEl.appendChild(anchor);
    }
    popover.appendChild(linksEl);
  } else if (preview.url) {
    const linksEl = document.createElement("div");
    linksEl.className = "cite-hover-links";
    const anchor = document.createElement("a");
    anchor.href = preview.url;
    anchor.textContent = preview.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    linksEl.appendChild(anchor);
    popover.appendChild(linksEl);
  }

  popover.hidden = false;
  const rect = citeRef.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + margin;
  let left = rect.left;

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  const popRect = popover.getBoundingClientRect();
  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popRect.width - margin);
  }
  if (top + popRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popRect.height - margin);
  }
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function initCiteHover() {
  if (!reportContent) {
    return;
  }

  reportContent.addEventListener("mouseover", (event) => {
    const citeRef = event.target.closest("button.cite-ref");
    if (!citeRef || citeRef.closest(".source-line")) {
      return;
    }
    window.clearTimeout(citeHoverHideTimer);
    if (citeHoverActiveRef === citeRef && citeHoverPopover && !citeHoverPopover.hidden) {
      return;
    }
    window.clearTimeout(citeHoverShowTimer);
    citeHoverShowTimer = window.setTimeout(() => {
      showCiteHoverPopover(citeRef);
    }, 200);
  });

  reportContent.addEventListener("mouseout", (event) => {
    const citeRef = event.target.closest("button.cite-ref");
    if (!citeRef || citeRef.closest(".source-line")) {
      return;
    }
    const related = event.relatedTarget;
    if (related && (citeHoverPopover?.contains(related) || citeRef.contains(related))) {
      return;
    }
    window.clearTimeout(citeHoverShowTimer);
    scheduleHideCiteHoverPopover();
  });
}

let externalChangeBanner = null;
let pendingExternalPayload = null;

function ensureExternalChangeBanner() {
  if (externalChangeBanner) {
    return externalChangeBanner;
  }
  const banner = document.createElement("div");
  banner.id = "externalChangeBanner";
  banner.className = "external-change-banner";
  banner.hidden = true;
  banner.innerHTML =
    '<span class="external-change-text">文件已在外部修改</span>' +
    '<div class="external-change-actions">' +
    '<button type="button" data-action="reload">重新加载</button>' +
    '<button type="button" data-action="keep">保留我的编辑</button>' +
    "</div>";
  banner.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset?.action;
    if (action === "reload") {
      acceptExternalDocumentReload();
    } else if (action === "keep") {
      hideExternalChangeBanner(true);
    }
  });
  document.body.appendChild(banner);
  externalChangeBanner = banner;
  return banner;
}

function handleExternalDocumentChanged(message) {
  pendingExternalPayload = message?.payload || null;
  latestDocumentText = message?.content || latestDocumentText;
  if (document.body.classList.contains("editor-mode") && editorDirty) {
    ensureExternalChangeBanner().hidden = false;
    return;
  }
  if (message?.payload) {
    renderReport(message.payload);
  }
}

function acceptExternalDocumentReload() {
  editorDirty = false;
  hideExternalChangeBanner(false);
  postEditorState();
  if (pendingExternalPayload) {
    renderReport(pendingExternalPayload);
    pendingExternalPayload = null;
    return;
  }
  vscode?.postMessage({ type: "requestReload" });
}

function hideExternalChangeBanner(keepPending) {
  if (externalChangeBanner) {
    externalChangeBanner.hidden = true;
  }
  if (!keepPending) {
    pendingExternalPayload = null;
  }
}

function requestDocumentReload() {
  vscode?.postMessage({ type: "requestReload" });
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
  document.body.classList.remove("wysiwyg-mode");
  const wysiwygInput = document.getElementById("enableWysiwygMode");
  if (wysiwygInput) {
    wysiwygInput.checked = false;
  }
  editorModeToggle.hidden = true;
  editorSaveBtn.hidden = false;
  editorCancelBtn.hidden = false;
  applyBlockDragSetting();
  window.requestAnimationFrame(() => reportEditor.focus());
  postEditorState();
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
  applyBlockDragSetting();
  postEditorState();
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
  readerSettings.enableBlockDrag = readBooleanSetting(SETTINGS_KEYS.enableBlockDrag, false);
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
  localStorage.setItem(SETTINGS_KEYS.enableBlockDrag, readerSettings.enableBlockDrag ? "1" : "0");
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
  document.documentElement.classList.toggle("block-drag-enabled", readerSettings.enableBlockDrag);
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
  if (enableBlockDragInput) {
    enableBlockDragInput.checked = readerSettings.enableBlockDrag;
  }
  if (autoOpenReaderModeInput) {
    autoOpenReaderModeInput.checked = readerSettings.autoOpenReaderMode;
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
  const foldButton = element.querySelector(":scope > .content-fold");
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
  } else {
    const textSpan = document.createElement("span");
    textSpan.className = "outline-text";
    textSpan.textContent = label;
    element.appendChild(textSpan);
  }

  if (foldButton) {
    element.insertBefore(foldButton, element.firstChild);
  }
}

function decorateReportHeading(element, level) {
  element.classList.add("report-heading", `level-${Math.min(Math.max(level, 1), 6)}`);
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
    if (!target || !isScrollSpyTarget(target)) {
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
    const resizeDirection = tocDock.classList.contains("toc-right") ? -1 : 1;
    handle.classList.add("is-dragging");
    tocDock.classList.add("is-resizing");

    const onMove = (moveEvent) => {
      const widthDelta = (moveEvent.clientX - startX) * resizeDirection;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + widthDelta));
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

function isScrollSpyTarget(target) {
  let branch = target.closest(".content-branch");
  while (branch) {
    const body = branch.querySelector(":scope > .content-branch-body");
    if (branch.dataset.collapsed === "1" && body?.contains(target)) {
      return false;
    }
    branch = branch.parentElement?.closest(".content-branch");
  }
  return true;
}

function expandTocAncestors(link) {
  let branch = link.closest(".toc-branch");
  while (branch) {
    setTocBranchCollapsed(branch, false);
    branch = branch.parentElement?.closest(".toc-branch");
  }
}

function setTocBranchCollapsed(branch, collapsed) {
  if (!branch) {
    return;
  }
  branch.dataset.collapsed = collapsed ? "1" : "0";
  const foldButton = branch.querySelector(":scope > .toc-branch-row > .toc-fold");
  if (foldButton) {
    foldButton.setAttribute("aria-expanded", String(!collapsed));
    foldButton.textContent = collapsed ? "▸" : "▾";
  }
}

function toggleTocBranch(branch) {
  if (!branch) {
    return;
  }
  setTocBranchCollapsed(branch, branch.dataset.collapsed !== "1");
  updateActiveToc();
}

function setContentBranchCollapsed(branch, collapsed) {
  if (!branch) {
    return;
  }
  branch.dataset.collapsed = collapsed ? "1" : "0";
  const heading = branch.querySelector(":scope > .report-heading");
  const foldButton = heading?.querySelector(".content-fold");
  if (foldButton) {
    foldButton.setAttribute("aria-expanded", String(!collapsed));
    foldButton.textContent = collapsed ? "▸" : "▾";
  }
  syncTocBranchFromContent(branch.dataset.anchor, collapsed);
  updateActiveToc();
}

function toggleContentBranch(branch) {
  if (!branch) {
    return;
  }
  setContentBranchCollapsed(branch, branch.dataset.collapsed !== "1");
}

function syncTocBranchFromContent(anchorId, collapsed) {
  if (!anchorId || !toc) {
    return;
  }
  const tocLink = Array.from(toc.querySelectorAll("a[data-anchor]")).find(
    (item) => item.dataset.anchor === anchorId
  );
  if (!tocLink) {
    return;
  }
  const tocBranch = tocLink.closest(".toc-branch");
  if (!tocBranch?.querySelector(":scope > .toc-branch-children")) {
    return;
  }
  setTocBranchCollapsed(tocBranch, collapsed);
}

function attachContentFoldButton(branch) {
  const body = branch.querySelector(":scope > .content-branch-body");
  if (!body?.children.length) {
    return;
  }

  const heading = branch.querySelector(":scope > .report-heading");
  if (!heading || heading.querySelector(".content-fold")) {
    return;
  }

  const foldButton = document.createElement("button");
  foldButton.type = "button";
  foldButton.className = "content-fold";
  foldButton.setAttribute("aria-expanded", "true");
  foldButton.setAttribute("aria-label", "折叠本节");
  foldButton.textContent = "▾";
  heading.insertBefore(foldButton, heading.firstChild);
}

function wrapContentInSections(container) {
  const elements = Array.from(container.children);
  container.replaceChildren();

  const rootBody = document.createElement("div");
  rootBody.className = "content-root";
  container.appendChild(rootBody);

  const stack = [{ level: 0, body: rootBody }];

  for (const element of elements) {
    if (isHeadingElement(element)) {
      const level = Number.parseInt(element.tagName.slice(1), 10);
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        const popped = stack.pop();
        attachContentFoldButton(popped.branch);
      }

      const branch = document.createElement("div");
      branch.className = "content-branch";
      branch.dataset.collapsed = "0";
      if (element.id) {
        branch.dataset.anchor = element.id;
      }

      const branchBody = document.createElement("div");
      branchBody.className = "content-branch-body";
      branch.append(element, branchBody);
      stack[stack.length - 1].body.appendChild(branch);
      stack.push({ level, body: branchBody, branch });
      continue;
    }

    stack[stack.length - 1].body.appendChild(element);
  }

  while (stack.length > 1) {
    const popped = stack.pop();
    attachContentFoldButton(popped.branch);
  }
}

function isBlockDragEnabled() {
  return (
    Boolean(readerSettings.enableBlockDrag) &&
    !document.body.classList.contains("editor-mode") &&
    !document.body.classList.contains("wysiwyg-mode")
  );
}

function applyBlockDragSetting() {
  document.documentElement.classList.toggle("block-drag-enabled", Boolean(readerSettings.enableBlockDrag));
  document.querySelectorAll(".md-drag-handle").forEach((node) => node.remove());

  if (!isBlockDragEnabled()) {
    document.querySelectorAll(".md-block-draggable").forEach((node) => {
      node.classList.remove("md-block-draggable", "md-block-dragging");
    });
    clearBlockDropIndicators();
    blockDragState = null;
    return;
  }

  for (const root of document.querySelectorAll("#reportContent .markdown-body")) {
    annotateContentBranches(root);
    root.querySelectorAll("p.md-block:not(.list-line)").forEach((paragraph) => {
      paragraph.classList.add("md-block-draggable");
    });
    root
      .querySelectorAll(
        "pre.md-block, .mermaid-block.md-block, .table-wrap.md-block, blockquote.md-block, .list-line.md-block:not(.source-line), .md-html-block.md-block"
      )
      .forEach((block) => {
        if (!block.closest(".footnotes")) {
          block.classList.add("md-block-draggable");
        }
      });
    attachBlockDragHandles(root);
  }
}

function tagMdBlock(element, startLine, endLine, { draggable = false } = {}) {
  if (!element || startLine < 0 || endLine < startLine) {
    return;
  }
  element.dataset.mdStart = String(startLine);
  element.dataset.mdEnd = String(endLine);
  element.classList.add("md-block");
  if (draggable && isBlockDragEnabled()) {
    element.classList.add("md-block-draggable");
  }
}

function annotateContentBranch(branch) {
  const heading = branch.querySelector(":scope > .report-heading");
  if (!heading?.dataset.mdStart) {
    return;
  }

  let start = Number(heading.dataset.mdStart);
  let end = Number(heading.dataset.mdEnd ?? heading.dataset.mdStart);
  const body = branch.querySelector(":scope > .content-branch-body");

  if (body) {
    for (const child of body.children) {
      if (child.classList.contains("content-branch")) {
        annotateContentBranch(child);
        if (child.dataset.mdEnd) {
          end = Math.max(end, Number(child.dataset.mdEnd));
        }
      } else if (child.dataset.mdStart) {
        end = Math.max(end, Number(child.dataset.mdEnd));
      }
    }
  }

  branch.dataset.mdStart = String(start);
  branch.dataset.mdEnd = String(end);
  if (isBlockDragEnabled()) {
    branch.classList.add("md-block-draggable");
  }
}

function annotateContentBranches(root) {
  const contentRoot = root.querySelector(":scope > .content-root") || root;
  for (const branch of contentRoot.querySelectorAll(":scope > .content-branch")) {
    annotateContentBranch(branch);
  }
}

function extractMdBlockText(lines, element) {
  const start = Number(element.dataset.mdStart);
  const end = Number(element.dataset.mdEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "";
  }
  return lines.slice(start, end + 1).join("\n");
}

function serializeMarkdownContainer(container, lines) {
  const parts = [];
  for (const child of container.children) {
    if (child.classList.contains("footnotes")) {
      continue;
    }
    if (child.classList.contains("content-branch")) {
      parts.push(serializeMarkdownBranch(child, lines));
    } else if (child.dataset.mdStart) {
      parts.push(extractMdBlockText(lines, child));
    }
  }
  return parts.filter((part) => part.trim()).join("\n\n");
}

function serializeMarkdownBranch(branch, lines) {
  const heading = branch.querySelector(":scope > .report-heading");
  const body = branch.querySelector(":scope > .content-branch-body");
  const headingText = heading ? extractMdBlockText(lines, heading) : "";
  if (!body?.children.length) {
    return headingText;
  }
  const bodyText = serializeMarkdownContainer(body, lines);
  return bodyText ? `${headingText}\n\n${bodyText}` : headingText;
}

function serializeDocumentMarkdown() {
  const preprocessed = preprocessMarkdownContent(latestDocumentText);
  const lines = preprocessed.lines;
  const chunks = [];

  for (const markdownBody of document.querySelectorAll("#reportContent .markdown-body")) {
    const contentRoot = markdownBody.querySelector(":scope > .content-root");
    if (!contentRoot) {
      continue;
    }
    chunks.push(serializeMarkdownContainer(contentRoot, lines));
  }

  const body = chunks.filter((chunk) => chunk.trim()).join("\n\n");
  const footnotes = preprocessed.footnoteDefinitions.join("\n\n");
  const annotations = preprocessed.annotations.map((annotation) => annotation.rawMarkdown).filter(Boolean).join("\n\n");
  return [preprocessed.frontmatter, body, footnotes, preprocessed.annotationGuide, annotations]
    .filter((part) => part.trim())
    .join("\n\n");
}

function createMdDragHandle() {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "md-drag-handle";
  handle.draggable = true;
  handle.setAttribute("aria-label", "拖动排序");
  handle.title = "拖动排序";
  handle.textContent = "⋮⋮";
  return handle;
}

function attachBlockDragHandles(root) {
  if (!root || !isBlockDragEnabled()) {
    return;
  }

  for (const branch of root.querySelectorAll(".content-branch.md-block-draggable")) {
    branch.querySelector(":scope > .report-heading .md-drag-handle")?.remove();
    if (branch.querySelector(":scope > .md-drag-handle")) {
      continue;
    }
    branch.insertBefore(createMdDragHandle(), branch.firstChild);
  }

  for (const block of root.querySelectorAll(".md-block-draggable:not(.content-branch)")) {
    if (block.querySelector(":scope > .md-drag-handle")) {
      continue;
    }
    block.insertBefore(createMdDragHandle(), block.firstChild);
  }
}

function findBlockDropContainer(clientX, clientY, draggingBlock) {
  const pointTarget = document.elementFromPoint(clientX, clientY);
  if (!pointTarget || !reportContent.contains(pointTarget)) {
    return null;
  }
  if (pointTarget.closest(".footnotes, .source-line, .md-drag-handle")) {
    return null;
  }

  let container =
    pointTarget.closest(".content-branch-body") || pointTarget.closest(".content-root");
  if (!container || !reportContent.contains(container)) {
    return null;
  }

  if (draggingBlock.classList.contains("content-branch") && draggingBlock.contains(container)) {
    return null;
  }

  return container;
}

function getBlockDropSiblings(container, draggingBlock) {
  return Array.from(container.children).filter(
    (child) =>
      child !== draggingBlock &&
      (child.classList.contains("md-block-draggable") || child.classList.contains("content-branch"))
  );
}

function clearBlockDropIndicators() {
  document.querySelectorAll(".md-drop-indicator").forEach((node) => node.remove());
}

function getBlockDropTarget(container, clientY, draggingBlock) {
  const siblings = getBlockDropSiblings(container, draggingBlock);

  let closest = null;
  let closestOffset = Number.NEGATIVE_INFINITY;
  for (const sibling of siblings) {
    const rect = sibling.getBoundingClientRect();
    const offset = clientY - rect.top - rect.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = sibling;
    }
  }
  return closest;
}

function showBlockDropIndicator(container, beforeNode) {
  clearBlockDropIndicators();
  const indicator = document.createElement("div");
  indicator.className = "md-drop-indicator";
  indicator.setAttribute("aria-hidden", "true");
  if (beforeNode) {
    container.insertBefore(indicator, beforeNode);
  } else {
    container.appendChild(indicator);
  }
}

function applyMarkdownReorder() {
  if (!vscode || !isBlockDragEnabled()) {
    return;
  }
  const nextText = serializeDocumentMarkdown();
  if (nextText === latestDocumentText) {
    return;
  }
  latestDocumentText = nextText;
  vscode.postMessage({ type: "saveContent", content: nextText, persist: false });
}

function initBlockDrag() {
  if (!reportContent) {
    return;
  }

  reportContent.addEventListener("dragstart", (event) => {
    if (!isBlockDragEnabled()) {
      return;
    }
    const handle = event.target.closest(".md-drag-handle");
    if (!handle) {
      return;
    }
    const block = handle.closest(".md-block-draggable");
    if (!block || !block.parentElement) {
      return;
    }
    blockDragState = { block, container: block.parentElement, targetContainer: block.parentElement };
    block.classList.add("md-block-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "md-block");
  });

  reportContent.addEventListener("dragend", () => {
    blockDragState?.block?.classList.remove("md-block-dragging");
    blockDragState = null;
    clearBlockDropIndicators();
  });

  reportContent.addEventListener("dragover", (event) => {
    if (!blockDragState) {
      return;
    }
    if (event.target.closest(".md-drag-handle")) {
      return;
    }
    const container = findBlockDropContainer(event.clientX, event.clientY, blockDragState.block);
    if (!container) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    blockDragState.targetContainer = container;
    showBlockDropIndicator(container, getBlockDropTarget(container, event.clientY, blockDragState.block));
  });

  reportContent.addEventListener("drop", (event) => {
    if (!blockDragState) {
      return;
    }
    event.preventDefault();
    const { block } = blockDragState;
    const container =
      blockDragState.targetContainer ||
      findBlockDropContainer(event.clientX, event.clientY, block) ||
      blockDragState.container;
    if (!container) {
      return;
    }
    const beforeNode = getBlockDropTarget(container, event.clientY, block);
    if (beforeNode) {
      container.insertBefore(block, beforeNode);
    } else {
      container.appendChild(block);
    }
    clearBlockDropIndicators();
    blockDragState.block?.classList.remove("md-block-dragging");
    blockDragState = null;
    applyMarkdownReorder();
  });
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

function resolveHeadingAnchorId(headingText) {
  const normalized = String(headingText || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const tocLinks = Array.from(toc?.querySelectorAll("a[data-anchor]") || []);
  for (const link of tocLinks) {
    const label = link.textContent?.replace(/^\s*[\d.]+\s*/, "").trim().toLowerCase();
    if (label === normalized) {
      return link.dataset.anchor || null;
    }
  }

  const headings = Array.from(reportContent?.querySelectorAll("h1,h2,h3,h4,h5,h6") || []);
  for (const heading of headings) {
    if (heading.textContent?.trim().toLowerCase() === normalized) {
      return heading.id || null;
    }
  }

  return null;
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
  renderedAnnotations = [];
  if (annotationDock) annotationDock.innerHTML = "";
  activeCitation = null;
  citeRefSerial = 0;
  citeSourcePreviewIndex.clear();
  hideCiteHoverPopover();
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
  renderAnnotationDock();
  requestAnnotationNormalization();
  updateActiveToc();
  void hydrateMermaid(reportContent);
  applyBlockDragSetting();
  if (window.MeowWysiwyg?.refresh) {
    window.MeowWysiwyg.refresh();
  }
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
  const markdownRoot = document.createElement("div");
  markdownRoot.className = "markdown-body";
  markdownRoot.appendChild(renderMarkdown(file.content, file));
  wrapContentInSections(markdownRoot);
  annotateContentBranches(markdownRoot);
  attachBlockDragHandles(markdownRoot);
  section.appendChild(markdownRoot);
  return section;
}

function withOutlineNumbers(file) {
  const headings = file.headings || [];
  const hasSingleArticleTitle = headings.filter((heading) => Number(heading.level) === 1).length === 1;
  const counters = [];
  const numberedHeadings = headings.map((heading) => {
    const level = Math.max(1, Math.min(Number(heading.level) || 1, 6));
    const numberingLevel = hasSingleArticleTitle ? level - 1 : level;
    if (numberingLevel <= 0) {
      return {
        ...heading,
        cleanText: stripOutlinePrefix(heading.text),
        outlineNumber: ""
      };
    }
    counters.length = numberingLevel;
    counters[numberingLevel - 1] = (counters[numberingLevel - 1] || 0) + 1;
    for (let index = 0; index < numberingLevel - 1; index += 1) {
      if (!counters[index]) counters[index] = 1;
    }
    const outlineNumber = counters.slice(0, numberingLevel).join(".");
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

function initAnnotations() {
  if (!reportContent || !vscode) {
    return;
  }

  document.addEventListener("selectionchange", () => {
    window.requestAnimationFrame(updateAnnotationAction);
  });
  window.addEventListener("scroll", () => {
    hideAnnotationAction();
    scheduleAnnotationPositions();
  }, { passive: true });
  window.addEventListener("resize", () => {
    hideAnnotationAction();
    scheduleAnnotationPositions();
  });
}

function initAnnotationHistory() {
  annotationHistoryButton?.addEventListener("click", () => {
    const open = annotationHistoryPanel?.hidden !== false;
    if (annotationHistoryPanel) annotationHistoryPanel.hidden = !open;
    annotationHistoryButton.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (annotationHistoryPanel?.hidden !== false || annotationHistoryRoot?.contains(event.target)) return;
    annotationHistoryPanel.hidden = true;
    annotationHistoryButton?.setAttribute("aria-expanded", "false");
  });
}

function getSelectionElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
}

function getAnnotationSelection() {
  if (document.body.classList.contains("editor-mode") || annotationDialog) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startElement = getSelectionElement(range.startContainer);
  const endElement = getSelectionElement(range.endContainer);
  if (!startElement || !endElement || !reportContent.contains(startElement) || !reportContent.contains(endElement)) {
    return null;
  }
  if (startElement.closest(".reader-tools-root, .annotation-dialog") || endElement.closest(".reader-tools-root, .annotation-dialog")) {
    return null;
  }
  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  const startBlock = startElement.closest("[data-md-start]");
  const endBlock = endElement.closest("[data-md-end]");
  const branch = startElement.closest(".content-branch");
  const heading = branch?.querySelector(":scope > .report-heading");
  return {
    selectedText,
    lineStart: startBlock?.dataset.mdStart ? Number(startBlock.dataset.mdStart) + 1 : undefined,
    lineEnd: endBlock?.dataset.mdEnd ? Number(endBlock.dataset.mdEnd) + 1 : undefined,
    heading: heading?.dataset.outlineText || heading?.querySelector(".outline-text")?.textContent?.trim() || "",
    anchor: branch?.dataset.anchor || "",
    rect: range.getBoundingClientRect()
  };
}

function ensureAnnotationAction() {
  if (annotationAction) {
    return annotationAction;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "annotation-action";
  button.textContent = "添加批注";
  button.hidden = true;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (pendingAnnotationSelection) {
      openAnnotationDialog(pendingAnnotationSelection);
    }
  });
  document.body.appendChild(button);
  annotationAction = button;
  return button;
}

function updateAnnotationAction() {
  const info = getAnnotationSelection();
  if (!info || !info.rect || (!info.rect.width && !info.rect.height)) {
    hideAnnotationAction();
    return;
  }
  pendingAnnotationSelection = info;
  const button = ensureAnnotationAction();
  button.hidden = false;
  const left = Math.min(window.innerWidth - button.offsetWidth - 12, Math.max(12, info.rect.left + info.rect.width / 2 - button.offsetWidth / 2));
  const top = Math.max(12, info.rect.top - button.offsetHeight - 8);
  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(top)}px`;
}

function hideAnnotationAction() {
  if (annotationAction) {
    annotationAction.hidden = true;
  }
  if (!annotationDialog) {
    pendingAnnotationSelection = null;
  }
}

function positionAnnotationComposeDialog(overlay, info, annotation) {
  const placeOnLeft = annotationDock?.classList.contains("annotation-left");
  overlay.classList.toggle("annotation-left", Boolean(placeOnLeft));
  overlay.classList.toggle("annotation-right", !placeOnLeft);
  const referenceRect = annotation?.anchorElement?.getBoundingClientRect() || info?.rect;
  const card = overlay.querySelector(".annotation-dialog-card");
  const desiredTop = referenceRect?.top ?? 16;
  const maxTop = Math.max(10, window.innerHeight - (card?.offsetHeight || 0) - 10);
  overlay.style.top = `${Math.round(Math.min(maxTop, Math.max(10, desiredTop)))}px`;
}

function openAnnotationDialog(info, annotation = null) {
  hideAnnotationAction();
  const editing = Boolean(annotation);
  const overlay = document.createElement("div");
  overlay.className = "annotation-dialog annotation-compose-dialog";
  overlay.innerHTML = `
    <div class="annotation-dialog-card" role="dialog" aria-modal="false" aria-labelledby="annotationDialogTitle">
      <h2 id="annotationDialogTitle">${editing ? "编辑批注" : "添加批注"}</h2>
      <div class="annotation-quote"></div>
      <label for="annotationComment">批注内容</label>
      <textarea id="annotationComment" rows="6" placeholder="写下你的批注…"></textarea>
      <div class="annotation-dialog-actions">
        <button type="button" data-action="cancel">取消</button>
        <button type="button" class="primary" data-action="save">${editing ? "保存修改" : "添加批注"}</button>
      </div>
    </div>`;
  overlay.querySelector(".annotation-quote").textContent = editing ? annotation.quote : info.selectedText;
  const textarea = overlay.querySelector("textarea");
  const saveButton = overlay.querySelector('[data-action="save"]');
  textarea.value = editing ? annotation.body : "";
  overlay.querySelector('[data-action="cancel"]').addEventListener("click", closeAnnotationDialog);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeAnnotationDialog();
  });
  saveButton.addEventListener("click", () => {
    const comment = textarea.value.trim();
    if (!comment) {
      textarea.focus();
      return;
    }
    if (editing) {
      vscode?.postMessage({ type: "updateAnnotation", annotationId: annotation.id, comment });
    } else {
      vscode?.postMessage({
        type: "addAnnotation",
        selectedText: info.selectedText,
        comment,
        lineStart: info.lineStart,
        lineEnd: info.lineEnd,
        heading: info.heading,
        anchor: info.anchor
      });
    }
    overlay.querySelectorAll("button, textarea").forEach((element) => element.disabled = true);
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    saveButton.click();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAnnotationDialog();
  });
  document.body.appendChild(overlay);
  annotationDialog = overlay;
  window.requestAnimationFrame(() => {
    positionAnnotationComposeDialog(overlay, info, annotation);
    textarea.focus();
  });
}

function openAnnotationDeleteDialog(annotation) {
  closeAnnotationDialog();
  const overlay = document.createElement("div");
  overlay.className = "annotation-dialog";
  overlay.innerHTML = `
    <div class="annotation-dialog-card" role="dialog" aria-modal="true" aria-labelledby="annotationDeleteDialogTitle">
      <h2 id="annotationDeleteDialogTitle">删除批注</h2>
      <div class="annotation-quote"></div>
      <p class="annotation-delete-hint">删除后会同时更新并保存当前 Markdown 文件。</p>
      <div class="annotation-dialog-actions">
        <button type="button" data-action="cancel">取消</button>
        <button type="button" class="danger" data-action="delete">确认删除</button>
      </div>
    </div>`;
  overlay.querySelector(".annotation-quote").textContent = annotation.quote;
  const cancelButton = overlay.querySelector('[data-action="cancel"]');
  const deleteButton = overlay.querySelector('[data-action="delete"]');
  cancelButton.addEventListener("click", closeAnnotationDialog);
  deleteButton.addEventListener("click", () => {
    overlay.querySelectorAll("button").forEach((button) => button.disabled = true);
    vscode?.postMessage({ type: "deleteAnnotation", annotationId: annotation.id });
  });
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeAnnotationDialog();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAnnotationDialog();
  });
  document.body.appendChild(overlay);
  annotationDialog = overlay;
  window.requestAnimationFrame(() => cancelButton.focus());
}

function closeAnnotationDialog() {
  annotationDialog?.remove();
  annotationDialog = null;
  pendingAnnotationSelection = null;
  window.getSelection()?.removeAllRanges();
}

function showAnnotationToast(message, isError = false) {
  document.querySelector(".annotation-toast")?.remove();
  if (annotationToastTimer) window.clearTimeout(annotationToastTimer);
  const toast = document.createElement("div");
  toast.className = `annotation-toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  annotationToastTimer = window.setTimeout(() => toast.remove(), 3200);
}

function normalizeAnnotationMatchText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "");
}

function findAnnotationBranch(section, annotation) {
  const branches = Array.from(section.querySelectorAll(".content-branch"));
  if (annotation.anchor) {
    const savedBranch = branches.find((branch) => branch.dataset.anchor === annotation.anchor);
    if (savedBranch) return savedBranch;
  }

  const normalizedHeading = normalizeAnnotationMatchText(annotation.heading);
  if (!normalizedHeading) return null;
  return branches.find((branch) => {
    const heading = branch.querySelector(":scope > .report-heading");
    const headingText = heading?.dataset.outlineText || heading?.querySelector(".outline-text")?.textContent || heading?.textContent;
    return normalizeAnnotationMatchText(headingText) === normalizedHeading;
  }) || null;
}

function findAnnotationAnchor(annotation, quote = annotation.highlightQuote || annotation.quote) {
  const section = document.getElementById(annotation.fileId);
  if (!section) return null;

  const savedBranch = findAnnotationBranch(section, annotation);
  const searchRoot = savedBranch || section;
  const blocks = Array.from(searchRoot.querySelectorAll("[data-md-start][data-md-end]"))
    .filter((block) => !block.classList.contains("content-branch"));
  const compactQuote = normalizeAnnotationMatchText(quote);

  if (compactQuote) {
    const quoteTarget = blocks.find((block) => normalizeAnnotationMatchText(block.textContent).includes(compactQuote));
    if (quoteTarget) return quoteTarget;
    if (savedBranch) {
      const documentTarget = Array.from(section.querySelectorAll("[data-md-start][data-md-end]"))
        .filter((block) => !block.classList.contains("content-branch"))
        .find((block) => normalizeAnnotationMatchText(block.textContent).includes(compactQuote));
      if (documentTarget) return documentTarget;
    }
  }

  const lineTarget = blocks.find((block) => {
    const start = Number(block.dataset.mdStart);
    const end = Number(block.dataset.mdEnd);
    return start <= annotation.targetLine && end >= annotation.targetLine;
  });
  if (lineTarget) return lineTarget;

  const heading = savedBranch?.querySelector(":scope > .report-heading");
  if (heading) return heading;
  const adjacentBlock = blocks.filter((block) => Number(block.dataset.mdEnd) < annotation.sourceStartLine).at(-1);
  return adjacentBlock || section;
}

function appendAnnotationMarkdown(parent, markdown) {
  const chunks = String(markdown || "").split(/\n{2,}/);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, chunk.replace(/\n/g, " "), {});
    parent.appendChild(paragraph);
  }
}

function getAnnotationTextNodes(anchor) {
  const nodes = [];
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(".annotation-marker, .md-drag-handle")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function highlightAnnotationQuote(annotation) {
  const anchor = annotation.anchorElement;
  const highlightQuote = annotation.highlightQuote || annotation.quote;
  if (!anchor || !highlightQuote) return [];
  const nodes = getAnnotationTextNodes(anchor);
  const rawText = nodes.map((node) => node.data).join("");
  const segments = new Map();
  const exactStart = rawText.indexOf(highlightQuote);
  if (exactStart >= 0) {
    const exactEnd = exactStart + highlightQuote.length;
    let cursor = 0;
    for (const node of nodes) {
      const nodeStart = cursor;
      const nodeEnd = cursor + node.data.length;
      cursor = nodeEnd;
      const start = Math.max(exactStart, nodeStart);
      const end = Math.min(exactEnd, nodeEnd);
      if (start < end) segments.set(node, { start: start - nodeStart, end: end - nodeStart });
    }
  } else {
    let normalized = "";
    const positions = [];
    const appendSpace = (position = null) => {
      if (normalized && !normalized.endsWith(" ")) {
        normalized += " ";
        positions.push(position);
      }
    };
    nodes.forEach((node, nodeIndex) => {
      if (nodeIndex > 0) appendSpace();
      for (let offset = 0; offset < node.data.length; offset += 1) {
        if (/\s/.test(node.data[offset])) appendSpace({ node, offset });
        else {
          normalized += node.data[offset];
          positions.push({ node, offset });
        }
      }
    });
    const normalizedQuote = highlightQuote.replace(/\s+/g, " ").trim();
    const normalizedStart = normalized.indexOf(normalizedQuote);
    if (normalizedStart < 0) return [];
    for (const position of positions.slice(normalizedStart, normalizedStart + normalizedQuote.length)) {
      if (!position) continue;
      const segment = segments.get(position.node) || { start: position.offset, end: position.offset + 1 };
      segment.start = Math.min(segment.start, position.offset);
      segment.end = Math.max(segment.end, position.offset + 1);
      segments.set(position.node, segment);
    }
  }
  if (!segments.size) return [];

  const highlights = [];
  for (const node of nodes) {
    const segment = segments.get(node);
    if (!segment) continue;
    node.splitText(segment.end);
    const selected = node.splitText(segment.start);
    const mark = document.createElement("mark");
    mark.className = "annotation-highlight";
    mark.dataset.annotationId = annotation.id;
    selected.replaceWith(mark);
    mark.appendChild(selected);
    highlights.push(mark);
  }
  return highlights;
}

function activateAnnotation(annotation, { scrollToAnchor = false } = {}) {
  for (const item of renderedAnnotations) {
    const active = item === annotation;
    item.cardElement?.classList.toggle("is-active", active);
    item.markerElement?.classList.toggle("is-active", active);
    for (const highlight of item.highlightElements || []) highlight.classList.toggle("is-active", active);
  }
  if (scrollToAnchor) {
    annotation.anchorElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    scheduleAnnotationPositions();
  }
}

function compareAnnotationAnchorOrder(left, right) {
  const leftAnchor = left.anchorElement;
  const rightAnchor = right.anchorElement;
  if (leftAnchor === rightAnchor) return 0;
  if (!leftAnchor) return 1;
  if (!rightAnchor) return -1;

  const position = leftAnchor.compareDocumentPosition(rightAnchor);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function renderAnnotationDock() {
  if (!annotationDock) return;
  annotationDock.innerHTML = "";
  const openAnnotations = renderedAnnotations.filter((annotation) => annotation.status !== "resolved");
  annotationDock.hidden = openAnnotations.length === 0;
  renderAnnotationHistory();
  if (!openAnnotations.length) return;

  const anchorCounts = new Map();
  for (const annotation of openAnnotations) {
    annotation.anchorElement = findAnnotationAnchor(annotation);
  }
  openAnnotations.sort(compareAnnotationAnchorOrder);

  for (const annotation of openAnnotations) {
    const anchor = annotation.anchorElement;

    const card = document.createElement("article");
    card.className = "annotation-card";
    card.dataset.annotationId = annotation.id;
    card.tabIndex = -1;
    const header = document.createElement("div");
    header.className = "annotation-card-header";
    const actions = document.createElement("div");
    actions.className = "annotation-card-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "编辑";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    actions.append(editButton, deleteButton);
    header.appendChild(actions);
    const quote = document.createElement("div");
    quote.className = "annotation-card-quote";
    quote.textContent = annotation.quote;
    const body = document.createElement("div");
    body.className = "annotation-card-body";
    appendAnnotationMarkdown(body, annotation.body);
    card.append(header, quote, body);
    if (annotation.changeQuote) {
      const change = document.createElement("div");
      change.className = "annotation-card-change";
      const changeLabel = document.createElement("strong");
      changeLabel.textContent = "AI 首处改动";
      const changeText = document.createElement("div");
      changeText.textContent = annotation.changeQuote;
      change.append(changeLabel, changeText);
      card.appendChild(change);
    }
    if (annotation.reply) {
      const reply = document.createElement("div");
      reply.className = "annotation-card-reply";
      const replyLabel = document.createElement("strong");
      replyLabel.textContent = "AI 回复";
      reply.appendChild(replyLabel);
      appendAnnotationMarkdown(reply, annotation.reply);
      card.appendChild(reply);
    }
    const resolveButton = document.createElement("button");
    resolveButton.type = "button";
    resolveButton.className = "annotation-resolve-button";
    resolveButton.textContent = "解决";
    card.appendChild(resolveButton);
    annotationDock.appendChild(card);
    annotation.cardElement = card;
    annotation.highlightElements = highlightAnnotationQuote(annotation);
    card.addEventListener("click", () => activateAnnotation(annotation, { scrollToAnchor: true }));
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      activateAnnotation(annotation);
      openAnnotationDialog(null, annotation);
    });
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      activateAnnotation(annotation);
      openAnnotationDeleteDialog(annotation);
    });
    resolveButton.addEventListener("click", (event) => {
      event.stopPropagation();
      card.querySelectorAll("button").forEach((button) => button.disabled = true);
      vscode?.postMessage({ type: "resolveAnnotation", annotationId: annotation.id });
    });

    if (anchor && anchor !== document.getElementById(annotation.fileId)) {
      anchor.classList.add("has-annotation");
      anchorCounts.set(anchor, (anchorCounts.get(anchor) || 0) + 1);
    }
  }

  for (const [anchor, count] of anchorCounts) {
    let marker = anchor.querySelector(":scope > .annotation-marker");
    if (!marker) {
      marker = document.createElement("button");
      marker.type = "button";
      marker.className = "annotation-marker";
      marker.contentEditable = "false";
      marker.addEventListener("click", () => {
        const items = openAnnotations.filter((item) => item.anchorElement === anchor);
        const activeIndex = items.findIndex((item) => item.cardElement?.classList.contains("is-active"));
        const annotation = items[(activeIndex + 1) % items.length];
        if (!annotation) return;
        activateAnnotation(annotation);
        annotation.cardElement?.focus();
      });
      anchor.appendChild(marker);
    }
    marker.textContent = "";
    marker.dataset.label = count > 1 ? `批注 ${count}` : "批注";
    marker.title = count > 1 ? `${count} 条批注` : "查看批注";
    for (const annotation of openAnnotations.filter((item) => item.anchorElement === anchor)) {
      annotation.markerElement = marker;
    }
  }
  scheduleAnnotationPositions();
}

function createAnnotationHistoryField(label, text, className = "") {
  const field = document.createElement("div");
  field.className = `annotation-history-field${className ? ` ${className}` : ""}`;
  const title = document.createElement("strong");
  title.textContent = label;
  const value = document.createElement("div");
  value.textContent = text || "未记录";
  field.append(title, value);
  return field;
}

function renderAnnotationHistory() {
  if (!annotationHistoryRoot || !annotationHistoryPanel || !annotationHistoryButton) return;
  const resolved = renderedAnnotations.filter((annotation) => annotation.status === "resolved");
  annotationHistoryRoot.hidden = resolved.length === 0 || document.body.classList.contains("editor-mode");
  annotationHistoryButton.textContent = resolved.length ? `批注 ${resolved.length}` : "批注";
  annotationHistoryPanel.innerHTML = "";
  if (!resolved.length) {
    annotationHistoryPanel.hidden = true;
    annotationHistoryButton.setAttribute("aria-expanded", "false");
    return;
  }

  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.textContent = "已完成批注";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "关闭";
  closeButton.addEventListener("click", () => {
    annotationHistoryPanel.hidden = true;
    annotationHistoryButton.setAttribute("aria-expanded", "false");
  });
  header.append(title, closeButton);
  annotationHistoryPanel.appendChild(header);

  const list = document.createElement("div");
  list.className = "annotation-history-list";
  for (const annotation of [...resolved].reverse()) {
    const item = document.createElement("article");
    item.className = "annotation-history-item";
    item.append(
      createAnnotationHistoryField("批注问题", annotation.body),
      createAnnotationHistoryField("原选中内容", annotation.quote, "is-original"),
      createAnnotationHistoryField("AI 改动位置", annotation.changeQuote, "is-change"),
      createAnnotationHistoryField("AI 回复", annotation.reply, "is-reply")
    );
    if (annotation.resolvedAt) {
      const time = document.createElement("time");
      time.dateTime = annotation.resolvedAt;
      time.textContent = `解决于 ${new Date(annotation.resolvedAt).toLocaleString()}`;
      item.appendChild(time);
    }
    list.appendChild(item);
  }
  annotationHistoryPanel.appendChild(list);
}

function requestAnnotationNormalization() {
  if (!vscode || !renderedAnnotations.length) return;
  const ids = renderedAnnotations.map((annotation) => annotation.id);
  const key = ids.join("\n");
  if (key === lastAnnotationNormalizationKey) return;
  lastAnnotationNormalizationKey = key;
  vscode.postMessage({ type: "normalizeAnnotations", annotationIds: ids });
}

function scheduleAnnotationPositions() {
  if (!annotationDock || annotationDock.hidden || annotationPositionFrame) return;
  annotationPositionFrame = window.requestAnimationFrame(() => {
    annotationPositionFrame = null;
    positionAnnotationCards();
  });
}

function positionAnnotationCards() {
  if (!annotationDock || annotationDock.hidden) return;
  const dockRect = annotationDock.getBoundingClientRect();
  const gap = 10;
  let nextTop = Number.NEGATIVE_INFINITY;
  const positionedAnnotations = renderedAnnotations
    .map((annotation, order) => {
      const card = annotation.cardElement;
      const anchor = annotation.anchorElement;
      if (!card || !anchor) return null;
      return {
        card,
        desiredTop: anchor.getBoundingClientRect().top - dockRect.top,
        order
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.desiredTop - right.desiredTop || left.order - right.order);

  for (const { card, desiredTop } of positionedAnnotations) {
    const top = Math.max(desiredTop, nextTop);
    card.hidden = false;
    const cardHeight = card.offsetHeight;
    card.style.top = `${Math.round(top)}px`;
    card.hidden = top + cardHeight <= 0 || top >= dockRect.height;
    nextTop = top + cardHeight + gap;
  }
}

function parseAnnotationMeta(lines) {
  const meta = {};
  for (const line of lines) {
    const match = /^([a-z_][a-z0-9_]*):\s*(.*)$/i.exec(String(line || "").trim());
    if (!match) continue;
    let value = match[2].trim();
    try {
      value = JSON.parse(value);
    } catch {
      // Keep unquoted metadata readable and forward-compatible.
    }
    meta[match[1].toLowerCase()] = value;
  }
  return meta;
}

function extractAnnotationContent(lines) {
  const quoteLines = lines
    .filter((line) => !/^\s*<!--/.test(line))
    .map((line) => String(line || "").replace(/^\s*>\s?/, ""));
  if (/^\*\*批注[：:]/.test(quoteLines[0] || "")) {
    quoteLines.shift();
  }
  while (quoteLines[0] === "") quoteLines.shift();
  while (quoteLines.at(-1) === "") quoteLines.pop();
  const replyIndex = quoteLines.findIndex((line) => /^\*\*AI\s*回复[：:]?\*\*$/.test(line.trim()));
  if (replyIndex < 0) return { body: quoteLines.join("\n"), reply: "" };
  const bodyLines = quoteLines.slice(0, replyIndex);
  const replyLines = quoteLines.slice(replyIndex + 1);
  while (bodyLines.at(-1) === "") bodyLines.pop();
  while (replyLines[0] === "") replyLines.shift();
  return { body: bodyLines.join("\n"), reply: replyLines.join("\n") };
}

function extractAnnotationBody(lines) {
  return extractAnnotationContent(lines).body;
}

function extractObsidianFrontmatter(lines) {
  if (!Array.isArray(lines) || !/^\uFEFF?---\s*$/.test(String(lines[0] || ""))) {
    return null;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (/^(?:---|\.\.\.)\s*$/.test(String(lines[index] || ""))) {
      return {
        endLine: index,
        rawMarkdown: lines.slice(0, index + 1).join("\n")
      };
    }
  }

  return null;
}

function unquoteFrontmatterValue(value) {
  const text = String(value || "").trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function splitFrontmatterList(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("[") || !text.endsWith("]")) return null;
  const items = [];
  let quote = "";
  let escaped = false;
  let current = "";
  for (const char of text.slice(1, -1)) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote === '"') {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char;
      current += char;
      continue;
    }
    if (char === "," && !quote) {
      items.push(unquoteFrontmatterValue(current));
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() || items.length) items.push(unquoteFrontmatterValue(current));
  return items.filter((item) => String(item).trim());
}

function parseObsidianFrontmatter(rawMarkdown) {
  if (!rawMarkdown) return [];
  const lines = String(rawMarkdown).split(/\r?\n/).slice(1, -1);
  const fields = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/.exec(lines[index]);
    if (!match) continue;
    const key = match[1];
    let rawValue = String(match[2] || "").trim();
    const continuation = [];
    while (index + 1 < lines.length && (/^[ \t]+/.test(lines[index + 1]) || !lines[index + 1].trim())) {
      index += 1;
      continuation.push(lines[index]);
    }

    let values = splitFrontmatterList(rawValue);
    if (!values && !rawValue) {
      const listValues = continuation
        .map((line) => /^\s*-\s+(.*)$/.exec(line))
        .filter(Boolean)
        .map((item) => unquoteFrontmatterValue(item[1]));
      if (listValues.length) values = listValues;
    }

    if (rawValue === "|" || rawValue === ">") {
      const parts = continuation.map((line) => line.replace(/^[ \t]+/, ""));
      rawValue = rawValue === ">" ? parts.join(" ") : parts.join("\n");
    } else if (!rawValue && !values && continuation.length) {
      rawValue = continuation.map((line) => line.trim()).filter(Boolean).join(" ");
    }

    const value = values || unquoteFrontmatterValue(rawValue);
    const normalizedKey = key.toLowerCase();
    let type = "text";
    if (normalizedKey === "tags" || normalizedKey === "tag") type = "tags";
    else if (values) type = "list";
    else if (/^\d{4}-\d{2}-\d{2}(?:[T ][^\s]+)?$/.test(String(value))) type = "date";
    else if (/^-?(?:\d+|\d*\.\d+)$/.test(String(value))) type = "number";
    else if (/^(?:true|false)$/i.test(String(value))) type = "boolean";
    fields.push({ key, type, value });
  }

  return fields;
}

function createPropertyIcon(type) {
  const icon = document.createElement("span");
  icon.className = "note-property-icon";
  icon.setAttribute("aria-hidden", "true");
  if (type === "tags") {
    icon.innerHTML = '<svg viewBox="0 0 16 16"><path d="M2.5 3.5v4.2l5.8 5.8 5.2-5.2-5.8-5.8H2.5Z"/><circle cx="5.4" cy="5.4" r=".9"/></svg>';
  } else if (type === "date") {
    icon.innerHTML = '<svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5 2v3M11 2v3M2.5 6.5h11"/></svg>';
  } else if (type === "number") {
    icon.classList.add("note-property-icon--number");
    icon.textContent = "01";
  } else if (type === "boolean") {
    icon.innerHTML = '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="m5 8 2 2 4-4"/></svg>';
  } else {
    icon.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 4h10M3 8h10M3 12h7"/></svg>';
  }
  return icon;
}

function renderReadonlyFrontmatter(fields) {
  if (!fields?.length) return null;
  const section = document.createElement("section");
  section.className = "note-properties";
  section.contentEditable = "false";
  section.setAttribute("aria-label", "笔记属性（只读）");

  const title = document.createElement("div");
  title.className = "note-properties-title";
  title.textContent = "笔记属性";
  section.appendChild(title);

  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "note-property-row";
    row.appendChild(createPropertyIcon(field.type));

    const key = document.createElement("div");
    key.className = "note-property-key";
    key.textContent = field.key;
    key.title = field.key;

    const value = document.createElement("div");
    value.className = "note-property-value";
    if (field.type === "tags" || field.type === "list") {
      value.classList.add("note-property-value--chips");
      const values = Array.isArray(field.value) ? field.value : [field.value];
      for (const item of values) {
        const chip = document.createElement("span");
        chip.className = `note-property-chip${field.type === "tags" ? " note-property-chip--tag" : ""}`;
        chip.textContent = String(item);
        value.appendChild(chip);
      }
    } else {
      const displayValue = field.type === "date" ? String(field.value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3") : String(field.value);
      value.textContent = displayValue || "—";
    }

    row.append(key, value);
    section.appendChild(row);
  }
  return section;
}

function preprocessMarkdownContent(content) {
  const footnotes = new Map();
  const footnoteDefinitions = [];
  const annotations = [];
  const bodyLines = [];
  let annotationGuide = "";
  const sourceLines = String(content || "").split(/\r?\n/);
  const frontmatter = extractObsidianFrontmatter(sourceLines);
  const rawLines = normalizeMarkdownLines(content);
  let inCode = false;
  let openFence = null;

  if (frontmatter) {
    for (let index = 0; index <= frontmatter.endLine; index += 1) {
      rawLines[index] = "";
    }
  }

  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    const fence = parseCodeFenceLine(line);
    if (fence) {
      if (!inCode) {
        inCode = true;
        openFence = { char: fence.char, length: fence.length };
      } else if (isCodeFenceClose(line, openFence)) {
        inCode = false;
        openFence = null;
      }
      bodyLines.push(line);
      continue;
    }

    if (!inCode && /^\s*<!--\s*mr-annotation:ai-guide\s*$/.test(line)) {
      let cursor = index + 1;
      while (cursor < rawLines.length && !/^\s*-->\s*$/.test(rawLines[cursor])) cursor += 1;
      if (cursor < rawLines.length) {
        if (!annotationGuide) annotationGuide = rawLines.slice(index, cursor + 1).join("\n");
        for (let hiddenIndex = index; hiddenIndex <= cursor; hiddenIndex += 1) bodyLines.push("");
        index = cursor;
        continue;
      }
    }

    if (!inCode && /^\s*<!--\s*mr-annotation:start\s*$/.test(line)) {
      let cursor = index + 1;
      const metaLines = [];
      while (cursor < rawLines.length && !/^\s*-->\s*$/.test(rawLines[cursor])) {
        metaLines.push(rawLines[cursor]);
        cursor += 1;
      }
      if (cursor < rawLines.length) cursor += 1;
      const visibleLines = [];
      while (cursor < rawLines.length && !/^\s*<!--\s*mr-annotation:end\s*-->\s*$/.test(rawLines[cursor])) {
        visibleLines.push(rawLines[cursor]);
        cursor += 1;
      }
      if (cursor < rawLines.length) {
        const meta = parseAnnotationMeta(metaLines);
        const annotationContent = extractAnnotationContent(visibleLines);
        annotations.push({
          id: String(meta.id || `annotation-${index + 1}`),
          quote: String(meta.quote || ""),
          heading: String(meta.heading || ""),
          anchor: String(meta.anchor || ""),
          createdAt: String(meta.created_at || ""),
          status: String(meta.status || "open").toLowerCase(),
          resolvedAt: String(meta.resolved_at || ""),
          changeQuote: String(meta.change_quote || ""),
          highlightQuote: String(meta.change_quote || meta.quote || ""),
          targetLine: Number.isFinite(Number(meta.line_start)) ? Math.max(0, Number(meta.line_start) - 1) : Math.max(0, index - 1),
          sourceStartLine: index,
          sourceEndLine: cursor,
          body: annotationContent.body,
          reply: annotationContent.reply,
          rawMarkdown: rawLines.slice(index, cursor + 1).join("\n")
        });
        for (let hiddenIndex = index; hiddenIndex <= cursor; hiddenIndex += 1) bodyLines.push("");
        index = cursor;
        continue;
      }
    }

    const match = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(String(line || "").trim());
    if (!match) {
      bodyLines.push(line);
      continue;
    }

    const id = match[1].trim().toLowerCase();
    let text = match[2].trim();
    const definitionLines = [line];
    bodyLines.push("");
    while (index + 1 < rawLines.length && /^(?: {4,}|\t)/.test(rawLines[index + 1])) {
      index += 1;
      text += ` ${String(rawLines[index] || "").trim()}`;
      definitionLines.push(rawLines[index]);
      bodyLines.push("");
    }
    footnotes.set(id, text);
    footnoteDefinitions.push(definitionLines.join("\n"));
  }

  return {
    lines: bodyLines,
    footnotes,
    footnoteDefinitions,
    annotations,
    annotationGuide,
    frontmatter: frontmatter?.rawMarkdown || "",
    frontmatterFields: parseObsidianFrontmatter(frontmatter?.rawMarkdown || "")
  };
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

function parseTableCellTask(cellText) {
  const value = String(cellText || "").trim();
  if (!value) return null;

  const listTask = /^([-*+]\s+\[)([ xX])(\])(?:\s+(.+))?$/.exec(value);
  if (listTask) {
    return {
      checked: listTask[2].toLowerCase() === "x",
      bodyText: (listTask[4] || "").trim()
    };
  }

  const bracketTask = /^(\[)([ xX])(\])(?:\s+(.+))?$/.exec(value);
  if (bracketTask) {
    return {
      checked: bracketTask[2].toLowerCase() === "x",
      bodyText: (bracketTask[4] || "").trim()
    };
  }

  return null;
}

function replaceCellTaskMarker(cell, checked) {
  const value = String(cell);
  const trimmed = value.trim();
  const listMatch = /^([-*+]\s+\[)([ xX])(\])(.*)$/.exec(trimmed);
  if (listMatch) {
    const nextInner = `${listMatch[1]}${checked ? "x" : " "}${listMatch[3]}${listMatch[4]}`;
    return value.replace(trimmed, nextInner);
  }

  const bracketMatch = /^(\[)([ xX])(\])(.*)$/.exec(trimmed);
  if (bracketMatch) {
    const nextInner = `${bracketMatch[1]}${checked ? "x" : " "}${bracketMatch[3]}${bracketMatch[4]}`;
    return value.replace(trimmed, nextInner);
  }

  return null;
}

function replaceTableRowCellTask(line, cellIndex, checked) {
  const cells = String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|");

  if (cellIndex < 0 || cellIndex >= cells.length) return null;

  const updatedCell = replaceCellTaskMarker(cells[cellIndex], checked);
  if (updatedCell === null) return null;

  cells[cellIndex] = updatedCell;
  return `|${cells.join("|")}|`;
}

function handleTableCellTaskToggle(lineIndex, cellIndex, checked, checkbox, wrapper) {
  if (document.body.classList.contains("editor-mode") || !vscode || lineIndex < 0) {
    checkbox.checked = !checked;
    return;
  }

  const lines = latestDocumentText.split(/\r?\n/);
  if (lineIndex >= lines.length) {
    checkbox.checked = !checked;
    return;
  }

  const nextLine = replaceTableRowCellTask(lines[lineIndex], cellIndex, checked);
  if (nextLine === null) {
    checkbox.checked = !checked;
    return;
  }

  lines[lineIndex] = nextLine;
  const nextText = lines.join("\n");
  latestDocumentText = nextText;
  wrapper.classList.toggle("table-task-cell--checked", checked);
  checkbox.setAttribute("aria-label", checked ? "标记为未完成" : "标记为已完成");
  vscode.postMessage({ type: "saveContent", content: nextText, persist: false });
}

function appendTableCellContent(parent, cellText, context, lineIndex, cellIndex) {
  const task = parseTableCellTask(cellText);
  if (!task) {
    appendInlineMarkdown(parent, cellText, context);
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "table-task-cell";
  if (task.checked) {
    wrapper.classList.add("table-task-cell--checked");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.checked;
  checkbox.className = "task-checkbox";
  checkbox.setAttribute("aria-label", task.checked ? "标记为未完成" : "标记为已完成");
  if (lineIndex >= 0 && vscode) {
    checkbox.addEventListener("change", () => {
      handleTableCellTaskToggle(lineIndex, cellIndex, checkbox.checked, checkbox, wrapper);
    });
  } else {
    checkbox.disabled = true;
  }
  wrapper.appendChild(checkbox);

  if (task.bodyText) {
    const body = document.createElement("span");
    body.className = "table-task-body";
    appendInlineMarkdown(body, task.bodyText, context);
    wrapper.appendChild(body);
  }

  parent.appendChild(wrapper);
}

function getTableRowCells(row) {
  return row && row.cells ? row.cells : row;
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
  vscode.postMessage({ type: "saveContent", content: nextText, persist: false });
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

function parseCodeFenceLine(line) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(String(line || ""));
  if (!match) {
    return null;
  }
  const marker = match[2];
  return {
    indent: match[1].length,
    char: marker[0],
    length: marker.length,
    remainder: match[3] || ""
  };
}

function isCodeFenceClose(line, openFence) {
  const fence = parseCodeFenceLine(line);
  if (!fence || !openFence || fence.char !== openFence.char || fence.length < openFence.length) {
    return false;
  }
  return /^\s*$/.test(fence.remainder);
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
  renderedAnnotations.push(
    ...preprocessed.annotations.map((annotation) => ({
      ...annotation,
      fileId: `doc-${slugify(file.name)}`
    }))
  );
  let paragraph = [];
  let paragraphStartLine = -1;
  let paragraphEndLine = -1;
  let inCode = false;
  let openCodeFence = null;
  let codeLang = "";
  let codeLines = [];
  let codeStartLine = -1;
  let tableRows = [];
  let headingIndex = 0;

  function flushParagraph() {
    if (!paragraph.length) {
      return;
    }
    const p = document.createElement("p");
    appendInlineMarkdown(p, paragraph.join(" "), context);
    tagMdBlock(p, paragraphStartLine, paragraphEndLine, { draggable: true });
    fragment.appendChild(p);
    paragraph = [];
    paragraphStartLine = -1;
    paragraphEndLine = -1;
  }

  function flushTable() {
    if (!tableRows.length) {
      return;
    }
    const table = renderTable(tableRows, context);
    tagMdBlock(table, tableRows[0].lineIndex, tableRows[tableRows.length - 1].lineIndex, {
      draggable: true
    });
    fragment.appendChild(table);
    tableRows = [];
  }

  function flushCode(endLine) {
    const source = codeLines.join("\n");
    let blockElement;
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
      blockElement = block;
    } else {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = source;
      pre.appendChild(code);
      blockElement = pre;
    }
    tagMdBlock(blockElement, codeStartLine, endLine, { draggable: true });
    fragment.appendChild(blockElement);
    codeLines = [];
    codeStartLine = -1;
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fence = parseCodeFenceLine(line);
    if (fence) {
      if (inCode) {
        if (isCodeFenceClose(line, openCodeFence)) {
          flushParagraph();
          flushTable();
          flushCode(lineIndex);
          codeLang = "";
          inCode = false;
          openCodeFence = null;
        } else {
          codeLines.push(line);
        }
        continue;
      }
      flushParagraph();
      flushTable();
      const info = fence.remainder.trim();
      codeLang = info ? info.split(/\s+/)[0].toLowerCase() : "";
      codeStartLine = lineIndex;
      inCode = true;
      openCodeFence = { char: fence.char, length: fence.length };
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (isTableRow(line)) {
      flushParagraph();
      tableRows.push({ cells: parseTableRow(line), lineIndex });
      continue;
    }
    const sourceLine = parseSourceLine(line);
    if (sourceLine) {
      flushParagraph();
      flushTable();
      const item = renderSourceLine(sourceLine, context);
      tagMdBlock(item, lineIndex, lineIndex);
      fragment.appendChild(item);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushTable();
      const level = Math.min(heading[1].length, 6);
      const h = document.createElement(`h${level}`);
      decorateReportHeading(h, level);
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
      tagMdBlock(h, lineIndex, lineIndex);
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
      const quote = renderBlockquote(blockquote.parts, context);
      tagMdBlock(quote, lineIndex, blockquote.nextIndex - 1, { draggable: true });
      fragment.appendChild(quote);
      lineIndex = blockquote.nextIndex - 1;
      continue;
    }
    if (isHtmlBlockLine(line)) {
      flushParagraph();
      flushTable();
      const htmlBlock = document.createElement("div");
      htmlBlock.className = "md-html-block";
      appendSafeHtmlBlock(htmlBlock, line.trim());
      tagMdBlock(htmlBlock, lineIndex, lineIndex, { draggable: true });
      fragment.appendChild(htmlBlock);
      continue;
    }
    if (lineIndex + 1 < lines.length && /^\s*:\s+/.test(lines[lineIndex + 1])) {
      const definitionListResult = parseDefinitionList(lines, lineIndex);
      if (definitionListResult?.items?.length) {
        flushParagraph();
        flushTable();
        const definitionListNode = renderDefinitionList(definitionListResult.items, context);
        tagMdBlock(definitionListNode, lineIndex, definitionListResult.nextIndex - 1);
        fragment.appendChild(definitionListNode);
        lineIndex = definitionListResult.nextIndex - 1;
        continue;
      }
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (task) {
      flushParagraph();
      flushTable();
      const taskItem = renderTaskListItem(task[1].toLowerCase() === "x", task[2].trim(), context, lineIndex);
      tagMdBlock(taskItem, lineIndex, lineIndex, { draggable: true });
      fragment.appendChild(taskItem);
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
      tagMdBlock(item, lineIndex, lineIndex, { draggable: true });
      fragment.appendChild(item);
      continue;
    }
    flushTable();
    if (!paragraph.length) {
      paragraphStartLine = lineIndex;
    }
    paragraphEndLine = lineIndex;
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushTable();
  if (inCode) {
    flushCode(lines.length - 1);
  }

  const footnotesSection = renderFootnotesSection(context);
  if (footnotesSection) fragment.appendChild(footnotesSection);

  const properties = renderReadonlyFrontmatter(preprocessed.frontmatterFields);
  if (properties) {
    const firstElement = fragment.firstElementChild;
    if (firstElement?.tagName === "H1") {
      firstElement.after(properties);
    } else {
      fragment.insertBefore(properties, fragment.firstChild);
    }
  }

  return fragment;
}

function readCssValue(name, fallback) {
  const readFrom = (element) => {
    if (!element) {
      return "";
    }
    return window.getComputedStyle?.(element)?.getPropertyValue(name)?.trim() || "";
  };
  return readFrom(document.documentElement) || readFrom(document.body) || fallback;
}

function buildMermaidConfig() {
  const editorBackground = readCssValue("--vscode-editor-background", "#1f1f1f");
  const panelBackground = readCssValue("--vscode-sideBar-background", "#252526");
  const textColor = readCssValue("--vscode-editor-foreground", "#d6d6d6");
  const mutedTextColor = readCssValue("--vscode-descriptionForeground", "#9da3a8");
  const borderColor = readCssValue("--vscode-panel-border", "#454545");
  const fontFamily = readCssValue("--vscode-font-family", "Inter, Segoe UI, sans-serif");
  const edgeColor = "#21a7c9";

  return {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    darkMode: true,
    fontFamily,
    htmlLabels: true,
    themeVariables: {
      background: editorBackground,
      mainBkg: panelBackground,
      primaryColor: panelBackground,
      primaryTextColor: textColor,
      primaryBorderColor: borderColor,
      secondaryColor: "#303030",
      tertiaryColor: editorBackground,
      tertiaryTextColor: mutedTextColor,
      tertiaryBorderColor: borderColor,
      lineColor: edgeColor,
      defaultLinkColor: edgeColor,
      edgeLabelBackground: editorBackground,
      clusterBkg: editorBackground,
      clusterBorder: borderColor,
      actorBkg: panelBackground,
      actorBorder: borderColor,
      actorTextColor: textColor,
      activationBkgColor: "#303030",
      activationBorderColor: borderColor,
      signalColor: edgeColor,
      signalTextColor: textColor,
      noteBkgColor: panelBackground,
      noteTextColor: textColor,
      fontFamily
    },
    flowchart: {
      curve: "linear",
      defaultRenderer: "dagre-wrapper",
      nodeSpacing: 50,
      rankSpacing: 50
    }
  };
}

function initializeMermaidRenderer() {
  const config = buildMermaidConfig();
  const configKey = JSON.stringify(config);
  if (window.__mermaidConfigKey === configKey) {
    return;
  }
  mermaid.initialize(config);
  window.__mermaidConfigKey = configKey;
}

function normalizeMermaidSvg(wrapper) {
  const svg = wrapper.querySelector("svg");
  if (!svg) {
    return;
  }
  if (!svg.getAttribute("role")) {
    svg.setAttribute("role", "img");
  }
  svg.setAttribute("focusable", "false");
  if (
    !svg.getAttribute("aria-label") &&
    !svg.getAttribute("aria-labelledby") &&
    !svg.querySelector("title")
  ) {
    svg.setAttribute("aria-label", "Mermaid diagram");
  }
}

async function hydrateMermaid(root) {
  const blocks = root.querySelectorAll(".mermaid-block[data-mermaid-source]");
  if (!blocks.length || typeof mermaid === "undefined") {
    return;
  }

  initializeMermaidRenderer();

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
      normalizeMermaidSvg(wrapper);
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
  citeSourcePreviewIndex.set(
    makeSourceId(context.fileKey, sourceLine.number),
    parseSourcePreview(sourceLine.body)
  );

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
  const cells = getTableRowCells(row);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(String(cell).trim()));
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
    for (const cell of getTableRowCells(rows[0])) {
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
    const cells = getTableRowCells(row);
    const lineIndex = row.lineIndex ?? -1;
    const tr = document.createElement("tr");
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const td = document.createElement("td");
      appendTableCellContent(td, cells[cellIndex], context, lineIndex, cellIndex);
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

    const wikilink = parseWikilink(value, linkStart);
    if (wikilink) {
      const href = wikilinkTargetToHref(wikilink.target);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.title = wikilink.target;
        if (href.startsWith("#")) {
          decorateInternalAnchorLink(link);
        }
        appendInlineText(link, wikilink.display);
        fragment.appendChild(link);
      } else {
        appendInlineText(fragment, value.slice(linkStart, wikilink.end));
      }
      cursor = wikilink.end;
      continue;
    }

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

function parseWikilink(value, start) {
  if (value[start] !== "[" || value[start + 1] !== "[") {
    return null;
  }

  const close = value.indexOf("]]", start + 2);
  if (close === -1) {
    return null;
  }

  const inner = value.slice(start + 2, close).trim();
  if (!inner) {
    return null;
  }

  const pipeIndex = inner.indexOf("|");
  let target;
  let display;
  if (pipeIndex !== -1) {
    target = inner.slice(0, pipeIndex).trim();
    display = inner.slice(pipeIndex + 1).trim() || target;
  } else {
    target = inner;
    if (target.startsWith("#")) {
      display = target.slice(1).replace(/^\^/, "");
    } else if (target.includes("#")) {
      const anchorPart = target.slice(target.indexOf("#") + 1);
      display = anchorPart.replace(/^\^/, "") || target.split("/").pop();
    } else {
      display = target.split("/").pop() || target;
    }
  }

  return { target, display, end: close + 2 };
}

function wikilinkTargetToHref(target) {
  const trimmed = String(target || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  const hashIndex = trimmed.indexOf("#");
  const pathPart = hashIndex >= 0 ? trimmed.slice(0, hashIndex).trim() : trimmed;
  const fragment = hashIndex >= 0 ? trimmed.slice(hashIndex) : "";
  if (!pathPart) {
    return fragment || "";
  }

  let path = pathPart;
  if (!/\.md$/i.test(path)) {
    path = `${path}.md`;
  }

  return `${path}${fragment}`;
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

  const contentFoldButton = evt.target.closest(".content-fold");
  if (contentFoldButton) {
    evt.preventDefault();
    toggleContentBranch(contentFoldButton.closest(".content-branch"));
    return;
  }

  if (evt.target.closest(".md-drag-handle")) {
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
    let targetAnchor = anchorId || href.slice(1);
    const resolvedAnchor = resolveHeadingAnchorId(decodeURIComponent(targetAnchor));
    if (resolvedAnchor) {
      targetAnchor = resolvedAnchor;
    }
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
  hideCiteHoverPopover();
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

  if (/\.md(?:[#?].*)?$/i.test(value)) {
    return true;
  }

  // Obsidian wikilink targets may omit the .md extension.
  return (
    /^[^#?]+\.(?:md)?(?:[#?].*)?$/i.test(value) ||
    /^[^#?]+(?:[#?].*)?$/.test(value)
  );
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
