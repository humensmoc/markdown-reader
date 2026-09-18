export type HighlightSelection = {
  exact: string;
  prefix: string;
  suffix: string;
  lineStart?: number;
  lineEnd?: number;
  cellIndex?: number;
  blockText?: string;
  textStart?: number;
  textEnd?: number;
};

export type ReadingHighlight = HighlightSelection & {
  id: string;
  occurrences: number;
  color: string;
  comment: string;
  nativeStart?: number;
  segments?: HighlightSelection[];
};

export type HighlightMessage = {
  type: "saveReadingHighlight" | "deleteReadingHighlight";
  highlight: ReadingHighlight;
  expected?: string;
  expectedDocument?: string;
};

function validate(value: ReadingHighlight): void {
  if (!value || !/^[a-zA-Z0-9-]{1,100}$/.test(value.id) ||
      typeof value.exact !== "string" || !value.exact.trim() || value.exact.length > 100000 ||
      typeof value.comment !== "string" || value.comment.length > 100000 ||
      typeof value.prefix !== "string" || value.prefix.length > 128 ||
      typeof value.suffix !== "string" || value.suffix.length > 128 ||
      !Number.isSafeInteger(value.occurrences) || value.occurrences < 1 ||
      !["yellow", "green", "blue", "pink", "purple"].includes(value.color)) {
    throw new Error("高亮数据无效，请重新选择文字。");
  }
  if (value.segments !== undefined) {
    if (!Array.isArray(value.segments) || !value.segments.length || value.segments.length > 10000 ||
        value.segments.some((s) => !s || typeof s.exact !== "string" || !s.exact.trim() ||
          typeof s.prefix !== "string" || typeof s.suffix !== "string" ||
          typeof s.blockText !== "string" || s.blockText.length > 1000000 ||
          !Number.isSafeInteger(s.lineStart) || s.lineStart! < 0 || !Number.isSafeInteger(s.lineEnd) || s.lineEnd! < s.lineStart! ||
          !Number.isSafeInteger(s.textStart) || !Number.isSafeInteger(s.textEnd) || s.textStart! < 0 ||
          s.textEnd! <= s.textStart! || s.textEnd! > s.blockText.length ||
          (s.cellIndex !== undefined && (!Number.isSafeInteger(s.cellIndex) || s.cellIndex < 0)))) {
      throw new Error("高亮选区数据无效，请重新选择文字。");
    }
  }
}

// One encoded JSON comment per mark: comments never become Markdown or AI instructions.
function updateLegacyHighlight(content: string, message: HighlightMessage): string {
  validate(message.highlight);
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  let fence: { char: string; length: number } | null = null;
  let frontmatter = /^\uFEFF?---\s*$/.test(lines[0]) && lines.slice(1).some((line) => /^(---|\.\.\.)\s*$/.test(line));
  const matches: { index: number; raw: string }[] = [];
  lines.forEach((line, index) => {
    if (frontmatter) {
      if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      return;
    }
    const marker = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[2][0], length: marker[2].length };
      else if (marker[2][0] === fence.char && marker[2].length >= fence.length && !marker[3].trim()) fence = null;
      return;
    }
    if (fence) return;
    const match = /^<!-- mr-highlight (\{.*\}) -->$/.exec(line);
    if (!match) return;
    try {
      if (JSON.parse(match[1]).id === message.highlight.id) matches.push({ index, raw: match[1] });
    } catch { /* Preserve malformed and unknown metadata. */ }
  });
  if (matches.length > 1) throw new Error("高亮 ID 重复，请先检查 Markdown 文件。");
  const existing = matches[0];
  if ((existing?.raw || undefined) !== message.expected) {
    throw new Error("这条高亮已被修改，请关闭编辑框后重新打开。");
  }
  if (message.type === "deleteReadingHighlight") {
    if (!existing) throw new Error("这条高亮已不存在。");
    lines.splice(existing.index, 1);
    return lines.join(eol);
  }
  const encoded = JSON.stringify(message.highlight).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const entry = `<!-- mr-highlight ${encoded} -->`;
  if (existing) {
    lines[existing.index] = entry;
    return lines.join(eol);
  }
  if (fence) throw new Error("文档末尾的代码块尚未关闭，请先补齐代码围栏。");
  return content + (content.endsWith("\n") ? eol : eol + eol) + entry + eol;
}

const highlightFormat = require("../media/highlightFormat.js") as {
  update(content: string, message: HighlightMessage): string;
};

export function updateReadingHighlight(content: string, message: HighlightMessage): string {
  validate(message.highlight);
  if (message.expected) {
    if (message.expectedDocument !== content) throw new Error("文档已变化，请重新打开高亮。");
    const removed = updateLegacyHighlight(content, { ...message, type: "deleteReadingHighlight" });
    if (message.type === "deleteReadingHighlight") return removed;
    return highlightFormat.update(removed, { ...message, expected: undefined, expectedDocument: removed });
  }
  return highlightFormat.update(content, message);
}
