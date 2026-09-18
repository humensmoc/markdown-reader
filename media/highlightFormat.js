/* Shared Markdown source mapping for the extension host and reader. */
(function (factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./readerMath.js") : globalThis.ReaderMath);
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.ReaderHighlightFormat = api;
})((math) => {
  // Shared with the renderer: only structural pipes divide table cells.
  function tableCells(line) {
    const protectedMath = math?.protect(line);
    const spans = mathSpans(line, protectedMath), cuts = [];
    for (let i = 0; i < line.length;) {
      if (spans.has(i)) { i += spans.get(i); continue; }
      if (line[i] === "\\") { i += 2; continue; }
      const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(line.slice(i));
      if (code) { i += code[0].length; continue; }
      if (line[i] === "|") cuts.push(i);
      i++;
    }
    const boundaries = [-1, ...cuts, line.length], cells = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      let start = boundaries[i] + 1, end = boundaries[i + 1];
      while (start < end && /\s/.test(line[start])) start++;
      while (end > start && /\s/.test(line[end - 1])) end--;
      if ((i === 0 || i === boundaries.length - 2) && start === end && cuts.length) continue;
      cells.push({ start, end, text: line.slice(start, end) });
    }
    return cells;
  }
  function mathSpans(value, protectedMath = math?.protect(value)) {
    const spans = new Map();
    let delta = 0;
    for (const item of protectedMath?.items || []) {
      const start = protectedMath.text.indexOf(item.marker) + delta;
      spans.set(start, item.raw.length);
      delta += item.raw.length - item.marker.length;
    }
    return spans;
  }
  function readLink(value) {
    if (!value.startsWith("[")) return null;
    let depth = 1, end = 1;
    for (; end < value.length && depth; end++) {
      if (value[end] === "\\") { end++; continue; }
      if (value[end] === "[") depth++;
      if (value[end] === "]") depth--;
    }
    if (depth || value[end] !== "(") return null;
    const labelEnd = end - 1, hrefStart = ++end;
    depth = 1;
    for (; end < value.length && depth; end++) {
      if (value[end] === "\\") { end++; continue; }
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    return depth ? null : { raw: value.slice(0, end), label: value.slice(1, labelEnd), href: value.slice(hrefStart, end - 1) };
  }
  function parse(content) {
    const chars = [], points = [], ends = [], regionsAt = [], regions = [], wrappers = [], marks = [], definitions = [], opaqueRanges = [];
    const lines = content.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
    const sourceLines = lines.map((l) => l.replace(/\r?\n$/, ""));
    let offset = 0, fence = null, hidden = false, annotation = false, frontmatter = false, region = -1;
    function emit(value, at, sourceStart = at, sourceEnd) {
      for (let i = 0; i < value.length; i++) {
        const char = /\s/.test(value[i]) ? " " : value[i];
        if (char === " " && chars.at(-1) === " ") {
          if (regionsAt.at(-1) === region && ends.at(-1) === at + i) ends[ends.length - 1] = at + i + 1;
          continue;
        }
        chars.push(char); points.push(sourceStart + i); ends.push(sourceEnd ?? at + i + 1); regionsAt.push(region);
      }
    }
    function inline(value, base) {
      let i = 0;
      const formulas = mathSpans(value);
      while (i < value.length) {
        const rest = value.slice(i);
        if (formulas.has(i)) {
          opaqueRanges.push({ start: base + i, end: base + i + formulas.get(i) });
          i += formulas.get(i); continue;
        }
        const escape = /^\\([\\`*{}\[\]()#+.!_>=~|\-])/.exec(rest);
        if (escape) { emit(escape[1], base + i + 1, base + i, base + i + escape[0].length); i += escape[0].length; continue; }
        const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
        if (code) {
          const start = base + i, inside = start + code[1].length;
          wrappers.push({ start, end: start + code[0].length, inside, insideEnd: inside + code[2].length, code: true, kind: "code" });
          emit(code[2], inside); i += code[0].length; continue;
        }
        const ref = /^\[\^[^\]]+\]/.exec(rest);
        if (ref) { i += ref[0].length; continue; }
        const link = readLink(rest);
        if (link) {
          const start = base + i, inside = start + 1;
          wrappers.push({ start, end: start + link.raw.length, inside, insideEnd: inside + link.label.length, kind: "link", href: link.href });
          inline(link.label, inside); i += link.raw.length; continue;
        }
        const pair = /^(==|\*\*|~~|\*)(?=\S)(.+?)\1/.exec(rest);
        if (pair && !pair[2].endsWith(" ")) {
          const start = base + i, inside = start + pair[1].length, end = start + pair[0].length;
          const wrapper = { start, end, inside, insideEnd: end - pair[1].length, highlight: pair[1] === "==",
            kind: { "==": "mark", "**": "strong", "*": "em", "~~": "del" }[pair[1]] };
          wrappers.push(wrapper);
          if (wrapper.highlight) marks.push({ start, end, inside, insideEnd: wrapper.insideEnd, markdown: pair[2] });
          inline(pair[2], inside); i += pair[0].length; continue;
        }
        // HTML/image constructs need a dedicated source map; don't guess inside them.
        const opaque = /^(?:<[^>]*>|!\[[^\]]*\]\([^)]*\)|\[cite:[^\]]*\])/.exec(rest);
        if (opaque) { opaqueRanges.push({ start: base + i, end: base + i + opaque[0].length }); i += opaque[0].length; continue; }
        emit(rest[0], base + i); i++;
      }
    }
    for (let n = 0; n < lines.length; n++) {
      const full = lines[n], line = full.replace(/\r?\n$/, ""), start = offset;
      offset += full.length;
      if (n === 0 && /^\uFEFF?---\s*$/.test(line) && lines.slice(1).some((l) => /^(---|\.\.\.)\s*$/.test(l))) { frontmatter = true; continue; }
      if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; continue; }
      const delimiter = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (delimiter) {
        if (!fence) fence = { char: delimiter[2][0], length: delimiter[2].length };
        else if (delimiter[2][0] === fence.char && delimiter[2].length >= fence.length && !delimiter[3].trim()) fence = null;
        continue;
      }
      if (fence) continue;
      const formula = math?.readBlock(sourceLines, n);
      if (formula) {
        while (n < formula.endLine) offset += lines[++n].length;
        continue;
      }
      if (/^\s*<!--\s*mr-annotation:start/.test(line)) annotation = true;
      if (annotation) { if (/mr-annotation:end/.test(line)) annotation = false; continue; }
      if (hidden || /^\s*<!--/.test(line)) { hidden = !line.includes("-->"); continue; }
      const definition = /^\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(line);
      if (definition) {
        const body = [definition[2]];
        while (n + 1 < lines.length && /^( {4}|\t)/.test(lines[n + 1])) {
          n++; body.push(lines[n].replace(/\r?\n$/, "").replace(/^( {4}|\t)/, "")); offset += lines[n].length;
        }
        definitions.push({ id: definition[1], key: definition[1].toLowerCase(), start, end: offset, comment: body.join("\n") });
        continue;
      }
      if (/^\s*\|?[\s:|-]+\|\s*$/.test(line)) continue;
      const prefix = /^(?:\s*>\s*)*(?: {0,3}#{1,6}\s+|\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/.exec(line)[0];
      const isTable = line.trim().startsWith("|") && line.trim().endsWith("|");
      const cells = isTable ? tableCells(line) : [{ start: prefix.length, end: line.length, text: line.slice(prefix.length) }];
      cells.forEach((cell, cellIndex) => {
        region = -1;
        if (chars.length && chars.at(-1) !== " ") emit(" ", start + cell.start);
        region = regions.length;
        const item = { line: n, cellIndex: isTable ? cellIndex : undefined, textStart: chars.length, start: start + cell.start, end: start + cell.end };
        regions.push(item);
        const taskPrefix = isTable ? /^(?:[-*+]\s+)?\[[ xX]\]\s+/.exec(cell.text)?.[0] || "" : "";
        inline(cell.text.slice(taskPrefix.length), start + cell.start + taskPrefix.length);
        item.textEnd = chars.length;
      });
    }
    for (const mark of marks) {
      const ref = /^([。！？.!?，,;；:：]?[ \t]*)\[\^([^\]]+)\]/.exec(content.slice(mark.end));
      if (ref) {
        mark.refStart = mark.end + ref[1].length;
        mark.refEnd = mark.end + ref[0].length;
        mark.footnoteId = ref[2];
        const defs = definitions.filter((d) => d.key === ref[2].toLowerCase());
        if (defs.length === 1) mark.definition = defs[0];
      }
      mark.comment = mark.definition?.comment || "";
    }
    return { text: chars.join(""), points, ends, regionsAt, regions, wrappers, marks, definitions, opaqueRanges, unclosedFence: Boolean(fence) };
  }
  function findSelection(content, selection, data) {
    const exact = selection.exact.replace(/\s+/g, " ").trim();
    if (typeof selection.blockText === "string") {
      const regions = data.regions.filter((r) => r.line >= selection.lineStart && r.line <= selection.lineEnd &&
        (selection.cellIndex === undefined || r.cellIndex === selection.cellIndex));
      if (!regions.length) throw Error("无法定位选中的段落或单元格，请重新选择。");
      const first = regions[0].textStart, last = regions.at(-1).textEnd;
      const scoped = data.text.slice(first, last), block = selection.blockText;
      const at = scoped.indexOf(block);
      if (at < 0 || scoped.indexOf(block, at + 1) >= 0 ||
          block.slice(selection.textStart, selection.textEnd) !== exact) throw Error("无法唯一定位选文，请缩小选区后重试。");
      return { first: first + at + selection.textStart, last: first + at + selection.textEnd };
    }
    const candidates = [];
    const lines = content.split(/\r?\n/);
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const lineOffset = (n) => lines.slice(0, n).reduce((sum, line) => sum + line.length + eol.length, 0);
    const lo = Number.isInteger(selection.lineStart) ? lineOffset(selection.lineStart) : 0;
    const hi = Number.isInteger(selection.lineEnd) ? lineOffset(selection.lineEnd + 1) : content.length;
    for (let i = data.text.indexOf(exact); i >= 0; i = data.text.indexOf(exact, i + 1)) {
      if (data.points[i] >= lo && data.points[i + exact.length - 1] < hi) candidates.push(i);
    }
    const matches = candidates.length === 1 ? candidates : candidates.filter((i) =>
      (!selection.prefix || data.text.slice(Math.max(0, i - selection.prefix.length), i) === selection.prefix) &&
      (!selection.suffix || data.text.slice(i + exact.length, i + exact.length + selection.suffix.length) === selection.suffix));
    if (matches.length !== 1) throw Error("无法唯一定位选文，请缩小选区后重试。");
    return { first: matches[0], last: matches[0] + exact.length };
  }
  function resolve(content, selection, data = parse(content)) {
    const { first, last } = findSelection(content, selection, data);
    const selectedStart = data.points[first], selectedEnd = data.ends[last - 1];
    const blocked = [...data.marks, ...data.opaqueRanges];
    for (const code of data.wrappers.filter((w) => w.code)) {
      if (selectedStart > code.inside || selectedEnd < code.insideEnd) blocked.push(code);
    }
    let atoms = [];
    for (let i = first; i < last; i++) {
      const start = data.points[i], end = data.ends[i];
      if (data.regionsAt[i] < 0 || blocked.some((w) => start < w.end && end > w.start)) continue;
      atoms.push({ start, end, region: data.regionsAt[i] });
    }
    // A wholly selected format wrapper can be enclosed; partial wrappers stay intact
    // and their selected text is marked inside them instead.
    for (const w of [...data.wrappers].sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
      if (blocked.some((b) => w.start < b.end && w.end > b.start)) continue;
      const enclosed = atoms.filter((a) => a.start >= w.inside && a.end <= w.insideEnd).sort((a, b) => a.start - b.start);
      if (enclosed[0]?.start === w.inside && enclosed.at(-1)?.end === w.insideEnd) {
        const atom = { start: w.start, end: w.end, region: enclosed[0].region };
        atoms = atoms.filter((a) => a.start < w.inside || a.end > w.insideEnd);
        atoms.push(atom);
      }
    }
    const ranges = [];
    for (const atom of atoms.sort((a, b) => a.start - b.start)) {
      const previous = ranges.at(-1);
      if (previous && previous.region === atom.region && /^[ \t]*$/.test(content.slice(previous.end, atom.start))) previous.end = atom.end;
      else ranges.push({ ...atom });
    }
    return ranges.map(({ start, end }) => {
      while (start < end && /\s/.test(content[start])) start++;
      while (end > start && /\s/.test(content[end - 1])) end--;
      return { start, end };
    }).filter((r) => r.start < r.end);
  }
  function applyEdits(content, edits) {
    for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    return content;
  }
  function commentDefinition(id, comment, eol) {
    const parts = comment.trim().split(/\r?\n/);
    return `[^${id}]: ${parts[0]}` + parts.slice(1).map((line) => eol + "    " + line).join("");
  }
  function update(content, message) {
    if (message.expectedDocument !== content) throw Error("文档已变化，请关闭编辑框后重新选择或打开高亮。");
    const mark = message.highlight, data = parse(content), edits = [];
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const existing = Number.isInteger(mark.nativeStart) ? data.marks.find((m) => m.start === mark.nativeStart) : null;
    if (Number.isInteger(mark.nativeStart) && !existing) throw Error("这条高亮已不存在。");
    if (message.type === "deleteReadingHighlight" && !existing) throw Error("这条高亮已不存在。");
    if (!existing) {
      const locations = (mark.segments || [mark]).flatMap((segment) => resolve(content, segment, data));
      const unique = [...new Map(locations.map((r) => [`${r.start}:${r.end}`, r])).values()].sort((a, b) => a.start - b.start);
      if (unique.some((r, i) => i && r.start < unique[i - 1].end)) throw Error("选区范围重叠，请重新选择。");
      if (!unique.length) return content;
      let reference = "", definition = "";
      if (mark.comment.trim()) {
        if (data.unclosedFence) throw Error("文档末尾的代码块尚未关闭，请先补齐代码围栏。");
        let id = `${unique.length > 1 ? "mark-group-" : "mark-"}${mark.id}`, suffix = 1;
        while (content.includes(`[^${id}]`)) id += `-${suffix++}`;
        reference = `[^${id}]`;
        definition = commentDefinition(id, mark.comment, eol);
      }
      for (const r of unique) {
        if (content.slice(r.start, r.end).includes("==")) throw Error("选区包含高亮分隔符，请调整选区。");
        edits.push({ ...r, text: `==${content.slice(r.start, r.end)}==${reference}` });
      }
      content = applyEdits(content, edits);
      if (definition) content += (content.endsWith("\n") ? eol : eol + eol) + definition + eol;
      return content;
    }
    // Group identity is the shared footnote reference, so it survives reloads and
    // external Markdown edits. Deleting a highlight only removes that fragment.
    if (existing.footnoteId?.startsWith("mark-group-") && existing.definition && message.type !== "deleteReadingHighlight") {
      const siblings = data.marks.filter((m) => m.footnoteId === existing.footnoteId);
      if (!mark.comment.trim()) {
        for (const sibling of siblings) edits.push({ start: sibling.refStart, end: sibling.refEnd, text: "" });
        const usages = content.split(`[^${existing.footnoteId}]`).length - 1;
        if (usages === siblings.length + 1) edits.push({ start: existing.definition.start, end: existing.definition.end, text: "" });
      } else edits.push({ start: existing.definition.start, end: existing.definition.end,
        text: commentDefinition(existing.footnoteId, mark.comment, eol) + eol });
      return applyEdits(content, edits);
    }
    const location = existing;
    const body = existing ? content.slice(existing.inside, existing.insideEnd) : content.slice(location.start, location.end);
    let reference = "", definition = "";
    if (existing?.footnoteId) {
      const token = `[^${existing.footnoteId}]`;
      const usages = content.split(token).length - 1 - data.definitions.filter((d) => d.id === existing.footnoteId).length;
      if (existing.definition && usages === 1) edits.push({ start: existing.definition.start, end: existing.definition.end, text: "" });
      edits.push({ start: existing.refStart, end: existing.refEnd, text: "" });
    }
    if (message.type !== "deleteReadingHighlight" && mark.comment.trim()) {
      if (data.unclosedFence) throw Error("文档末尾的代码块尚未关闭，请先补齐代码围栏。");
      let id = `mark-${mark.id}`, suffix = 1;
      while (content.includes(`[^${id}]`)) id = `mark-${mark.id}-${suffix++}`;
      reference = `[^${id}]`;
      const parts = mark.comment.trim().split(/\r?\n/);
      definition = `[^${id}]: ${parts[0]}` + parts.slice(1).map((line) => eol + "    " + line).join("");
    }
    edits.push({ start: location.start, end: location.end, text: message.type === "deleteReadingHighlight" ? body : `==${body}==${reference}` });
    content = applyEdits(content, edits);
    if (definition) content += (content.endsWith("\n") ? eol : eol + eol) + definition + eol;
    return content;
  }
  return { parse, resolve, update, tableCells };
});
