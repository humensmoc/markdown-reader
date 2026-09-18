/* Reading marks stay separate from the AI annotation workflow. */
(() => {
  const colors = { yellow: "黄色", green: "绿色", blue: "蓝色", pink: "粉色", purple: "紫色" };
  let marks = [], ranges = new Map(), pending = null, panel = null, busy = false;
  let hoverTimer, tooltip;
  let sourceDocument = "";
  const root = () => document.querySelector("#reportContent .markdown-body .content-root");
  const editing = () => document.body.matches(".editor-mode, .wysiwyg-mode");
  const unsupported = "pre, .mermaid-block, .reader-math";
  const excluded = `button, input, textarea, select, script, style, ${unsupported}, .outline-number, .list-marker, .footnote-ref, .footnotes, .obsidian-properties, .md-drag-handle, [aria-hidden=true]`;
  let saveNotice = "";

  // Normalized DOM text with character positions; block boundaries count as whitespace.
  function textIndex() {
    const container = root(), points = [], chars = [];
    if (!container) return { text: "", points };
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node, previousBlock;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(excluded)) continue;
      const block = parent.closest("p, li, td, th, pre, h1, h2, h3, h4, h5, h6");
      if (previousBlock && block !== previousBlock && chars.at(-1) !== " ") {
        chars.push(" "); points.push({ node, offset: 0, block: null });
      }
      previousBlock = block;
      for (let offset = 0; offset < node.length; offset++) {
        const char = /\s/.test(node.data[offset]) ? " " : node.data[offset];
        if (char === " " && chars.at(-1) === " ") continue;
        chars.push(char); points.push({ node, offset, block });
      }
    }
    return { text: chars.join(""), points };
  }
  function occurrences(text, exact) {
    const result = [];
    if (!exact) return result;
    for (let at = text.indexOf(exact); at >= 0; at = text.indexOf(exact, at + 1)) result.push(at);
    return result;
  }
  function captureSelection() {
    const selection = window.getSelection();
    if (panel || busy || editing() || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0), container = root();
    if (!container?.contains(range.startContainer) || !container.contains(range.endContainer)) { pending = null; return; }
    const index = textIndex();
    let start = -1, end = -1;
    index.points.forEach((point, i) => {
      if (range.comparePoint(point.node, point.offset) === 0 && !(point.node === range.endContainer && point.offset >= range.endOffset)) {
        if (start < 0) start = i;
        end = i + 1;
      }
    });
    while (start >= 0 && start < end && index.text[start] === " ") start++;
    while (end > start && index.text[end - 1] === " ") end--;
    const skipped = [...container.querySelectorAll(unsupported)].some((el) => range.intersectsNode(el)) ||
      [...container.querySelectorAll("code")].some((el) => {
        if (!range.intersectsNode(el)) return false;
        const whole = document.createRange(); whole.selectNodeContents(el);
        return range.compareBoundaryPoints(Range.START_TO_START, whole) > 0 || range.compareBoundaryPoints(Range.END_TO_END, whole) < 0;
      });
    if (start < 0 || end <= start) { pending = skipped ? { unsupportedOnly: true } : null; return; }
    const exact = index.text.slice(start, end);
    const blocks = new Map();
    index.points.forEach((point, i) => {
      if (!point.block) return;
      if (!blocks.has(point.block)) blocks.set(point.block, { first: i, last: i + 1 });
      else blocks.get(point.block).last = i + 1;
    });
    const segments = [];
    for (const [block, bounds] of blocks) {
      let lo = Math.max(start, bounds.first), hi = Math.min(end, bounds.last);
      while (lo < hi && index.text[lo] === " ") lo++;
      while (hi > lo && index.text[hi - 1] === " ") hi--;
      if (lo >= hi) continue;
      const owner = block.closest("[data-md-start][data-md-end]");
      if (!owner) { pending = null; return; }
      let blockStart = bounds.first, blockEnd = bounds.last;
      while (blockStart < blockEnd && index.text[blockStart] === " ") blockStart++;
      while (blockEnd > blockStart && index.text[blockEnd - 1] === " ") blockEnd--;
      segments.push({ exact: index.text.slice(lo, hi), prefix: "", suffix: "",
        blockText: index.text.slice(blockStart, blockEnd), textStart: lo - blockStart, textEnd: hi - blockStart,
        lineStart: Number(owner.dataset.mdStart), lineEnd: Number(owner.dataset.mdEnd),
        ...(block.matches("td, th") ? { cellIndex: block.cellIndex } : {}) });
    }
    if (!segments.length) { pending = null; return; }
    pending = {
      id: crypto.randomUUID(), exact, segments, skipped,
      prefix: index.text.slice(Math.max(0, start - 48), start),
      suffix: index.text.slice(end, end + 48),
      occurrences: occurrences(index.text, exact).length,
      color: "yellow", comment: "", rect: range.getBoundingClientRect(),
      lineStart: Number((range.startContainer.parentElement.closest("[data-md-start]"))?.dataset.mdStart),
      lineEnd: Number((range.endContainer.parentElement.closest("[data-md-end]"))?.dataset.mdEnd)
    };
  }
  function locate(mark, index) {
    const positions = occurrences(index.text, mark.exact);
    const candidates = positions.length === 1 && mark.occurrences === 1 ? positions : positions.filter((i) =>
      (!mark.prefix || index.text.slice(Math.max(0, i - mark.prefix.length), i) === mark.prefix) &&
      (!mark.suffix || index.text.slice(i + mark.exact.length, i + mark.exact.length + mark.suffix.length) === mark.suffix));
    if (candidates.length !== 1) return null;
    const start = index.points[candidates[0]], end = index.points[candidates[0] + mark.exact.length - 1];
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset + 1);
    return range;
  }
  function render(lines, content) {
    sourceDocument = content;
    pending = null;
    hideTooltip();
    marks = [];
    for (const line of lines || []) {
      const raw = /^<!-- mr-highlight (\{.*\}) -->$/.exec(line)?.[1];
      try {
        const mark = JSON.parse(raw);
        if (typeof mark.id === "string" && typeof mark.exact === "string" && mark.exact && colors[mark.color] &&
            typeof mark.comment === "string" && typeof mark.prefix === "string" && typeof mark.suffix === "string") marks.push({ ...mark, raw });
      } catch { /* Invalid metadata remains in the source file. */ }
    }
    const native = ReaderHighlightFormat.parse(content).marks;
    const elements = [...root()?.querySelectorAll("mark.reading-native-highlight") || []].filter((el) => !el.closest(".footnotes"));
    native.forEach((item, i) => {
      const element = elements[i];
      if (!element) return;
      marks.push({ id: `native-${item.start}`, exact: element.textContent, prefix: "", suffix: "", occurrences: 1,
        color: "yellow", comment: item.comment, nativeStart: item.start, element,
        groupSize: item.footnoteId?.startsWith("mark-group-") ? native.filter((m) => m.footnoteId === item.footnoteId).length : 1 });
    });
    repaint();
  }
  function repaint() {
    ranges.clear();
    if (!CSS.highlights || !window.Highlight) return;
    const index = textIndex();
    if (!editing()) for (const mark of marks) {
      let range;
      if (mark.element) { range = document.createRange(); range.selectNodeContents(mark.element); }
      else range = locate(mark, index);
      if (range) ranges.set(mark.id, range);
    }
    for (const color of Object.keys(colors)) {
      CSS.highlights.set(`reader-${color}`, new Highlight(...marks.filter((m) => m.color === color).map((m) => ranges.get(m.id)).filter(Boolean)));
    }
  }
  function close() {
    if (busy) return;
    panel?.remove(); panel = null; pending = null;
    window.getSelection()?.removeAllRanges();
  }
  function position(element, rect) {
    element.style.left = `${Math.max(8, Math.min(rect?.left || 8, innerWidth - element.offsetWidth - 8))}px`;
    const below = (rect?.bottom || 8) + 8;
    element.style.top = `${Math.max(8, Math.min(below, innerHeight - element.offsetHeight - 8))}px`;
  }
  function save(mark, deleting = false) {
    if (busy) return;
    if (!CSS.highlights || !window.Highlight) { showAnnotationToast("当前编辑器版本不支持划词高亮，请升级 VS Code/Cursor。", true); return; }
    const { raw, rect, element, skipped, groupSize, ...highlight } = mark;
    saveNotice = skipped ? "；已跳过选区中的公式或代码内容" : "";
    busy = true;
    panel?.querySelectorAll("button, textarea").forEach((el) => el.disabled = true);
    hideAnnotationAction();
    vscode?.postMessage({ type: deleting ? "deleteReadingHighlight" : "saveReadingHighlight", highlight, expected: raw, expectedDocument: sourceDocument });

  }
  function quickSave() {
    if (!pending || busy) return;
    if (pending.unsupportedOnly) { showAnnotationToast("选区是公式或代码块，暂不支持高亮。", true); return; }
    save({ ...pending, color: "yellow" });
  }
  function compose(mark = pending) {
    if (!mark || busy || editing()) return;
    if (mark.unsupportedOnly) { showAnnotationToast("选区是公式或代码块，暂不支持高亮。", true); return; }
    const draft = { ...mark, color: "yellow" };
    panel?.remove(); hideTooltip(); hideAnnotationAction();
    panel = document.createElement("div");
    panel.className = "reading-highlight-panel";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "高亮与评论");
    panel.innerHTML = `<div class="reading-highlight-format">高亮 · 评论将保存为脚注</div>
      <blockquote></blockquote><label for="readingHighlightComment">评论（可选）</label>
      <textarea id="readingHighlightComment" rows="3" placeholder="只需高亮可留空；Enter 保存，Shift+Enter 换行"></textarea>
      <div class="reading-highlight-actions"><button type="button" data-action="cancel">取消</button>
      ${mark.raw || Number.isInteger(mark.nativeStart) ? '<button type="button" data-action="delete">删除高亮</button>' : ""}
      <button type="button" data-action="save">保存</button></div>`;
    panel.querySelector("blockquote").textContent = mark.exact;
    if (mark.groupSize > 1) panel.querySelector(".reading-highlight-format").textContent = `这 ${mark.groupSize} 处高亮共享评论；删除只取消当前片段`;
    else if (mark.segments?.length > 1) panel.querySelector(".reading-highlight-format").textContent = "选中文字将分段高亮，共享本次评论";
    const textarea = panel.querySelector("textarea"); textarea.value = mark.comment;
    panel.querySelector('[data-action="cancel"]').onclick = close;
    panel.querySelector('[data-action="save"]').onclick = () => save({ ...draft, comment: textarea.value.trim() });
    const deleteButton = panel.querySelector('[data-action="delete"]');
    if (deleteButton) deleteButton.onclick = () => save(draft, true);
    panel.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.target === textarea && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault(); panel.querySelector('[data-action="save"]').click();
      }
    });
    document.body.appendChild(panel);
    position(panel, mark.rect || ranges.get(mark.id)?.getBoundingClientRect());
    textarea.focus();
  }
  function hit(event) {
    if (!root()?.contains(event.target) || editing()) return [];
    return marks.filter((mark) => Array.from(ranges.get(mark.id)?.getClientRects() || []).some((r) =>
      event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom));
  }
  function hideTooltip() { clearTimeout(hoverTimer); tooltip?.remove(); tooltip = null; }
  document.addEventListener("pointermove", (event) => {
    if (panel || busy || !window.getSelection()?.isCollapsed) return;
    const hits = hit(event);
    hideTooltip();
    if (!hits.length) return;
    hoverTimer = setTimeout(() => {
      tooltip = document.createElement("div"); tooltip.className = "reading-highlight-tooltip";
      tooltip.textContent = hits.map((m) => m.comment || "点击添加或编辑评论").join("\n\n");
      document.body.appendChild(tooltip); position(tooltip, { left: event.clientX, bottom: event.clientY });
    }, 250);
  });
  document.addEventListener("click", (event) => {
    if (panel || busy || !window.getSelection()?.isCollapsed) return;
    const hits = hit(event);
    if (!hits.length) return;
    event.preventDefault(); event.stopPropagation();
    if (hits.length === 1) { compose(hits[0]); return; }
    hideTooltip(); hideAnnotationAction();
    panel = document.createElement("div"); panel.className = "reading-highlight-panel";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "选择重叠高亮");
    const label = document.createElement("strong"); label.textContent = "选择要编辑的高亮"; panel.appendChild(label);
    hits.forEach((mark) => {
      const button = document.createElement("button"); button.textContent = `${mark.comment || mark.exact}`;
      button.onclick = () => compose(mark); panel.appendChild(button);
    });
    const cancel = document.createElement("button"); cancel.textContent = "取消"; cancel.onclick = close; panel.appendChild(cancel);
    document.body.appendChild(panel); position(panel, { left: event.clientX, bottom: event.clientY }); cancel.focus();
  }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && panel && !event.isComposing) close(); });
  document.addEventListener("pointerdown", (event) => {
    if (panel && !panel.contains(event.target) && !event.target.closest(".annotation-action")) close();
  });
  window.addEventListener("message", (event) => {
    if (event.data?.type === "readingHighlightSaved") {
      busy = false; close(); showAnnotationToast((event.data.unchanged ? "没有新增高亮" : "高亮已保存到当前 Markdown") + saveNotice); saveNotice = "";
    } else if (event.data?.type === "readingHighlightError") {
      busy = false;
      panel?.querySelectorAll("button, textarea").forEach((el) => el.disabled = false);
      showAnnotationToast(event.data.message || "高亮保存失败", true);
    }
  });
  window.addEventListener("resize", () => { if (panel) position(panel, panel.getBoundingClientRect()); hideTooltip(); });
  window.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(() => { if (editing()) close(); repaint(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  });
  window.ReaderHighlights = { render, captureSelection, quickSave, compose, isOpen: () => Boolean(panel) || busy };
})();
