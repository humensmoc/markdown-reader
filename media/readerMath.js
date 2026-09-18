(function (root) {
  function escaped(text, index) {
    let count = 0;
    while (index > 0 && text[--index] === "\\") count++;
    return count % 2 === 1;
  }

  function readMath(text, start) {
    if (escaped(text, start)) return null;
    const open = ["$$", "\\[", "\\(", "$"].find((item) => text.startsWith(item, start));
    if (!open || (open === "$" && (text[start - 1] === "$" || /\s/.test(text[start + 1] || " ")))) return null;
    const close = { "$$": "$$", "\\[": "\\]", "\\(": "\\)", "$": "$" }[open];
    let end = start + open.length;
    while ((end = text.indexOf(close, end)) !== -1) {
      if (!escaped(text, end) && (open !== "$" || (!/\s/.test(text[end - 1]) && !/[\d$]/.test(text[end + 1] || "")))) {
        const tex = text.slice(start + open.length, end);
        if (!tex.trim() || (open === "$" && tex.includes("\n"))) return null;
        return { tex, raw: text.slice(start, end + close.length), end: end + close.length, display: open === "$$" || open === "\\[" };
      }
      end += close.length;
    }
    return null;
  }

  // Protect TeX before Markdown interprets brackets, emphasis, HTML or table pipes.
  function protect(value) {
    const text = String(value || "");
    let prefix = "\uE000math";
    while (text.includes(prefix)) prefix += "m";
    const items = [];
    let output = "";
    for (let i = 0; i < text.length;) {
      let end = i;
      if (text[i] === "`" && !escaped(text, i)) {
        const fence = /^`+/.exec(text.slice(i))[0];
        const close = text.indexOf(fence, i + fence.length);
        end = close < 0 ? text.length : close + fence.length;
      } else if (text[i] === "<") {
        const tag = /^(?:<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[A-Za-z][^>]*>|<!--[\s\S]*?-->)/i.exec(text.slice(i));
        if (tag) end = i + tag[0].length;
      } else if (text[i] === "(" && text[i - 1] === "]") {
        let depth = 1;
        end = i + 1;
        while (end < text.length && depth) {
          if (!escaped(text, end)) {
            if (text[end] === "(") depth++;
            if (text[end] === ")") depth--;
          }
          end++;
        }
      } else if (/^https?:\/\//.test(text.slice(i))) {
        end = i + /^\S+/.exec(text.slice(i))[0].length;
      }
      if (end > i) { output += text.slice(i, end); i = end; continue; }
      const math = readMath(text, i);
      if (math) {
        const marker = `${prefix}${items.length}\uE001`;
        items.push({ ...math, marker });
        output += marker;
        i = math.end;
      } else {
        output += text[i++];
      }
    }
    return { text: output, items };
  }

  function restoreText(text, protectedText) {
    for (const item of protectedText.items) text = text.split(item.marker).join(item.raw);
    return text;
  }

  function render(math, block = false) {
    const node = document.createElement(block ? "div" : "span");
    node.className = math.display ? "reader-math reader-math-display" : "reader-math reader-math-inline";
    node.dataset.mathSource = math.raw;
    node.setAttribute("contenteditable", "false");
    node.title = math.raw;
    try {
      if (!root.katex) throw new Error("公式渲染器未加载");
      root.katex.render(math.tex, node, { displayMode: math.display, throwOnError: true, trust: false, strict: "ignore", maxExpand: 1000, maxSize: 20 });
    } catch (error) {
      node.classList.add("reader-math-error");
      node.textContent = math.raw;
      node.title = `公式无法渲染：${error.message}`;
    }
    return node;
  }

  function restore(fragment, protectedText) {
    if (!protectedText.items.length) return fragment;
    const nodes = [];
    const walker = document.createTreeWalker(fragment, 4);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const textNode of nodes) {
      let text = textNode.data;
      const replacement = document.createDocumentFragment();
      let changed = false;
      while (text) {
        let first = null, at = text.length;
        for (const item of protectedText.items) {
          const index = text.indexOf(item.marker);
          if (index >= 0 && index < at) { first = item; at = index; }
        }
        if (!first) { replacement.appendChild(document.createTextNode(text)); break; }
        replacement.appendChild(document.createTextNode(text.slice(0, at)));
        replacement.appendChild(render(first));
        text = text.slice(at + first.marker.length);
        changed = true;
      }
      if (changed) textNode.replaceWith(replacement);
    }
    return fragment;
  }

  function readBlock(lines, start) {
    const first = lines[start].trimStart();
    if (!first.startsWith("$$") && !first.startsWith("\\[")) return null;
    const close = first.startsWith("$$") ? "$$" : "\\]";
    let source = "";
    for (let end = start; end < lines.length; end++) {
      if (end > start && /^\s*(`{3,}|~{3,})/.test(lines[end])) break;
      source += (end > start ? "\n" : "") + lines[end];
      if (!lines[end].trimEnd().endsWith(close)) continue;
      const trimmed = source.trim();
      const math = readMath(trimmed, 0);
      if (math && math.end === trimmed.length) return { ...math, raw: source, endLine: end };
    }
    return null;
  }

  const api = { protect, restore, restoreText, readBlock, render };
  root.ReaderMath = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
