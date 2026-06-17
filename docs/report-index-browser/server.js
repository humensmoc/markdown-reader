const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.REPORT_INDEX_BROWSER_PORT || 3220);
const ROOT = __dirname;
const REPO_ROOT = path.resolve(ROOT, "..", "..");
const INDEX_PATH = path.resolve(
  process.env.REPORT_INDEX_PATH || path.join(REPO_ROOT, "deepresearch", "reports", "report_index.json")
);
const BACKUP_DIR = path.resolve(path.dirname(INDEX_PATH), "_index_backups");
const REPORT_FILE_ORDER = [
  "gameplay.md",
  "system.md",
  "feedback.md",
  "marketing.md",
  "presentation.md",
  "numerical.md",
  "technical.md"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeTag(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).map(normalizeTag).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
}

function gameSort(a, b) {
  const rankA = Number(a.rank || 0);
  const rankB = Number(b.rank || 0);
  if (rankA !== rankB) return rankA - rankB;
  return Number(a.appid || 0) - Number(b.appid || 0);
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      body += chunk.toString("utf-8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readIndex() {
  const raw = await fs.promises.readFile(INDEX_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.games) || !parsed.vocabulary) {
    throw new Error("report_index.json structure is invalid");
  }
  return parsed;
}

async function writeIndex(index) {
  validateIndex(index);
  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `report_index.${timestamp}.json`);
  await fs.promises.copyFile(INDEX_PATH, backupPath);
  const tmpPath = `${INDEX_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  JSON.parse(await fs.promises.readFile(tmpPath, "utf-8"));
  await fs.promises.rename(tmpPath, INDEX_PATH);
  return backupPath;
}

function getVocabularyValues(index, scope, group) {
  const vocabulary = index.vocabulary || {};
  if (scope === "best_for") return vocabulary.best_for_pool || [];
  if (scope === "gameplay_categories") {
    if (group) return vocabulary.gameplay_category_taxonomy?.[group] || [];
    return Object.values(vocabulary.gameplay_category_taxonomy || {}).flat();
  }
  if (scope === "tags") {
    if (!group) return [];
    return vocabulary.tag_taxonomy?.[group] || [];
  }
  return [];
}

function setVocabularyValues(index, scope, group, values) {
  if (scope === "best_for") {
    index.vocabulary.best_for_pool = uniqueSorted(values);
    return;
  }
  if (scope === "gameplay_categories") {
    if (!group) throw new Error("gameplay_categories vocabulary updates require a group");
    index.vocabulary.gameplay_category_taxonomy[group] = uniqueSorted(values);
    return;
  }
  if (scope === "tags") {
    if (!group) throw new Error("tags vocabulary updates require a group");
    index.vocabulary.tag_taxonomy[group] = uniqueSorted(values);
    return;
  }
  throw new Error("Unknown vocabulary scope");
}

function ensureTagExists(index, scope, group, tag) {
  const values = getVocabularyValues(index, scope, group);
  if (!values.includes(tag)) {
    throw new Error(`Tag is not in vocabulary: ${scope}${group ? `.${group}` : ""}:${tag}`);
  }
}

function getGame(index, appid) {
  const game = index.games.find((item) => Number(item.appid) === Number(appid));
  if (!game) throw new Error(`Game not found: ${appid}`);
  return game;
}

function getGameTagsForScope(game, scope, group) {
  if (scope === "best_for") return game.best_for || [];
  if (scope === "gameplay_categories") return game.gameplay_categories || [];
  if (scope === "tags") return game.tags?.[group] || [];
  return [];
}

function setGameTagsForScope(game, scope, group, values) {
  const next = uniqueSorted(values);
  if (scope === "best_for") {
    game.best_for = next;
    return;
  }
  if (scope === "gameplay_categories") {
    game.gameplay_categories = next;
    return;
  }
  if (scope === "tags") {
    if (!group) throw new Error("tags updates require a group");
    game.tags = game.tags || {};
    if (next.length) game.tags[group] = next;
    else delete game.tags[group];
    return;
  }
  throw new Error("Unknown game tag scope");
}

function minimalGame(game) {
  return {
    rank: game.rank,
    name: game.name,
    appid: game.appid,
    reviews: game.reviews,
    positive_rate: game.positive_rate,
    release_date: game.release_date,
    report_dir: game.report_dir,
    annotation_status: game.annotation_status
  };
}

function resolveReportDir(game) {
  const reportDir = path.resolve(REPO_ROOT, game.report_dir || "");
  const reportsRoot = path.resolve(REPO_ROOT, "deepresearch", "reports");
  if (!reportDir.startsWith(reportsRoot)) {
    throw new Error(`Unsafe report_dir for ${game.name}: ${game.report_dir}`);
  }
  return reportDir;
}

function extractMarkdownHeadings(content, fileName) {
  const headings = [];
  const lines = String(content || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!match) continue;
    const text = match[2].replace(/\s+#*$/, "").trim();
    headings.push({
      level: match[1].length,
      text,
      line: i + 1,
      anchor: makeAnchor(fileName, headings.length, text)
    });
  }
  return headings;
}

function makeAnchor(fileName, index, text) {
  const slug = `${fileName}-${index}-${text}`
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `${fileName}-${index}`;
}

function buildTagToGames(index) {
  const entries = new Map();
  const categoryGroups = new Map();
  for (const [group, values] of Object.entries(index.vocabulary?.gameplay_category_taxonomy || {})) {
    for (const tag of values || []) {
      if (!categoryGroups.has(tag)) categoryGroups.set(tag, group);
    }
  }

  function add(scope, group, tag, game) {
    if (!tag) return;
    const key = `${scope}|${group || ""}|${tag}`;
    if (!entries.has(key)) {
      entries.set(key, { key, scope, group: group || null, tag, games: [] });
    }
    entries.get(key).games.push(minimalGame(game));
  }

  for (const game of index.games) {
    for (const tag of game.best_for || []) add("best_for", null, tag, game);
    for (const [group, tags] of Object.entries(game.tags || {})) {
      for (const tag of tags || []) add("tags", group, tag, game);
    }
    for (const tag of game.gameplay_categories || []) {
      add("gameplay_categories", categoryGroups.get(tag) || null, tag, game);
    }
  }

  return Array.from(entries.values())
    .map((entry) => ({
      ...entry,
      count: entry.games.length,
      games: entry.games.sort(gameSort)
    }))
    .sort((a, b) => {
      const scope = a.scope.localeCompare(b.scope);
      if (scope) return scope;
      const group = String(a.group || "").localeCompare(String(b.group || ""));
      if (group) return group;
      return a.tag.localeCompare(b.tag, "zh-CN");
    });
}

function buildIndexPayload(index) {
  return {
    ok: true,
    index,
    tagToGames: buildTagToGames(index),
    meta: {
      indexPath: INDEX_PATH,
      backupDir: BACKUP_DIR,
      gameCount: index.games.length
    }
  };
}

function vocabularySets(index) {
  const bestFor = new Set(index.vocabulary.best_for_pool || []);
  const tagGroups = {};
  for (const [group, values] of Object.entries(index.vocabulary.tag_taxonomy || {})) {
    tagGroups[group] = new Set(values || []);
  }
  const category = new Set(Object.values(index.vocabulary.gameplay_category_taxonomy || {}).flat());
  return { bestFor, tagGroups, category };
}

function validateIndex(index) {
  if (!index || !index.vocabulary || !Array.isArray(index.games)) {
    throw new Error("Invalid index root structure");
  }
  const sets = vocabularySets(index);
  const seenAppids = new Set();
  for (const game of index.games) {
    if (!game.appid) throw new Error(`Game missing appid: ${game.name || "(unnamed)"}`);
    if (seenAppids.has(Number(game.appid))) throw new Error(`Duplicate appid: ${game.appid}`);
    seenAppids.add(Number(game.appid));

    for (const tag of game.best_for || []) {
      if (!sets.bestFor.has(tag)) throw new Error(`Orphan best_for tag on ${game.name}: ${tag}`);
    }
    for (const [group, tags] of Object.entries(game.tags || {})) {
      if (!sets.tagGroups[group]) throw new Error(`Unknown tag group on ${game.name}: ${group}`);
      for (const tag of tags || []) {
        if (!sets.tagGroups[group].has(tag)) throw new Error(`Orphan tag on ${game.name}: tags.${group}:${tag}`);
      }
    }
    for (const tag of game.gameplay_categories || []) {
      if (!sets.category.has(tag)) throw new Error(`Orphan gameplay category on ${game.name}: ${tag}`);
    }
  }
}

async function handleGetIndex(res) {
  const index = await readIndex();
  validateIndex(index);
  sendJson(res, 200, buildIndexPayload(index));
}

async function handleGetReport(url, res) {
  const appid = Number(url.searchParams.get("appid"));
  if (!Number.isFinite(appid)) throw new Error("appid is required");
  const index = await readIndex();
  const game = getGame(index, appid);
  const reportDir = resolveReportDir(game);
  const stat = await fs.promises.stat(reportDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    sendJson(res, 404, {
      ok: false,
      message: `Report directory not found: ${game.report_dir}`,
      game: minimalGame(game)
    });
    return;
  }

  const existingNames = new Set((await fs.promises.readdir(reportDir)).filter((name) => name.toLowerCase().endsWith(".md")));
  const orderedNames = [
    ...REPORT_FILE_ORDER.filter((name) => existingNames.has(name)),
    ...Array.from(existingNames)
      .filter((name) => !REPORT_FILE_ORDER.includes(name))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  ];

  const files = [];
  for (const name of orderedNames) {
    const filePath = path.join(reportDir, name);
    const content = await fs.promises.readFile(filePath, "utf-8");
    files.push({
      name,
      label: name.replace(/\.md$/i, ""),
      content,
      headings: extractMarkdownHeadings(content, name.replace(/\.md$/i, ""))
    });
  }

  sendJson(res, 200, {
    ok: true,
    game: minimalGame(game),
    reportDir: game.report_dir,
    files
  });
}

async function handleGameTags(req, res) {
  const body = JSON.parse((await readBody(req)) || "{}");
  const index = await readIndex();
  const game = getGame(index, body.appid);

  const bestFor = uniqueSorted(body.best_for);
  const categories = uniqueSorted(body.gameplay_categories);
  const tags = body.tags && typeof body.tags === "object" ? body.tags : {};

  for (const tag of bestFor) ensureTagExists(index, "best_for", null, tag);
  for (const tag of categories) {
    if (!getVocabularyValues(index, "gameplay_categories").includes(tag)) {
      throw new Error(`Gameplay category is not in vocabulary: ${tag}`);
    }
  }
  for (const [group, values] of Object.entries(tags)) {
    for (const tag of uniqueSorted(values)) ensureTagExists(index, "tags", group, tag);
  }

  game.best_for = bestFor;
  game.gameplay_categories = categories;
  game.tags = {};
  for (const [group, values] of Object.entries(tags)) {
    const normalized = uniqueSorted(values);
    if (normalized.length) game.tags[group] = normalized;
  }
  game.annotation_notes = String(body.annotation_notes || "").trim();
  if (Object.prototype.hasOwnProperty.call(body, "annotation_status")) {
    const status = String(body.annotation_status || "").trim();
    if (status) game.annotation_status = status;
    else delete game.annotation_status;
  }
  index.games.sort(gameSort);
  const backupPath = await writeIndex(index);
  sendJson(res, 200, { ...buildIndexPayload(index), backupPath });
}

async function handleTagMembership(req, res) {
  const body = JSON.parse((await readBody(req)) || "{}");
  const scope = String(body.scope || "");
  const group = body.group ? String(body.group) : null;
  const tag = normalizeTag(body.tag);
  const action = String(body.action || "");
  const appids = Array.isArray(body.appids) ? body.appids.map(Number) : [];
  if (!["add", "remove"].includes(action)) throw new Error("action must be add or remove");
  if (!appids.length) throw new Error("appids is required");

  const index = await readIndex();
  if (action === "add") ensureTagExists(index, scope, group, tag);

  for (const appid of appids) {
    const game = getGame(index, appid);
    const current = getGameTagsForScope(game, scope, group);
    const next = action === "add" ? [...current, tag] : current.filter((item) => item !== tag);
    setGameTagsForScope(game, scope, group, next);
  }
  const backupPath = await writeIndex(index);
  sendJson(res, 200, { ...buildIndexPayload(index), backupPath });
}

async function handleVocabulary(req, res) {
  const body = JSON.parse((await readBody(req)) || "{}");
  const action = String(body.action || "");
  const scope = String(body.scope || "");
  const group = body.group ? String(body.group) : null;
  const tag = normalizeTag(body.tag);
  const newTag = normalizeTag(body.newTag);
  const removeFromGames = Boolean(body.removeFromGames);
  const index = await readIndex();

  if (!["create", "rename", "delete"].includes(action)) throw new Error("Unsupported vocabulary action");
  if (!tag) throw new Error("tag is required");

  const values = getVocabularyValues(index, scope, group);
  if (!Array.isArray(values)) throw new Error("Unknown vocabulary target");

  if (action === "create") {
    if (values.includes(tag)) throw new Error("Tag already exists");
    setVocabularyValues(index, scope, group, [...values, tag]);
  }

  if (action === "rename") {
    if (!newTag) throw new Error("newTag is required");
    if (!values.includes(tag)) throw new Error("Tag does not exist");
    if (values.includes(newTag)) throw new Error("newTag already exists");
    setVocabularyValues(index, scope, group, values.map((item) => (item === tag ? newTag : item)));
    for (const game of index.games) {
      const current = getGameTagsForScope(game, scope, group);
      if (current.includes(tag)) {
        setGameTagsForScope(game, scope, group, current.map((item) => (item === tag ? newTag : item)));
      }
    }
  }

  if (action === "delete") {
    if (!values.includes(tag)) throw new Error("Tag does not exist");
    const usedBy = index.games.filter((game) => getGameTagsForScope(game, scope, group).includes(tag));
    if (usedBy.length && !removeFromGames) {
      sendJson(res, 409, { ok: false, message: `Tag is used by ${usedBy.length} games`, usedBy: usedBy.map(minimalGame) });
      return;
    }
    setVocabularyValues(index, scope, group, values.filter((item) => item !== tag));
    if (removeFromGames) {
      for (const game of index.games) {
        setGameTagsForScope(
          game,
          scope,
          group,
          getGameTagsForScope(game, scope, group).filter((item) => item !== tag)
        );
      }
    }
  }

  const backupPath = await writeIndex(index);
  sendJson(res, 200, { ...buildIndexPayload(index), backupPath });
}

async function handleApi(req, res) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === "/api/index" && req.method === "GET") {
    await handleGetIndex(res);
    return true;
  }
  if (url.pathname === "/api/report" && req.method === "GET") {
    await handleGetReport(url, res);
    return true;
  }
  if (url.pathname === "/api/game-tags" && req.method === "POST") {
    await handleGameTags(req, res);
    return true;
  }
  if (url.pathname === "/api/tag-membership" && req.method === "POST") {
    await handleTagMembership(req, res);
    return true;
  }
  if (url.pathname === "/api/vocabulary" && req.method === "POST") {
    await handleVocabulary(req, res);
    return true;
  }
  if (url.pathname === "/api/ping" && req.method === "GET") {
    sendJson(res, 200, { ok: true, indexPath: INDEX_PATH });
    return true;
  }
  return false;
}

function safeResolveFilePath(urlPath) {
  const cleanPath = (urlPath || "/").split("?")[0].split("#")[0];
  const relativePath = cleanPath === "/" ? "/index.html" : cleanPath;
  const absolutePath = path.resolve(ROOT, `.${relativePath}`);
  if (!absolutePath.startsWith(ROOT)) return null;
  return absolutePath;
}

function serveStatic(req, res) {
  const filePath = safeResolveFilePath(req.url);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    serveStatic(req, res);
  } catch (err) {
    sendJson(res, 500, { ok: false, message: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Report Index Browser running at http://${HOST}:${PORT}`);
  console.log(`Index path: ${INDEX_PATH}`);
});
