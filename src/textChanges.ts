import { diffChars } from "diff";

export type TextChange = { from: number; to: number; insert: string };
export type TextPoint = { line: number; character: number };
export type WireChange = { from: TextPoint; to: TextPoint; insert: string; expected: string };
export const normalizeText = (text: string): string => text.replace(/\r\n/g, "\n");

export function diffText(before: string, after: string): TextChange[] {
  const edits: TextChange[] = [];
  let offset = 0;
  for (const part of diffChars(before, after)) {
    if (!part.added && !part.removed) { offset += part.value.length; continue; }
    let edit = edits.at(-1);
    if (!edit || edit.to !== offset) { edit = { from: offset, to: offset, insert: "" }; edits.push(edit); }
    if (part.removed) { offset += part.value.length; edit.to = offset; }
    else edit.insert += part.value;
  }
  return edits;
}

export function applyChanges(text: string, changes: readonly TextChange[]): string {
  let end = 0, result = "";
  for (const change of changes) {
    if (!Number.isSafeInteger(change.from) || !Number.isSafeInteger(change.to) || change.from < end || change.to < change.from || change.to > text.length) throw new Error("无效的文本范围");
    result += text.slice(end, change.from) + change.insert;
    end = change.to;
  }
  return result + text.slice(end);
}

export function pointAt(text: string, offset: number): TextPoint {
  const prefix = text.slice(0, offset);
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 };
}
export function offsetAt(text: string, point: TextPoint): number {
  if (!point || !Number.isSafeInteger(point.line) || !Number.isSafeInteger(point.character) || point.line < 0 || point.character < 0) throw new Error("无效的文本位置");
  const lines = text.split("\n");
  if (point.line >= lines.length || point.character > lines[point.line].length) throw new Error("文本位置已过期");
  let offset = point.character;
  for (let i = 0; i < point.line; i++) offset += lines[i].length + 1;
  return offset;
}
export function toWire(text: string, changes: readonly TextChange[]): WireChange[] {
  return changes.map(c => ({ from: pointAt(text, c.from), to: pointAt(text, c.to), insert: c.insert, expected: text.slice(c.from, c.to) }));
}
export function fromWire(text: string, changes: readonly WireChange[]): TextChange[] {
  if (!Array.isArray(changes)) throw new Error("缺少文本变更");
  return changes.map(c => {
    const from = offsetAt(text, c.from), to = offsetAt(text, c.to);
    if (typeof c.insert !== "string" || text.slice(from, to) !== c.expected) throw new Error("文本内容已变化");
    return { from, to, insert: normalizeText(c.insert) };
  });
}

/** Transform disjoint edits. Overlapping edits are never silently resolved. */
export function rebaseChanges(local: readonly TextChange[], remote: readonly TextChange[]): TextChange[] {
  return local.map(l => {
    let shift = 0;
    for (const r of remote) {
      const overlap = l.from === l.to && r.from === r.to
        ? l.from === r.from
        : l.from === l.to ? l.from > r.from && l.from < r.to
        : r.from === r.to ? r.from > l.from && r.from < l.to
        : l.from < r.to && r.from < l.to;
      if (overlap) throw new Error("外部修改与尚未同步的输入重叠");
      if (r.to <= l.from) shift += r.insert.length - (r.to - r.from);
    }
    return { from: l.from + shift, to: l.to + shift, insert: l.insert };
  });
}
