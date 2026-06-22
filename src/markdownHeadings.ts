export type ReportHeading = {
  level: number;
  text: string;
  line: number;
  anchor: string;
};

type CodeFence = {
  char: string;
  length: number;
};

function parseCodeFenceLine(line: string): { char: string; length: number; remainder: string } | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(String(line || ""));
  if (!match) {
    return null;
  }
  const marker = match[2];
  return {
    char: marker[0],
    length: marker.length,
    remainder: match[3] || ""
  };
}

function isCodeFenceClose(line: string, openFence: CodeFence | null): boolean {
  const fence = parseCodeFenceLine(line);
  if (!fence || !openFence || fence.char !== openFence.char || fence.length < openFence.length) {
    return false;
  }
  return /^\s*$/.test(fence.remainder);
}

export function extractMarkdownHeadings(content: string, fileName: string): ReportHeading[] {
  const headings: ReportHeading[] = [];
  const lines = String(content || "").split(/\r?\n/);
  let inCode = false;
  let openCodeFence: CodeFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = parseCodeFenceLine(line);
    if (fence) {
      if (inCode && isCodeFenceClose(line, openCodeFence)) {
        inCode = false;
        openCodeFence = null;
      } else if (!inCode) {
        inCode = true;
        openCodeFence = { char: fence.char, length: fence.length };
      }
      continue;
    }
    if (inCode) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const text = match[2].replace(/\s+#*$/, "").trim();
    headings.push({
      level: match[1].length,
      text,
      line: index + 1,
      anchor: makeAnchor(fileName, headings.length, text)
    });
  }

  return headings;
}

function makeAnchor(fileName: string, index: number, text: string): string {
  return slugify(`${fileName}-${index}-${text}`) || `${fileName}-${index}`;
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
