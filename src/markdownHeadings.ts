export type ReportHeading = {
  level: number;
  text: string;
  line: number;
  anchor: string;
};

export function extractMarkdownHeadings(content: string, fileName: string): ReportHeading[] {
  const headings: ReportHeading[] = [];
  const lines = String(content || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
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
