/* Shared Markdown source mapping for the extension host and reader. */
(function (factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else window.ReaderHighlightFormat = api;
})(() => {
  function parse(content) {
    const chars = [], points = [], wrappers = [], marks = [], definitions = [];
    const lines = content.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
    let offset = 0, fence = null, hidden = false, annotation = false, frontmatter = false;
    function emit(value, at) {
      for (let i = 0; i < value.length; i++) {
        const char = /\s/.test(value[i]) ? " " : value[i];
        if (char === " " && chars.at(-1) === " ") continue;
        chars.push(char); points.push(at + i);
      }
    }
    function inline(value, base) {
      let i = 0;
      while (i < value.length) {
        const rest = value.slice(i);
        const escape = /^\\([\\`*{}\[\]()#+.!_>=~|\-])/.exec(rest);
        if (escape) { emit(escape[1], base + i + 1); i += escape[0].length; continue; }
        const code = /^(`+)([\s\S]*?)\1(?!`)/.exec(rest);
        if (code) {
          const start = base + i, inside = start + code[1].length;
          wrappers.push({ start, end: start + code[0].length, inside, insideEnd: inside + code[2].length, code: true });
          emit(code[2], inside); i += code[0].length; continue;
        }
        const ref = /^\[\^[^\]]+\]/.exec(rest);
        if (ref) { i += ref[0].length; continue; }
        const link = /^\[([^\]\n]+)\]\(([^\n]*?)\)/.exec(rest);
        if (link) {
          const start = base + i, inside = start + 1;
          wrappers.push({ start, end: start + link[0].length, inside, insideEnd: inside + link[1].length });
          inline(link[1], inside); i += link[0].length; continue;
        }
        const pair = /^(==|\*\*|~~|\*)(?=\S)(.+?)\1/.exec(rest);
        if (pair && !pair[2].endsWith(" ")) {
          const start = base + i, inside = start + pair[1].length, end = start + pair[0].length;
          const wrapper = { start, end, inside, insideEnd: end - pair[1].length, highlight: pair[1] === "==" };
          wrappers.push(wrapper);
          if (wrapper.highlight) marks.push({ start, end, inside, insideEnd: wrapper.insideEnd, markdown: pair[2] });
          inline(pair[2], inside); i += pair[0].length; continue;
        }
        // HTML/image constructs need a dedicated source map; don't guess inside them.
        const opaque = /^(?:<[^>]*>|!\[[^\]]*\]\([^)]*\)|\[cite:[^\]]*\])/.exec(rest);
        if (opaque) { i += opaque[0].length; continue; }
        emit(rest[0] === "|" ? " " : rest[0], base + i); i++;
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
      if (/^\s*\|?[\s:|-]+\|\s*$/.test(line) || /^( {4}|\t)/.test(line)) continue;
      const prefix = /^(?:\s*>\s*)*(?: {0,3}#{1,6}\s+|\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/.exec(line)[0];
      if (chars.length && chars.at(-1) !== " ") emit(" ", start);
      inline(line.slice(prefix.length), start + prefix.length);
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
    return { text: chars.join(""), points, wrappers, marks, definitions, unclosedFence: Boolean(fence) };
  }
  function resolve(content, selection) {
    const data = parse(content), exact = selection.exact.replace(/\s+/g, " ").trim();
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
    let start = data.points[matches[0]], end = data.points[matches[0] + exact.length - 1] + 1;
    if (data.marks.some((m) => start < m.end && end > m.start)) throw Error("选区包含已有高亮，请点击原高亮编辑，或重新选择未高亮的文字。");
    for (const w of [...data.wrappers].sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
      if (start >= w.inside && end <= w.insideEnd) {
        if (start === w.inside && end === w.insideEnd) { start = w.start; end = w.end; }
        else if (w.code) throw Error("请选中完整的行内代码，或选择普通正文。");
      } else if (start < w.end && end > w.start && !(start <= w.start && end >= w.end)) {
        throw Error("选区跨越了部分格式边界，请选中完整的加粗或链接内容。");
      }
    }
    if (/\r?\n/.test(content.slice(start, end))) throw Error("请在同一段的一行内选择文字；跨段高亮需要分别标记。");
    if (content.slice(start, end).includes("==")) throw Error("选区包含高亮分隔符，请调整选区。");
    return { start, end };
  }
  function update(content, message) {
    if (message.expectedDocument !== content) throw Error("文档已变化，请关闭编辑框后重新选择或打开高亮。");
    const mark = message.highlight, data = parse(content), edits = [];
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const existing = Number.isInteger(mark.nativeStart) ? data.marks.find((m) => m.start === mark.nativeStart) : null;
    if (Number.isInteger(mark.nativeStart) && !existing) throw Error("这条高亮已不存在。");
    if (message.type === "deleteReadingHighlight" && !existing) throw Error("这条高亮已不存在。");
    const location = existing || resolve(content, mark);
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
    for (const edit of edits.sort((a, b) => b.start - a.start)) content = content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    if (definition) content += (content.endsWith("\n") ? eol : eol + eol) + definition + eol;
    return content;
  }
  return { parse, resolve, update };
});
