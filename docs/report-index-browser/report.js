const gameTitle = document.getElementById("gameTitle");
const gameMeta = document.getElementById("gameMeta");
const themeBtn = document.getElementById("themeBtn");
const steamLink = document.getElementById("steamLink");
const toc = document.getElementById("toc");
const reportContent = document.getElementById("reportContent");
let activeCitation = null;
let citeRefSerial = 0;
let citeFlashEndTimer = null;
let citeScrollMonitorFrame = null;

initTheme();
loadReport();
document.addEventListener("click", handleReportClick);
themeBtn.addEventListener("click", () => toggleTheme());

function initTheme() {
  const saved = localStorage.getItem("reportIndexBrowserTheme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  setTheme(saved || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  themeBtn.classList.toggle("active", isDark);
  themeBtn.setAttribute("aria-pressed", String(isDark));
  themeBtn.textContent = isDark ? "日间" : "夜间";
  localStorage.setItem("reportIndexBrowserTheme", isDark ? "dark" : "light");
}

async function loadReport() {
  const appid = new URLSearchParams(window.location.search).get("appid");
  if (!appid) {
    renderError("URL 缺少 appid。");
    return;
  }
  try {
    const res = await fetch(`/api/report?appid=${encodeURIComponent(appid)}`);
    const payload = await res.json();
    if (!res.ok || payload.ok === false) throw new Error(payload.message || `HTTP ${res.status}`);
    renderReport(payload);
  } catch (err) {
    renderError(`读取报告失败：${err.message}`);
  }
}

function renderReport(payload) {
  const game = payload.game;
  gameTitle.textContent = `${game.rank}. ${game.name}`;
  gameMeta.textContent = `${game.appid} · ${payload.reportDir} · ${payload.files.length} report files`;
  steamLink.href = `https://store.steampowered.com/app/${game.appid}/`;
  document.title = `${game.name} Reports`;

  toc.innerHTML = "";
  reportContent.innerHTML = "";
  activeCitation = null;
  citeRefSerial = 0;

  if (!payload.files.length) {
    renderError("这个 report_dir 下没有 md 报告文件。");
    return;
  }

  const tocInner = document.createElement("div");
  tocInner.className = "toc-inner";
  const collapse = document.createElement("a");
  collapse.href = "../report_retrieval_layered_method.md";
  collapse.className = "toc-back";
  collapse.textContent = "Report Index";
  tocInner.appendChild(collapse);

  const numberedFiles = payload.files.map((file, index) => withOutlineNumbers(file, index + 1));
  for (const file of numberedFiles) {
    tocInner.appendChild(createFileToc(file));
    reportContent.appendChild(renderFile(file));
  }
  toc.appendChild(tocInner);
}

function createFileToc(file) {
  const section = document.createElement("section");
  section.className = "toc-file";
  const fileLink = document.createElement("a");
  fileLink.className = "toc-file-title";
  fileLink.href = `#file-${slugify(file.name)}`;
  fileLink.textContent = formatOutlineLabel(file.outlineNumber, file.label);
  section.appendChild(fileLink);

  for (const heading of file.numberedHeadings) {
    const link = document.createElement("a");
    link.className = `toc-heading level-${Math.min(heading.level, 4)}`;
    link.href = `#${heading.anchor}`;
    link.textContent = formatOutlineLabel(heading.outlineNumber, heading.cleanText);
    section.appendChild(link);
  }
  return section;
}

function renderFile(file) {
  const section = document.createElement("section");
  section.className = "report-file";
  section.id = `file-${slugify(file.name)}`;
  const title = document.createElement("h1");
  title.textContent = formatOutlineLabel(file.outlineNumber, file.label);
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
      outlineNumber,
    };
  });
  return {
    ...file,
    outlineNumber: String(fileNumber),
    numberedHeadings,
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
  let sourceMode = false;

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
    if (isSourceHeading(line)) {
      flushParagraph();
      flushTable();
      const sourceTitle = document.createElement("p");
      sourceTitle.className = "sources-title";
      appendInlineMarkdown(sourceTitle, line.replace(/^\*\*|\*\*$/g, ""), context);
      fragment.appendChild(sourceTitle);
      sourceMode = true;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushTable();
      sourceMode = false;
      const level = Math.min(heading[1].length + 1, 6);
      const h = document.createElement(`h${level}`);
      const numberedHeading = file.numberedHeadings?.[headingIndex];
      const rawText = heading[2].replace(/\s+#*$/, "").trim();
      const cleanText = numberedHeading?.cleanText || stripOutlinePrefix(rawText);
      const outlineNumber = numberedHeading?.outlineNumber;
      h.textContent = outlineNumber ? formatOutlineLabel(outlineNumber, cleanText) : cleanText;
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
      const item = document.createElement(sourceMode && ordered ? "div" : "p");
      item.className = `list-line ${ordered ? "ordered-line" : "unordered-line"}`;
      const marker = document.createElement("span");
      marker.className = "list-marker";
      marker.textContent = ordered ? `${ordered[1]}.` : "•";
      const body = document.createElement("span");
      body.className = "list-body";
      appendInlineMarkdown(body, ordered ? ordered[2].trim() : unordered[1].trim(), context);
      item.append(marker, body);
      if (sourceMode && ordered) {
        item.classList.add("source-line");
        item.id = makeSourceId(context.fileKey, ordered[1]);
        item.dataset.sourceNumber = ordered[1];
      }
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

function isSourceHeading(line) {
  return /^\s*(?:\*\*)?Sources:?(?:\*\*)?\s*$/i.test(String(line || "").trim());
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
    const linkStart = value.indexOf("[", cursor);
    if (linkStart === -1) {
      appendInlineText(fragment, value.slice(cursor));
      break;
    }
    appendInlineText(fragment, value.slice(cursor, linkStart));

    const cite = /^\[cite:\s*([0-9,\s-]+)\]/i.exec(value.slice(linkStart));
    if (cite) {
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
      link.target = "_blank";
      link.rel = "noopener noreferrer";
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
      link.target = "_blank";
      link.rel = "noopener noreferrer";
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

  group.appendChild(document.createTextNode("[cite: "));
  numbers.forEach((number, index) => {
    const ref = document.createElement("button");
    ref.type = "button";
    ref.className = "cite-ref";
    ref.textContent = number;
    ref.id = `cite-ref-${citeRefSerial}`;
    ref.dataset.sourceTarget = makeSourceId(context.fileKey || "report", number);
    citeRefSerial += 1;
    group.appendChild(ref);
    if (index < numbers.length - 1) group.appendChild(document.createTextNode(", "));
  });
  group.appendChild(document.createTextNode("]"));
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
    if (citeRef) returnToCitation(citeRef);
    clearActiveCitation();
  }
}

function activateCitation(cite) {
  const source = document.getElementById(cite.dataset.sourceTarget);
  if (!source) return;
  clearCitationFlash();
  clearActiveCitation();

  activeCitation = {
    citeId: cite.id,
    sourceId: source.id,
  };
  cite.classList.add("cite-active");
  source.classList.add("source-highlight");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "source-return";
  button.textContent = "返回原文";
  button.title = "返回引用位置并清除高亮";
  button.dataset.returnTarget = cite.id;
  source.appendChild(button);
  source.scrollIntoView({ block: "center", behavior: "smooth" });
}

function clearActiveCitation() {
  activeCitation = null;
  document.querySelectorAll(".cite-active").forEach((node) => node.classList.remove("cite-active"));
  document.querySelectorAll(".source-highlight").forEach((node) => node.classList.remove("source-highlight"));
  document.querySelectorAll(".source-return").forEach((node) => node.remove());
}

function returnToCitation(citeRef) {
  clearCitationFlash();
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
  citeRef.scrollIntoView({ block: "center", behavior: "smooth" });

  const startTime = performance.now();
  const monitorArrival = () => {
    if (!document.body.contains(citeRef)) {
      citeScrollMonitorFrame = null;
      return;
    }
    const rect = citeRef.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const citeCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;
    const arrived = Math.abs(citeCenter - viewportCenter) < 8;
    const timedOut = performance.now() - startTime > 3500;

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
  try {
    const url = new URL(href, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch (err) {
    return false;
  }
}

function renderError(message) {
  gameTitle.textContent = "Report Viewer";
  gameMeta.textContent = message;
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
