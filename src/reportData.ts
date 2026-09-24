import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { extractMarkdownHeadings, type ReportHeading } from "./markdownHeadings";

export type ReportFile = {
  name: string;
  label: string;
  uri: string;
  content: string;
  headings: ReportHeading[];
};

export type ReportPayload = {
  ok: true;
  title: string;
  meta: string;
  rootUri: string;
  /** Webview URI of the document folder (trailing slash) for document-relative image paths. */
  imageBaseUri: string;
  /** Webview URI of the Obsidian vault / workspace root (trailing slash) for vault-relative paths. */
  vaultBaseUri: string;
  /** Raw image target as written in Markdown -> resolved webview URI. */
  images: Record<string, string>;
  /** Raw image targets that could not be resolved to an existing file. */
  missingImages: string[];
  files: ReportFile[];
};

export type ReportPayloadOptions = {
  /** Converts an absolute filesystem path to a URI the webview is allowed to load. */
  toWebviewUri?: (fsPath: string) => string;
  /** Absolute directory used to resolve vault-root-relative paths (Obsidian `attachments/...`). */
  vaultRoot?: string;
};

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".avif",
  ".ico",
  ".tif",
  ".tiff"
]);

const SKIPPED_WALK_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".obsidian-mobile",
  ".trash",
  ".DS_Store",
  "node_modules",
  ".vscode",
  ".cursor"
]);

/** Cache of lowercased file name -> absolute paths, keyed by vault root. */
const vaultNameIndexCache = new Map<string, Map<string, string[]>>();

export async function buildReportPayload(
  uri: vscode.Uri,
  currentText: string,
  options: ReportPayloadOptions = {}
): Promise<ReportPayload> {
  return buildSingleFilePayload(uri, currentText, options);
}

function buildSingleFilePayload(
  uri: vscode.Uri,
  content: string,
  options: ReportPayloadOptions
): ReportPayload {
  const name = path.basename(uri.fsPath || uri.path);
  const label = name.replace(/\.md$/i, "");
  const documentDir = path.dirname(uri.fsPath);
  const vaultRoot = resolveVaultRoot(documentDir, options.vaultRoot);
  const resolution = resolveImageReferences(content, documentDir, vaultRoot, options.toWebviewUri);

  return {
    ok: true,
    title: name,
    meta: "",
    rootUri: uri.toString(),
    imageBaseUri: toBaseUri(documentDir, options.toWebviewUri),
    vaultBaseUri: vaultRoot ? toBaseUri(vaultRoot, options.toWebviewUri) : "",
    images: resolution.resolved,
    missingImages: resolution.missing,
    files: [
      {
        name,
        label,
        uri: uri.toString(),
        content,
        headings: extractMarkdownHeadings(content, label)
      }
    ]
  };
}

function toBaseUri(dir: string, toWebviewUri?: (fsPath: string) => string): string {
  if (!dir || !toWebviewUri) {
    return "";
  }
  try {
    const base = toWebviewUri(dir);
    return base.endsWith("/") ? base : `${base}/`;
  } catch {
    return "";
  }
}

/**
 * Finds the Obsidian vault root by walking up from the document folder looking for a
 * `.obsidian` directory. Falls back to the provided workspace root, then the document folder.
 */
export function resolveVaultRoot(documentDir: string, workspaceRoot?: string): string {
  if (workspaceRoot && fs.existsSync(workspaceRoot)) {
    return workspaceRoot;
  }

  let current = path.resolve(documentDir);
  for (let depth = 0; depth < 12; depth += 1) {
    if (
      fs.existsSync(path.join(current, ".obsidian")) ||
      fs.existsSync(path.join(current, ".obsidian-mobile"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return documentDir;
}

type ImageResolution = {
  resolved: Record<string, string>;
  missing: string[];
};

export function resolveImageReferences(
  content: string,
  documentDir: string,
  vaultRoot: string,
  toWebviewUri?: (fsPath: string) => string
): ImageResolution {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  const targets = collectImageTargets(content);

  for (const target of targets) {
    if (resolved[target] || missing.includes(target)) {
      continue;
    }

    const absolute = locateImage(target, documentDir, vaultRoot);
    if (!absolute) {
      missing.push(target);
      continue;
    }

    if (!toWebviewUri) {
      resolved[target] = "";
      continue;
    }

    try {
      resolved[target] = toWebviewUri(absolute);
    } catch {
      missing.push(target);
    }
  }

  return { resolved, missing };
}

/** Collects image targets from Obsidian embeds (`![[x.png]]`) and standard images (`![alt](x.png)`). */
export function collectImageTargets(content: string): string[] {
  const targets: string[] = [];
  const lines = String(content || "").split(/\r?\n/);
  let fence: { char: string; length: number } | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { char, length };
        continue;
      }
      if (char === fence.char && length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) {
      continue;
    }

    const withoutInlineCode = line.replace(/`[^`]*`/g, "");

    for (const match of withoutInlineCode.matchAll(/!\[\[([^\]]+)\]\]/g)) {
      const parsed = parseEmbedInner(match[1]);
      if (parsed && isImageTarget(parsed.target)) {
        targets.push(parsed.target);
      }
    }

    for (const match of withoutInlineCode.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = cleanImageHref(match[1]);
      if (href && isImageTarget(href)) {
        targets.push(href);
      }
    }
  }

  return targets;
}

/** Splits `path|width` / `path|alt` Obsidian embed syntax. */
export function parseEmbedInner(inner: string): { target: string; width: number | null } | null {
  const raw = String(inner || "").trim();
  if (!raw) {
    return null;
  }

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex === -1) {
    return { target: raw, width: null };
  }

  const target = raw.slice(0, pipeIndex).trim();
  const alias = raw.slice(pipeIndex + 1).trim();
  const width = /^\d+$/.test(alias) ? Number(alias) : null;
  return target ? { target, width } : null;
}

function cleanImageHref(href: string): string {
  let value = String(href || "").trim();
  if (value.startsWith("<") && value.endsWith(">")) {
    value = value.slice(1, -1).trim();
  }
  const titleMatch = /^(\S+)\s+["'(].*$/.exec(value);
  if (titleMatch) {
    value = titleMatch[1];
  }
  return value.split("#")[0].trim();
}

function isImageTarget(target: string): boolean {
  if (/^(https?:|data:|blob:)/i.test(target)) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase());
}

function safeDecode(value: string): string {
  if (!value.includes("%")) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves one raw image target the way Obsidian does: document-relative first, then
 * vault-relative, then a vault-wide lookup by bare file name.
 */
export function locateImage(target: string, documentDir: string, vaultRoot: string): string | null {
  const decoded = safeDecode(target).replace(/^\.\//, "");
  const candidates: string[] = [];

  if (path.isAbsolute(decoded)) {
    candidates.push(decoded);
  } else {
    // Document-relative first (standard Markdown semantics), then vault-relative (Obsidian).
    candidates.push(path.resolve(documentDir, decoded));
    if (vaultRoot) {
      candidates.push(path.resolve(vaultRoot, decoded));
    }
  }

  for (const candidate of candidates) {
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  // Obsidian also resolves a bare file name to any matching file in the vault.
  if (!decoded.includes("/") && !decoded.includes("\\") && vaultRoot) {
    const indexed = lookupInVaultIndex(vaultRoot, path.basename(decoded));
    if (indexed) {
      return indexed;
    }
  }

  return null;
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function lookupInVaultIndex(vaultRoot: string, fileName: string): string | null {
  let index = vaultNameIndexCache.get(vaultRoot);
  if (!index) {
    index = buildVaultNameIndex(vaultRoot);
    vaultNameIndexCache.set(vaultRoot, index);
  }
  const matches = index.get(fileName.toLowerCase());
  if (!matches || !matches.length) {
    return null;
  }
  // Prefer the shallowest path so bare names resolve predictably.
  return matches.slice().sort((a, b) => a.split(path.sep).length - b.split(path.sep).length)[0];
}

function buildVaultNameIndex(vaultRoot: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: vaultRoot, depth: 0 }];
  let visited = 0;

  while (queue.length && visited < 20000) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      visited += 1;
      if (visited > 20000) {
        break;
      }
      if (SKIPPED_WALK_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 12) {
          queue.push({ dir: full, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile() || !isImageTarget(entry.name)) {
        continue;
      }
      const key = entry.name.toLowerCase();
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(full);
      } else {
        index.set(key, [full]);
      }
    }
  }

  return index;
}

export function clearVaultNameIndexCache(): void {
  vaultNameIndexCache.clear();
}
