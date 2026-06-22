(function initMeowWysiwygEditor() {
  const reportContent = document.getElementById("reportContent");
  const enableWysiwygModeInput = document.getElementById("enableWysiwygMode");
  const SETTINGS_KEY = "meowReportMarkdown.enableWysiwygMode";

  let saveTimer = null;
  let tocUpdateTimer = null;

  function isWysiwygEnabled() {
    return document.body.classList.contains("wysiwyg-mode");
  }

  function getLatestDocumentText() {
    return typeof latestDocumentText === "string" ? latestDocumentText : "";
  }

  function setLatestDocumentText(text) {
    if (typeof latestDocumentText === "string") {
      latestDocumentText = text;
    }
  }

  function postEditorStateSafe() {
    if (typeof postEditorState === "function") {
      postEditorState();
    }
  }

  function applyWysiwygSetting(enabled) {
    document.body.classList.toggle("wysiwyg-mode", enabled);
    localStorage.setItem(SETTINGS_KEY, enabled ? "1" : "0");
    if (enableWysiwygModeInput) {
      enableWysiwygModeInput.checked = enabled;
    }
    if (enabled && document.body.classList.contains("editor-mode") && typeof exitEditorMode === "function") {
      exitEditorMode({ discardChanges: false, skipConfirm: true });
    }
    if (typeof applyBlockDragSetting === "function") {
      applyBlockDragSetting();
    }
    refreshEditableBlocks();
    postEditorStateSafe();
  }

  function loadWysiwygSetting() {
    const enabled = localStorage.getItem(SETTINGS_KEY) === "1";
    applyWysiwygSetting(enabled);
  }

  function getEditableTargets() {
    if (!reportContent) {
      return [];
    }
    return Array.from(
      reportContent.querySelectorAll(
        ".report-heading .outline-text, p.md-block:not(.list-line):not(.source-line), p.list-line:not(.source-line) .list-body"
      )
    );
  }

  function getEditableBlock(target) {
    if (target.matches(".outline-text")) {
      return target.closest(".report-heading");
    }
    if (target.matches(".list-body")) {
      return target.closest("p.list-line");
    }
    return target.closest("p.md-block");
  }

  function getBlockLineRange(block) {
    if (!block?.dataset?.mdStart) {
      return null;
    }
    const start = Number(block.dataset.mdStart);
    const end = Number(block.dataset.mdEnd ?? block.dataset.mdStart);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    return { start, end };
  }

  function getBlockPlainText(block) {
    if (!block) {
      return "";
    }
    if (block.classList.contains("report-heading")) {
      return block.querySelector(".outline-text")?.textContent || "";
    }
    if (block.classList.contains("list-line")) {
      return block.querySelector(".list-body")?.textContent || "";
    }
    return block.textContent || "";
  }

  function replaceLineRange(lines, start, end, nextLines) {
    return [...lines.slice(0, start), ...nextLines, ...lines.slice(end + 1)];
  }

  function buildHeadingLine(level, text) {
    return `${"#".repeat(level)} ${text.trim()}`;
  }

  function buildParagraphLine(text) {
    return text.trim();
  }

  function buildUnorderedListLine(text) {
    return `- ${text.trim()}`;
  }

  function buildOrderedListLine(text, markerText) {
    const marker = String(markerText || "1.").match(/^(\d+)\./)?.[1] || "1";
    return `${marker}. ${text.trim()}`;
  }

  function detectInputRule(block, text) {
    const trimmed = text.trim();
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch && headingMatch[2].length) {
      return {
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2].trim()
      };
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      return { type: "unordered", content: trimmed.replace(/^[-*+]\s+/, "").trim() };
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      return { type: "ordered", content: trimmed.replace(/^\d+\.\s+/, "").trim() };
    }
    return null;
  }

  function serializeBlockMarkdown(block, text) {
    if (block.classList.contains("report-heading")) {
      const level = Number.parseInt(block.tagName.slice(1), 10) || 1;
      return [buildHeadingLine(level, text)];
    }
    if (block.classList.contains("list-line")) {
      if (block.classList.contains("ordered-line")) {
        const marker = block.querySelector(".list-marker")?.textContent || "1.";
        return [buildOrderedListLine(text, marker)];
      }
      return [buildUnorderedListLine(text)];
    }
    if (block.classList.contains("blockquote")) {
      return String(text || "")
        .split("\n")
        .map((line) => `> ${line}`)
        .filter(Boolean);
    }
    if (block.tagName === "PRE") {
      const lines = getLatestDocumentText().split("\n");
      const range = getBlockLineRange(block);
      if (!range) {
        return [buildParagraphLine(text)];
      }
      const original = lines.slice(range.start, range.end + 1);
      const openFence = original[0] || "```";
      const closeFence = original[original.length - 1] || "```";
      const codeText = block.querySelector("code")?.textContent || text;
      return [openFence, ...codeText.split("\n"), closeFence];
    }
    if (block.classList.contains("table-wrap")) {
      return extractTableMarkdown(block);
    }
    return [buildParagraphLine(text)];
  }

  function extractTableMarkdown(block) {
    const rows = [];
    for (const tr of block.querySelectorAll("tr")) {
      const cells = Array.from(tr.children).map((cell) => cell.textContent.trim());
      rows.push(`| ${cells.join(" | ")} |`);
    }
    if (rows.length >= 2) {
      const separator = `| ${Array.from(rows[0].matchAll(/[^|]+/g))
        .slice(1, -1)
        .map(() => "---")
        .join(" | ")} |`;
      rows.splice(1, 0, separator);
    }
    return rows;
  }

  function commitBlockEdit(block, { forceFullText } = {}) {
    const range = getBlockLineRange(block);
    if (!range) {
      return;
    }

    let text = forceFullText ?? getBlockPlainText(block);
    const rule = detectInputRule(block, text);
    if (rule?.type === "heading" && block.classList.contains("report-heading")) {
      const currentLevel = Number.parseInt(block.tagName.slice(1), 10) || 1;
      if (rule.level !== currentLevel) {
        const nextHeading = document.createElement(`h${rule.level}`);
        nextHeading.className = block.className;
        nextHeading.id = block.id;
        nextHeading.dataset.mdStart = block.dataset.mdStart;
        nextHeading.dataset.mdEnd = block.dataset.mdEnd;
        const fold = block.querySelector(".content-fold");
        const textSpan = document.createElement("span");
        textSpan.className = "outline-text";
        textSpan.textContent = rule.content;
        if (fold) {
          nextHeading.appendChild(fold.cloneNode(true));
        }
        nextHeading.appendChild(textSpan);
        block.replaceWith(nextHeading);
        block = nextHeading;
        text = rule.content;
        enableEditable(textSpan);
        scheduleTocUpdate(block);
      } else {
        const textSpan = block.querySelector(".outline-text");
        if (textSpan) {
          textSpan.textContent = rule.content;
        }
        text = rule.content;
        scheduleTocUpdate(block);
      }
    } else if (rule?.type === "heading" && block.tagName === "P") {
      block = convertParagraphToHeading(block, rule.level, rule.content);
      text = rule.content;
      scheduleTocUpdate(block);
    } else if (rule?.type === "unordered" && !block.classList.contains("list-line")) {
      convertBlockToListLine(block, "unordered", rule.content);
      text = rule.content;
    } else if (rule?.type === "ordered" && !block.classList.contains("list-line")) {
      convertBlockToListLine(block, "ordered", rule.content);
      text = rule.content;
    }

    const lines = getLatestDocumentText().split("\n");
    const nextLines = serializeBlockMarkdown(block, text);
    const merged = replaceLineRange(lines, range.start, range.end, nextLines);
    const nextText = merged.join("\n");
    if (nextText === getLatestDocumentText()) {
      return;
    }
    setLatestDocumentText(nextText);
    block.dataset.mdEnd = String(range.start + nextLines.length - 1);
    scheduleSave(nextText);
    scheduleTocUpdate(block);
  }

  function convertParagraphToHeading(block, level, text) {
    const heading = document.createElement(`h${Math.min(Math.max(level, 1), 6)}`);
    if (typeof decorateReportHeading === "function") {
      decorateReportHeading(heading, level);
    } else {
      heading.classList.add("report-heading");
    }
    heading.dataset.mdStart = block.dataset.mdStart;
    heading.dataset.mdEnd = block.dataset.mdEnd;
    const textSpan = document.createElement("span");
    textSpan.className = "outline-text";
    textSpan.textContent = text;
    heading.appendChild(textSpan);
    block.replaceWith(heading);
    enableEditable(textSpan);
    return heading;
  }

  function convertBlockToListLine(block, type, text) {
    const p = document.createElement("p");
    p.className = `list-line ${type === "ordered" ? "ordered-line" : "unordered-line"} md-block md-block-draggable`;
    p.dataset.mdStart = block.dataset.mdStart;
    p.dataset.mdEnd = block.dataset.mdEnd;
    const marker = document.createElement("span");
    marker.className = "list-marker";
    marker.textContent = type === "ordered" ? "1." : "•";
    const body = document.createElement("span");
    body.className = "list-body";
    body.textContent = text;
    p.append(marker, body);
    block.replaceWith(p);
    enableEditable(body);
  }

  function scheduleSave(nextText) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      vscode?.postMessage({ type: "saveContent", content: nextText, persist: false });
    }, 500);
  }

  function scheduleTocUpdate(block) {
    window.clearTimeout(tocUpdateTimer);
    tocUpdateTimer = window.setTimeout(() => updateTocForBlock(block), 120);
  }

  function updateTocForBlock(block) {
    if (!block || typeof toc === "undefined" || !toc) {
      return;
    }
    const anchorId = block.id || block.closest(".content-branch")?.dataset?.anchor;
    if (!anchorId) {
      return;
    }
    const tocLink = Array.from(toc.querySelectorAll("a[data-anchor]")).find(
      (item) => item.dataset.anchor === anchorId
    );
    if (!tocLink) {
      return;
    }
    const nextText = getBlockPlainText(block);
    const textNode = tocLink.querySelector(".outline-text");
    if (textNode) {
      textNode.textContent = nextText;
      return;
    }
    tocLink.textContent = nextText;
  }

  function enableEditable(node) {
    if (!node || node.dataset.wysiwygBound === "1") {
      return;
    }
    node.dataset.wysiwygBound = "1";
    node.setAttribute("contenteditable", "true");
    node.setAttribute("spellcheck", "true");

    node.addEventListener("focus", () => {
      node.dataset.wysiwygInitial = node.textContent || "";
    });

    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        node.blur();
      }
    });

    node.addEventListener("input", () => {
      const block = getEditableBlock(node);
      if (!block) {
        return;
      }
      const text = node.textContent || "";
      const rule = detectInputRule(block, text);
      if (rule) {
        commitBlockEdit(block, { forceFullText: text });
        return;
      }
      if (block.classList.contains("report-heading")) {
        scheduleTocUpdate(block);
      }
    });

    node.addEventListener("blur", () => {
      const block = getEditableBlock(node);
      if (!block) {
        return;
      }
      commitBlockEdit(block, { forceFullText: node.textContent || "" });
    });
  }

  function enableTableEditing() {
    if (!reportContent) {
      return;
    }
    for (const cell of reportContent.querySelectorAll(".markdown-table th, .markdown-table td")) {
      if (cell.dataset.wysiwygBound === "1") {
        continue;
      }
      cell.dataset.wysiwygBound = "1";
      cell.setAttribute("contenteditable", "true");
      cell.addEventListener("blur", () => {
        const wrap = cell.closest(".table-wrap");
        if (wrap) {
          commitBlockEdit(wrap);
        }
      });
    }
  }

  function enableCodeBlockEditing() {
    if (!reportContent) {
      return;
    }
    for (const pre of reportContent.querySelectorAll("pre.md-block")) {
      const code = pre.querySelector("code");
      if (!code || code.dataset.wysiwygBound === "1") {
        continue;
      }
      code.dataset.wysiwygBound = "1";
      code.setAttribute("contenteditable", "true");
      code.addEventListener("blur", () => commitBlockEdit(pre, { forceFullText: code.textContent || "" }));
    }
  }

  function enableBlockquoteEditing() {
    if (!reportContent) {
      return;
    }
    for (const quote of reportContent.querySelectorAll("blockquote.md-block")) {
      if (quote.dataset.wysiwygBound === "1") {
        continue;
      }
      quote.dataset.wysiwygBound = "1";
      quote.setAttribute("contenteditable", "true");
      quote.addEventListener("blur", () => commitBlockEdit(quote, { forceFullText: quote.textContent || "" }));
    }
  }

  function refreshEditableBlocks() {
    if (!isWysiwygEnabled()) {
      for (const node of document.querySelectorAll("[data-wysiwyg-bound='1']")) {
        node.removeAttribute("contenteditable");
      }
      return;
    }
    for (const target of getEditableTargets()) {
      enableEditable(target);
    }
    enableTableEditing();
    enableCodeBlockEditing();
    enableBlockquoteEditing();
  }

  enableWysiwygModeInput?.addEventListener("change", () => {
    applyWysiwygSetting(Boolean(enableWysiwygModeInput.checked));
  });

  loadWysiwygSetting();

  window.MeowWysiwyg = {
    refresh: refreshEditableBlocks,
    isEnabled: isWysiwygEnabled
  };
})();
