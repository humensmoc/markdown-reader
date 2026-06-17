const metaLine = document.getElementById("metaLine");
const refreshBtn = document.getElementById("refreshBtn");
const themeBtn = document.getElementById("themeBtn");
const tagSearchInput = document.getElementById("tagSearchInput");
const gameSearchInput = document.getElementById("gameSearchInput");
const tagList = document.getElementById("tagList");
const selectedTagTitle = document.getElementById("selectedTagTitle");
const selectedTagMeta = document.getElementById("selectedTagMeta");
const selectedTagTray = document.getElementById("selectedTagTray");
const clearTagBtn = document.getElementById("clearTagBtn");
const tagEditBar = document.getElementById("tagEditBar");
const renameTagInput = document.getElementById("renameTagInput");
const renameTagBtn = document.getElementById("renameTagBtn");
const toggleCandidatePanelBtn = document.getElementById("toggleCandidatePanelBtn");
const deleteTagBtn = document.getElementById("deleteTagBtn");
const membershipBar = document.getElementById("membershipBar");
const candidateSearchInput = document.getElementById("candidateSearchInput");
const candidateList = document.getElementById("candidateList");
const addGameToTagBtn = document.getElementById("addGameToTagBtn");
const closeCandidatePanelBtn = document.getElementById("closeCandidatePanelBtn");
const gameList = document.getElementById("gameList");
const gameDetail = document.getElementById("gameDetail");
const saveGameBtn = document.getElementById("saveGameBtn");
const newTagScopeSelect = document.getElementById("newTagScopeSelect");
const newTagInput = document.getElementById("newTagInput");
const createTagBtn = document.getElementById("createTagBtn");
const toast = document.getElementById("toast");

let indexData = null;
let tagToGames = [];
let meta = null;
let selectedTag = null;
let selectedTagKeys = new Set();
let selectedTagTrayKeys = new Set();
let selectedAppid = null;
let draftGame = null;
let savedDraftSnapshot = "";
let candidateSelections = new Set();
let isCandidatePanelOpen = false;
let collapsedTagSections = new Set();
let collapsedDetailSections = new Set();

initTheme();

refreshBtn.addEventListener("click", async () => {
  if (!(await confirmDiscardDraft("刷新会丢弃当前游戏未保存的改动。"))) return;
  await loadIndex(true);
});
themeBtn.addEventListener("click", () => toggleTheme());
tagSearchInput.addEventListener("input", () => renderTags());
gameSearchInput.addEventListener("input", () => renderGameList());
candidateSearchInput.addEventListener("input", () => renderCandidateList());
clearTagBtn.addEventListener("click", () => clearSelectedTag());
renameTagBtn.addEventListener("click", () => renameSelectedTag());
deleteTagBtn.addEventListener("click", () => deleteSelectedTag());
toggleCandidatePanelBtn.addEventListener("click", () => toggleCandidatePanel());
closeCandidatePanelBtn.addEventListener("click", () => closeCandidatePanel());
addGameToTagBtn.addEventListener("click", () => addSelectedGamesToTag());
saveGameBtn.addEventListener("click", () => saveDraftGame());
createTagBtn.addEventListener("click", () => createTag());
selectedTagTray.addEventListener(
  "wheel",
  (evt) => {
    if (selectedTagTray.scrollWidth <= selectedTagTray.clientWidth) return;
    evt.preventDefault();
    selectedTagTray.scrollLeft += evt.deltaY || evt.deltaX;
  },
  { passive: false }
);

loadIndex(true);

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

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.message || `HTTP ${res.status}`);
  }
  return payload;
}

function isGuideSandbox() {
  return Boolean(window.isReportIndexGuideActive?.());
}

function notifyGuideWriteBlocked(actionLabel) {
  showToast(`演示模式：${actionLabel}未写回 report_index.json`);
}

async function loadIndex(resetDraft = false, { silent = false } = {}) {
  try {
    const payload = await api("/api/index");
    indexData = payload.index;
    tagToGames = payload.tagToGames;
    meta = payload.meta;
    refreshSelectedTag();
    if (selectedAppid && !getGame(selectedAppid)) clearSelectedGameDraft();
    renderAll({ resetDraft });
    if (!silent) showToast("索引已加载");
  } catch (err) {
    showToast(`加载失败：${err.message}`, true);
  }
}

function renderAll({ resetDraft = false } = {}) {
  const gameCount = indexData?.games?.length || 0;
  metaLine.textContent = `${gameCount} games · ${meta?.indexPath || ""}`;
  renderNewTagScopeOptions();
  renderTags();
  renderTagMode();
  renderSelectedTagTray();
  renderGameList();
  renderGameDetail(resetDraft);
}

function renderTagMode() {
  if (selectedTagKeys.size && !selectedTag) selectedTag = firstSelectedTagEntry();
  if (selectedTagKeys.size && !selectedTag) selectedTagKeys.clear();
  if (!selectedTagKeys.size) {
    isCandidatePanelOpen = false;
    selectedTagTitle.textContent = "全部游戏";
    selectedTagMeta.textContent = "搜索并选择游戏，或从左侧选择 tag 管理成员。";
    clearTagBtn.classList.toggle("hidden", !selectedTagTrayKeys.size);
    tagEditBar.classList.add("hidden");
    membershipBar.classList.add("hidden");
    return;
  }

  const selectedCount = selectedTagKeys.size;
  const visibleGameCount = getVisibleGames().length;
  selectedTagTitle.textContent =
    selectedCount === 1 ? `${selectedTag.label}: ${selectedTag.tag}` : `已选 ${selectedCount} 个 tag · ${visibleGameCount} games`;
  selectedTagMeta.textContent =
    selectedCount === 1
      ? `${selectedTag.count || 0} games · 成员增删会立即写回 report_index.json`
      : `中间列表显示同时拥有这些 tag 的游戏 · 当前操作 tag：${selectedTag.label}: ${selectedTag.tag}`;
  renameTagInput.value = selectedTag?.tag || "";
  clearTagBtn.classList.remove("hidden");
  tagEditBar.classList.remove("hidden");
  toggleCandidatePanelBtn.textContent = isCandidatePanelOpen ? "收起加入面板" : "搜索游戏加入当前 tag";
  membershipBar.classList.toggle("hidden", !isCandidatePanelOpen);
  if (isCandidatePanelOpen) renderCandidateList();
}

function renderSelectedTagTray() {
  if (!indexData) return;
  for (const key of selectedTagKeys) selectedTagTrayKeys.add(key);
  selectedTagTrayKeys = new Set([...selectedTagTrayKeys].filter((key) => findTagEntryByKey(key)));
  selectedTagTray.innerHTML = "";

  if (!selectedTagTrayKeys.size) {
    selectedTagTray.classList.add("hidden");
    return;
  }

  selectedTagTray.classList.remove("hidden");
  for (const key of selectedTagTrayKeys) {
    const entry = findTagEntryByKey(key);
    if (!entry) continue;
    selectedTagTray.appendChild(createTrayTagButton(entry));
  }
}

function createTrayTagButton(entry) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tag-button tray-tag${selectedTagKeys.has(entry.key) ? " selected" : ""}${
    selectedTag?.key === entry.key ? " active" : ""
  }`;
  button.innerHTML = `<span>${escapeHtml(entry.tag)}</span><b>${entry.count}</b>`;
  button.title = selectedTagKeys.has(entry.key)
    ? "点击取消勾选；右键取消固定"
    : "点击重新勾选这个 tag；右键取消固定";
  button.addEventListener("click", () => toggleTagSelection(entry));
  button.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    unpinTrayTag(entry);
  });
  return button;
}

function unpinTrayTag(entry) {
  selectedTagTrayKeys.delete(entry.key);
  if (selectedTagKeys.has(entry.key)) {
    selectedTagKeys.delete(entry.key);
    if (selectedTag?.key === entry.key) selectedTag = firstSelectedTagEntry();
  }
  if (!selectedTagKeys.size) {
    selectedTag = null;
    candidateSelections.clear();
    isCandidatePanelOpen = false;
    candidateSearchInput.value = "";
    gameSearchInput.value = "";
  }
  renderAll({ resetDraft: false });
  showToast(`已取消固定：${entry.tag}`);
}

function renderNewTagScopeOptions() {
  const current = newTagScopeSelect.value;
  const scopes = getVocabularyTargets();
  const preferred = selectedTag ? targetKeyFor(selectedTag.scope, selectedTag.group) : current;
  newTagScopeSelect.innerHTML = "";
  for (const target of scopes) {
    const option = document.createElement("option");
    option.value = target.key;
    option.textContent = target.label;
    newTagScopeSelect.appendChild(option);
  }
  if (scopes.some((item) => item.key === preferred)) {
    newTagScopeSelect.value = preferred;
  } else if (scopes.some((item) => item.key === current)) {
    newTagScopeSelect.value = current;
  }
}

function getVocabularyTargets() {
  if (!indexData) return [];
  const targets = [{ key: "best_for||", scope: "best_for", group: null, label: "best_for" }];
  for (const group of Object.keys(indexData.vocabulary.tag_taxonomy || {})) {
    targets.push({ key: `tags|${group}|`, scope: "tags", group, label: `tags.${group}` });
  }
  for (const group of Object.keys(indexData.vocabulary.gameplay_category_taxonomy || {})) {
    targets.push({
      key: `gameplay_categories|${group}|`,
      scope: "gameplay_categories",
      group,
      label: `gameplay_categories.${group}`
    });
  }
  return targets;
}

function parseTargetKey(key) {
  const [scope, group] = String(key || "").split("|");
  return { scope, group: group || null };
}

function targetKeyFor(scope, group) {
  return `${scope}|${group || ""}|`;
}

function renderTags() {
  if (!indexData) return;
  const keyword = tagSearchInput.value.trim().toLowerCase();
  tagList.innerHTML = "";
  const sections = buildTagSections().map((section) => ({
    ...section,
    tags: section.tags.filter((entry) => {
      const text = `${entry.label} ${entry.tag} ${entry.group || ""}`.toLowerCase();
      return !keyword || text.includes(keyword);
    }).sort(tagEntrySort)
  }));

  for (const group of buildTagSectionTree(sections)) {
    tagList.appendChild(createTagParentSection(group));
  }
}

function buildTagSections() {
  const usedMap = new Map(tagToGames.map((entry) => [entry.key, entry]));
  const vocab = indexData.vocabulary;
  const sections = [];
  sections.push({
    key: "best_for||",
    scope: "best_for",
    group: null,
    title: "best_for",
    tags: (vocab.best_for_pool || []).map((tag) => makeTagEntry(usedMap, "best_for", null, tag))
  });
  for (const [group, values] of Object.entries(vocab.tag_taxonomy || {})) {
    sections.push({
      key: `tags|${group}|`,
      scope: "tags",
      group,
      title: `tags.${group}`,
      tags: (values || []).map((tag) => makeTagEntry(usedMap, "tags", group, tag))
    });
  }
  for (const [group, values] of Object.entries(vocab.gameplay_category_taxonomy || {})) {
    sections.push({
      key: `gameplay_categories|${group}|`,
      scope: "gameplay_categories",
      group,
      title: `gameplay_categories.${group}`,
      tags: (values || []).map((tag) => makeTagEntry(usedMap, "gameplay_categories", group, tag))
    });
  }
  return sections;
}

function tagEntrySort(a, b) {
  if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
  return a.tag.localeCompare(b.tag, "zh-Hans-CN");
}

function buildTagSectionTree(sections) {
  return [
    {
      key: "parent|best_for",
      title: "best_for",
      mode: "direct",
      sections: sections.filter((section) => section.scope === "best_for")
    },
    {
      key: "parent|tags",
      title: "tags",
      mode: "grouped",
      sections: sections.filter((section) => section.scope === "tags")
    },
    {
      key: "parent|gameplay_categories",
      title: "gameplay_categories",
      mode: "grouped",
      sections: sections.filter((section) => section.scope === "gameplay_categories")
    }
  ];
}

function createTagParentSection(group) {
  const collapsed = collapsedTagSections.has(group.key);
  const wrap = document.createElement("section");
  wrap.className = `tag-parent-section${collapsed ? " collapsed" : ""}`;
  const count = group.sections.reduce((sum, section) => sum + section.tags.length, 0);

  wrap.appendChild(createTagSectionToggle({
    key: group.key,
    title: group.title,
    count,
    collapsed,
    className: "tag-parent-title"
  }));

  if (collapsed) return wrap;

  if (group.mode === "direct") {
    const section = group.sections[0];
    wrap.appendChild(createTagButtonsBody(section?.tags || []));
    return wrap;
  }

  for (const section of group.sections) {
    wrap.appendChild(createTagChildSection(section));
  }
  return wrap;
}

function createTagChildSection(section) {
  const collapsed = collapsedTagSections.has(section.key);
  const wrap = document.createElement("section");
  wrap.className = `tag-section${collapsed ? " collapsed" : ""}`;
  wrap.appendChild(createTagSectionToggle({
    key: section.key,
    title: section.group || section.title,
    count: section.tags.length,
    collapsed,
    className: "tag-section-title"
  }));
  if (!collapsed) wrap.appendChild(createTagButtonsBody(section.tags));
  return wrap;
}

function createTagSectionToggle({ key, title, count, collapsed, className }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.innerHTML = `
    <span class="section-caret" aria-hidden="true">${collapsed ? "›" : "⌄"}</span>
    <span>${escapeHtml(title)}</span>
    <b>${count}</b>
  `;
  button.addEventListener("click", () => {
    if (collapsedTagSections.has(key)) collapsedTagSections.delete(key);
    else collapsedTagSections.add(key);
    renderTags();
  });
  return button;
}

function createTagButtonsBody(tags) {
  const body = document.createElement("div");
  body.className = "tag-buttons";
  for (const entry of tags) body.appendChild(createTagButton(entry));
  if (!tags.length) {
    const empty = document.createElement("p");
    empty.className = "subtle";
    empty.textContent = "没有匹配项";
    body.appendChild(empty);
  }
  return body;
}

function makeTagEntry(usedMap, scope, group, tag) {
  const key = `${scope}|${group || ""}|${tag}`;
  const used = usedMap.get(key);
  return {
    key,
    scope,
    group,
    tag,
    count: used?.count || 0,
    games: used?.games || [],
    label: `${scope}${group ? `.${group}` : ""}`
  };
}

function createTagButton(entry) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tag-button${selectedTagKeys.has(entry.key) ? " selected" : ""}${selectedTag?.key === entry.key ? " active" : ""}`;
  button.innerHTML = `<span>${escapeHtml(entry.tag)}</span><b>${entry.count}</b>`;
  button.title = `${entry.label} · 点击切换筛选；最后点击的 tag 是当前操作 tag`;
  button.addEventListener("click", () => {
    toggleTagSelection(entry);
  });
  return button;
}

function toggleTagSelection(entry) {
  if (selectedTagKeys.has(entry.key)) {
    selectedTagKeys.delete(entry.key);
    if (selectedTag?.key === entry.key) selectedTag = firstSelectedTagEntry();
  } else {
    selectedTagTrayKeys.add(entry.key);
    selectedTagKeys.add(entry.key);
    selectedTag = entry;
  }
    candidateSelections.clear();
    isCandidatePanelOpen = false;
    gameSearchInput.value = "";
    candidateSearchInput.value = "";
    renderAll({ resetDraft: false });
}

function firstSelectedTagEntry() {
  for (const key of selectedTagKeys) {
    const entry = findTagEntryByKey(key);
    if (entry) return entry;
  }
  return null;
}

function clearSelectedTag() {
  selectedTag = null;
  selectedTagKeys.clear();
  selectedTagTrayKeys.clear();
  candidateSelections.clear();
  isCandidatePanelOpen = false;
  candidateSearchInput.value = "";
  gameSearchInput.value = "";
  renderAll({ resetDraft: false });
}

function toggleCandidatePanel() {
  if (!selectedTag) return;
  isCandidatePanelOpen = !isCandidatePanelOpen;
  if (!isCandidatePanelOpen) {
    candidateSelections.clear();
    candidateSearchInput.value = "";
  }
  renderTagMode();
}

function closeCandidatePanel() {
  isCandidatePanelOpen = false;
  candidateSelections.clear();
  candidateSearchInput.value = "";
  renderTagMode();
}

function renderGameList() {
  if (!indexData) return;
  const keyword = gameSearchInput.value.trim().toLowerCase();
  const games = getVisibleGames().filter((game) => gameMatches(game, keyword)).sort(gameSort);
  gameList.className = "game-list";
  gameList.innerHTML = "";

  if (!games.length) {
    gameList.className = "game-list empty-state";
    gameList.textContent = selectedTagKeys.size ? "当前选中 tag 没有匹配游戏。" : "没有匹配游戏。";
    return;
  }

  for (const game of games) gameList.appendChild(createGameRow(game, selectedTagKeys.size === 1 && Boolean(selectedTag)));
}

function getVisibleGames() {
  if (!selectedTagKeys.size) return indexData.games || [];
  const selectedEntries = [...selectedTagKeys].map((key) => findTagEntryByKey(key)).filter(Boolean);
  if (!selectedEntries.length) return indexData.games || [];
  const appidSets = selectedEntries.map((entry) => new Set((entry.games || []).map((game) => Number(game.appid))));
  return (indexData.games || []).filter((game) => appidSets.every((set) => set.has(Number(game.appid))));
}

function renderCandidateList() {
  if (!selectedTag || !indexData || !isCandidatePanelOpen) return;
  const owned = new Set((selectedTag.games || []).map((game) => Number(game.appid)));
  const keyword = candidateSearchInput.value.trim().toLowerCase();
  const candidates = indexData.games
    .filter((game) => !owned.has(Number(game.appid)))
    .filter((game) => gameMatches(game, keyword))
    .sort(gameSort)
    .slice(0, 80);

  candidateSelections = new Set([...candidateSelections].filter((appid) => !owned.has(Number(appid))));
  candidateList.innerHTML = "";

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "candidate-empty";
    empty.textContent = keyword ? "没有可加入的匹配游戏。" : "所有游戏都已拥有当前 tag。";
    candidateList.appendChild(empty);
    updateAddSelectedButton();
    return;
  }

  for (const game of candidates) candidateList.appendChild(createCandidateRow(game));
  updateAddSelectedButton();
}

function createCandidateRow(game) {
  const label = document.createElement("label");
  label.className = "candidate-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = game.appid;
  checkbox.checked = candidateSelections.has(Number(game.appid));
  checkbox.addEventListener("change", () => {
    const appid = Number(game.appid);
    if (checkbox.checked) candidateSelections.add(appid);
    else candidateSelections.delete(appid);
    updateAddSelectedButton();
  });

  const info = document.createElement("span");
  info.className = "candidate-info";
  const title = document.createElement("strong");
  title.textContent = `${game.rank}. ${game.name}`;
  const metaText = document.createElement("span");
  metaText.textContent = formatGameMeta(game);
  const tags = document.createElement("span");
  tags.className = "candidate-tags";
  tags.textContent = formatGameTagSummary(game);
  info.appendChild(title);
  info.appendChild(metaText);
  info.appendChild(tags);

  label.appendChild(checkbox);
  label.appendChild(info);
  return label;
}

function updateAddSelectedButton() {
  const count = candidateSelections.size;
  addGameToTagBtn.disabled = !selectedTag || count === 0;
  addGameToTagBtn.textContent = count ? `加入 ${count} 个游戏并写回` : "加入选中游戏并写回";
}

function createGameRow(game, showRemove) {
  const row = document.createElement("div");
  row.className = `game-row${Number(selectedAppid) === Number(game.appid) ? " selected" : ""}`;
  row.addEventListener("click", async () => {
    await selectGame(game.appid);
  });

  const info = document.createElement("div");
  info.className = "game-row-info";
  const title = document.createElement("strong");
  title.textContent = `${game.rank}. ${game.name}`;
  const metaText = document.createElement("span");
  metaText.textContent = formatGameMeta(game);
  info.appendChild(title);
  info.appendChild(metaText);
  row.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "game-row-actions";
  actions.appendChild(createExternalGameLink("Steam", `https://store.steampowered.com/app/${game.appid}/`, "steam"));
  actions.appendChild(createExternalGameLink("Reports", `./report.html?appid=${encodeURIComponent(game.appid)}`, "reports"));

  if (showRemove) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "link-danger";
    remove.textContent = "移除并写回";
    remove.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      await updateTagMembership("remove", [game.appid]);
    });
    actions.appendChild(remove);
  }
  row.appendChild(actions);
  return row;
}

function createExternalGameLink(label, href, kind = "") {
  const link = document.createElement("a");
  link.className = `game-action-link${kind ? ` ${kind}-link` : ""}`;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = `在新标签页打开 ${label}`;
  link.textContent = label;
  link.addEventListener("click", (evt) => {
    evt.stopPropagation();
  });
  return link;
}

async function selectGame(appid) {
  if (Number(selectedAppid) === Number(appid)) return;
  if (!(await confirmDiscardDraft("切换游戏会丢弃当前游戏未保存的改动。"))) return;
  selectedAppid = Number(appid);
  draftGame = null;
  savedDraftSnapshot = "";
  renderGameList();
  renderGameDetail(true);
}

function renderGameDetail(resetDraft = false) {
  const game = selectedAppid ? getGame(selectedAppid) : null;
  if (!game) {
    clearSelectedGameDraft();
    saveGameBtn.disabled = true;
    saveGameBtn.textContent = "保存游戏";
    gameDetail.className = "game-detail empty-state";
    gameDetail.textContent = "选择一个游戏后编辑它的检索字段。";
    return;
  }
  if (resetDraft || !draftGame || Number(draftGame.appid) !== Number(game.appid)) {
    draftGame = cloneGame(game);
    savedDraftSnapshot = snapshotGame(draftGame);
  }
  gameDetail.className = "game-detail";
  gameDetail.innerHTML = "";

  const header = document.createElement("div");
  header.className = "detail-title";
  header.innerHTML = `<strong>${escapeHtml(game.rank)}. ${escapeHtml(game.name)}</strong><span>${escapeHtml(
    String(game.appid)
  )}</span>`;
  gameDetail.appendChild(header);

  gameDetail.appendChild(createNotesEditor(draftGame));
  gameDetail.appendChild(createDetailTagTree());
  gameDetail.appendChild(createStatusEditor(draftGame));
  updateSaveState();
}

function createDetailTagTree() {
  const wrap = document.createElement("div");
  wrap.className = "detail-tag-tree";

  wrap.appendChild(createDetailParentSection({
    key: "detail|parent|best_for",
    title: "best_for",
    count: (draftGame.best_for || []).length,
    body: createTagEditor("best_for", null, draftGame.best_for || [])
  }));

  const tagGroups = Object.keys(indexData.vocabulary.tag_taxonomy || {});
  wrap.appendChild(createDetailParentSection({
    key: "detail|parent|tags",
    title: "tags",
    count: countDraftTagsInGroups("tags", tagGroups),
    body: createDetailGroupedSections("tags", tagGroups)
  }));

  const categoryGroups = Object.keys(indexData.vocabulary.gameplay_category_taxonomy || {});
  wrap.appendChild(createDetailParentSection({
    key: "detail|parent|gameplay_categories",
    title: "gameplay_categories",
    count: countDraftTagsInGroups("gameplay_categories", categoryGroups),
    body: createDetailGroupedSections("gameplay_categories", categoryGroups)
  }));

  return wrap;
}

function createDetailParentSection({ key, title, count, body }) {
  const collapsed = collapsedDetailSections.has(key);
  const wrap = document.createElement("section");
  wrap.className = `tag-parent-section detail-parent-section${collapsed ? " collapsed" : ""}`;
  wrap.appendChild(createDetailSectionToggle({ key, title, count, collapsed, className: "tag-parent-title" }));
  if (!collapsed) wrap.appendChild(body);
  return wrap;
}

function createDetailGroupedSections(scope, groups) {
  const body = document.createElement("div");
  body.className = "detail-grouped-sections";
  for (const group of groups) {
    body.appendChild(createDetailChildSection(scope, group));
  }
  return body;
}

function createDetailChildSection(scope, group) {
  const key = `detail|${scope}|${group || ""}`;
  const collapsed = collapsedDetailSections.has(key);
  const values = getDraftValues(scope, group);
  const wrap = document.createElement("section");
  wrap.className = `tag-section detail-child-section${collapsed ? " collapsed" : ""}`;
  wrap.appendChild(createDetailSectionToggle({
    key,
    title: group || scope,
    count: values.length,
    collapsed,
    className: "tag-section-title"
  }));
  if (!collapsed) wrap.appendChild(createTagEditor(scope, group, values));
  return wrap;
}

function createDetailSectionToggle({ key, title, count, collapsed, className }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-expanded", String(!collapsed));
  button.innerHTML = `
    <span class="section-caret" aria-hidden="true">${collapsed ? "›" : "⌄"}</span>
    <span>${escapeHtml(title)}</span>
    <b>${count}</b>
  `;
  button.addEventListener("click", () => {
    if (collapsedDetailSections.has(key)) collapsedDetailSections.delete(key);
    else collapsedDetailSections.add(key);
    renderGameDetail(false);
  });
  return button;
}

function countDraftTagsInGroups(scope, groups) {
  if (scope === "tags") {
    return groups.reduce((sum, group) => sum + (draftGame.tags?.[group] || []).length, 0);
  }
  if (scope === "gameplay_categories") {
    return groups.reduce((sum, group) => sum + getDraftValues("gameplay_categories", group).length, 0);
  }
  return draftGame.best_for?.length || 0;
}

function createTagEditor(scope, group, values) {
  const section = document.createElement("section");
  section.className = "detail-section";

  const chips = document.createElement("div");
  chips.className = "chip-list";
  for (const tag of values) chips.appendChild(createDraftChip(scope, group, tag));
  if (!values.length) {
    const empty = document.createElement("span");
    empty.className = "subtle";
    empty.textContent = "暂无";
    chips.appendChild(empty);
  }
  section.appendChild(chips);

  const controls = document.createElement("div");
  controls.className = "inline-controls";
  const select = document.createElement("select");
  const vocab = getVocabularyFor(scope, group).filter((tag) => !values.includes(tag));
  for (const tag of vocab) {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    select.appendChild(option);
  }
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "添加到草稿";
  add.disabled = !vocab.length;
  add.addEventListener("click", () => {
    if (!select.value) return;
    const current = getDraftValues(scope, group);
    setDraftValues(scope, group, [...current, select.value]);
    renderGameDetail(false);
  });
  controls.appendChild(select);
  controls.appendChild(add);
  section.appendChild(controls);
  return section;
}

function createDraftChip(scope, group, tag) {
  const entry = findTagEntry(scope, group, tag);
  const count = entry?.count ?? countGamesWithTag(scope, group, tag);
  const chip = document.createElement("span");
  chip.className = `chip draft-chip${entry && selectedTagKeys.has(entry.key) ? " selected" : ""}`;

  const label = document.createElement("button");
  label.type = "button";
  label.className = "chip-label";
  label.textContent = tag;
  label.title = entry ? "点击在左侧 Tags 中选中/取消该标签" : "该标签未在左侧词表中找到";
  label.addEventListener("click", () => {
    if (!entry) {
      showToast("没有找到对应的左侧 tag", true);
      return;
    }
    toggleTagSelection(entry);
  });

  const countBadge = document.createElement("b");
  countBadge.className = "tag-count";
  countBadge.textContent = count;
  countBadge.title = `${count} 个游戏拥有这个 tag`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chip-remove";
  remove.textContent = "×";
  remove.title = "从当前游戏草稿中移除此 tag；需要点击“保存游戏”才会写回";
  remove.setAttribute("aria-label", `从当前游戏草稿中移除 ${tag}`);
  remove.addEventListener("click", () => {
    const current = getDraftValues(scope, group);
    setDraftValues(scope, group, current.filter((item) => item !== tag));
    if (entry && selectedTagKeys.has(entry.key)) {
      selectedTagKeys.delete(entry.key);
      if (selectedTag?.key === entry.key) selectedTag = firstSelectedTagEntry();
    }
    renderAll({ resetDraft: false });
  });

  chip.appendChild(label);
  chip.appendChild(countBadge);
  chip.appendChild(remove);
  return chip;
}

function countGamesWithTag(scope, group, tag) {
  if (!indexData?.games) return 0;
  return indexData.games.filter((game) => {
    if (scope === "best_for") return (game.best_for || []).includes(tag);
    if (scope === "gameplay_categories") return (game.gameplay_categories || []).includes(tag);
    return (game.tags?.[group] || []).includes(tag);
  }).length;
}

function createNotesEditor(game) {
  const section = document.createElement("section");
  section.className = "detail-section notes-section";
  const title = document.createElement("h3");
  title.textContent = "annotation_notes";
  const notes = document.createElement("textarea");
  notes.id = "notesInput";
  notes.value = game.annotation_notes || "";
  notes.rows = 5;
  notes.addEventListener("input", () => {
    draftGame.annotation_notes = notes.value;
    updateSaveState();
  });
  section.appendChild(title);
  section.appendChild(notes);
  return section;
}

function createStatusEditor(game) {
  const section = document.createElement("section");
  section.className = "detail-section status-section";
  const title = document.createElement("h3");
  title.textContent = "annotation_status";
  const status = document.createElement("input");
  status.id = "statusInput";
  status.type = "text";
  status.placeholder = "optional workflow status";
  status.value = game.annotation_status || "";
  status.addEventListener("input", () => {
    draftGame.annotation_status = status.value;
    updateSaveState();
  });
  section.appendChild(title);
  section.appendChild(status);
  return section;
}

function getVocabularyFor(scope, group) {
  if (scope === "best_for") return indexData.vocabulary.best_for_pool || [];
  if (scope === "gameplay_categories") {
    if (group) return indexData.vocabulary.gameplay_category_taxonomy?.[group] || [];
    return Object.values(indexData.vocabulary.gameplay_category_taxonomy || {}).flat();
  }
  return indexData.vocabulary.tag_taxonomy?.[group] || [];
}

function getDraftValues(scope, group) {
  if (scope === "best_for") return draftGame.best_for || [];
  if (scope === "gameplay_categories") {
    if (!group) return draftGame.gameplay_categories || [];
    const groupTags = new Set(indexData.vocabulary.gameplay_category_taxonomy?.[group] || []);
    return (draftGame.gameplay_categories || []).filter((tag) => groupTags.has(tag));
  }
  return draftGame.tags?.[group] || [];
}

function setDraftValues(scope, group, values) {
  const next = uniqueSorted(values);
  if (scope === "best_for") draftGame.best_for = next;
  else if (scope === "gameplay_categories") {
    if (!group) {
      draftGame.gameplay_categories = next;
    } else {
      const groupTags = new Set(indexData.vocabulary.gameplay_category_taxonomy?.[group] || []);
      const otherGroups = (draftGame.gameplay_categories || []).filter((tag) => !groupTags.has(tag));
      draftGame.gameplay_categories = uniqueSorted([...otherGroups, ...next]);
    }
  }
  else {
    draftGame.tags = draftGame.tags || {};
    if (next.length) draftGame.tags[group] = next;
    else delete draftGame.tags[group];
  }
}

async function saveDraftGame() {
  if (!selectedAppid || !draftGame) return;
  syncDraftFromInputs();
  if (!hasUnsavedDraft()) {
    showToast("没有未保存改动");
    updateSaveState();
    return;
  }
  if (isGuideSandbox()) {
    notifyGuideWriteBlocked("保存游戏");
    savedDraftSnapshot = snapshotGame(draftGame);
    updateSaveState();
    return;
  }
  const body = normalizeGameForSave(draftGame);
  try {
    const payload = await api("/api/game-tags", {
      method: "POST",
      body: JSON.stringify({
        appid: selectedAppid,
        best_for: body.best_for || [],
        tags: body.tags || {},
        gameplay_categories: body.gameplay_categories || [],
        annotation_notes: body.annotation_notes,
        annotation_status: body.annotation_status
      })
    });
    applyPayload(payload, { resetDraft: true });
    showToast("游戏标签已写回 report_index.json");
  } catch (err) {
    showToast(`保存失败：${err.message}`, true);
  }
}

async function updateTagMembership(action, appids) {
  if (!selectedTag) return;
  if (isGuideSandbox()) {
    notifyGuideWriteBlocked(action === "add" ? "加入 tag" : "移除 tag");
    return;
  }
  if (!(await confirmDiscardDraft("成员变更会立即写回，并刷新当前索引。"))) return;
  try {
    const payload = await api("/api/tag-membership", {
      method: "POST",
      body: JSON.stringify({
        action,
        appids,
        scope: selectedTag.scope,
        group: selectedTag.group,
        tag: selectedTag.tag
      })
    });
    candidateSelections.clear();
    if (action === "add") {
      isCandidatePanelOpen = false;
      candidateSearchInput.value = "";
    }
    applyPayload(payload, { resetDraft: true });
    showToast(action === "add" ? "已加入 tag，并写回 report_index.json" : "已移除 tag，并写回 report_index.json");
  } catch (err) {
    showToast(`更新失败：${err.message}`, true);
  }
}

async function addSelectedGamesToTag() {
  const appids = [...candidateSelections].map(Number);
  if (!appids.length) return;
  await updateTagMembership("add", appids);
}

async function createTag() {
  const tag = newTagInput.value.trim();
  if (!tag) return;
  if (isGuideSandbox()) {
    notifyGuideWriteBlocked("新建 tag");
    return;
  }
  const target = parseTargetKey(newTagScopeSelect.value);
  try {
    const payload = await api("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify({ action: "create", scope: target.scope, group: target.group, tag })
    });
    newTagInput.value = "";
    applyPayload(payload, { resetDraft: false });
    showToast("tag 已新建并写回 report_index.json");
  } catch (err) {
    showToast(`新建失败：${err.message}`, true);
  }
}

async function renameSelectedTag() {
  if (!selectedTag) return;
  const newTag = renameTagInput.value.trim();
  if (!newTag || newTag === selectedTag.tag) return;
  if (isGuideSandbox()) {
    notifyGuideWriteBlocked("重命名 tag");
    return;
  }
  const used = selectedTag.count || 0;
  const message = `重命名 ${selectedTag.label}: ${selectedTag.tag} 为 ${newTag}，会影响 ${used} 个游戏并立即写回。继续吗？`;
  if (!confirm(message)) return;
  if (!(await confirmDiscardDraft("重命名 tag 会刷新当前索引。"))) return;
  try {
    const oldTag = selectedTag;
    const payload = await api("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify({
        action: "rename",
        scope: oldTag.scope,
        group: oldTag.group,
        tag: oldTag.tag,
        newTag
      })
    });
    applyPayload(payload, { resetDraft: true });
    selectedTagKeys.delete(oldTag.key);
    const nextKey = `${oldTag.scope}|${oldTag.group || ""}|${newTag}`;
    selectedTagKeys.add(nextKey);
    selectedTag = findTagEntryByKey(nextKey);
    renderAll({ resetDraft: true });
    showToast("tag 已重命名并写回 report_index.json");
  } catch (err) {
    showToast(`重命名失败：${err.message}`, true);
  }
}

async function deleteSelectedTag() {
  if (!selectedTag) return;
  if (isGuideSandbox()) {
    notifyGuideWriteBlocked("删除 tag");
    return;
  }
  const used = selectedTag.count || 0;
  const message = used
    ? `删除 ${selectedTag.label}: ${selectedTag.tag} 会从 ${used} 个游戏中移除该 tag，并立即写回。继续吗？`
    : `删除 ${selectedTag.label}: ${selectedTag.tag} 并立即写回。继续吗？`;
  if (!confirm(message)) return;
  if (!(await confirmDiscardDraft("删除 tag 会刷新当前索引。"))) return;
  try {
    const payload = await api("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify({
        action: "delete",
        scope: selectedTag.scope,
        group: selectedTag.group,
        tag: selectedTag.tag,
        removeFromGames: true
      })
    });
    selectedTag = null;
    selectedTagKeys.delete(selectedTag?.key);
    selectedTagKeys.clear();
    candidateSelections.clear();
    isCandidatePanelOpen = false;
    applyPayload(payload, { resetDraft: true });
    showToast("tag 已删除并写回 report_index.json");
  } catch (err) {
    showToast(`删除失败：${err.message}`, true);
  }
}

function applyPayload(payload, { resetDraft = false } = {}) {
  indexData = payload.index;
  tagToGames = payload.tagToGames;
  meta = payload.meta;
  refreshSelectedTag();
  if (selectedAppid && !getGame(selectedAppid)) clearSelectedGameDraft();
  renderAll({ resetDraft });
}

function refreshSelectedTag() {
  if (!indexData) return;
  selectedTagKeys = new Set([...selectedTagKeys].filter((key) => findTagEntryByKey(key)));
  selectedTagTrayKeys = new Set([...selectedTagTrayKeys].filter((key) => findTagEntryByKey(key)));
  if (selectedTag && !findTagEntryByKey(selectedTag.key)) selectedTag = null;
  if (selectedTag) selectedTag = findTagEntryByKey(selectedTag.key);
  if (!selectedTag && selectedTagKeys.size) selectedTag = firstSelectedTagEntry();
}

function findTagEntryByKey(key) {
  if (!indexData) return null;
  return buildTagSections()
    .flatMap((section) => section.tags)
    .find((entry) => entry.key === key) || null;
}

function findTagEntry(scope, group, tag) {
  const exactKey = `${scope}|${group || ""}|${tag}`;
  const exact = findTagEntryByKey(exactKey);
  if (exact) return exact;
  return buildTagSections()
    .flatMap((section) => section.tags)
    .find((entry) => entry.scope === scope && entry.tag === tag && (scope !== "tags" || entry.group === group)) || null;
}

function clearSelectedGameDraft() {
  selectedAppid = null;
  draftGame = null;
  savedDraftSnapshot = "";
}

function syncDraftFromInputs() {
  if (!draftGame) return;
  const notes = document.getElementById("notesInput");
  const status = document.getElementById("statusInput");
  if (notes) draftGame.annotation_notes = notes.value;
  if (status) draftGame.annotation_status = status.value;
}

async function confirmDiscardDraft(message) {
  if (!hasUnsavedDraft()) return true;
  return confirm(`${message}\n\n当前游戏有未保存改动，继续会丢弃这些改动。`);
}

function hasUnsavedDraft() {
  if (!draftGame || !selectedAppid) return false;
  syncDraftFromInputs();
  return snapshotGame(draftGame) !== savedDraftSnapshot;
}

function updateSaveState() {
  const dirty = hasUnsavedDraft();
  saveGameBtn.disabled = !dirty;
  saveGameBtn.textContent = dirty ? "保存游戏" : "已保存";
  saveGameBtn.classList.toggle("dirty", dirty);
  saveGameBtn.classList.toggle("saved", !dirty);
}

function snapshotGame(game) {
  return JSON.stringify(normalizeGameForSave(game));
}

function normalizeGameForSave(game) {
  const tags = {};
  for (const [group, values] of Object.entries(game.tags || {})) {
    const next = uniqueSorted(values);
    if (next.length) tags[group] = next;
  }
  return {
    appid: Number(game.appid),
    best_for: uniqueSorted(game.best_for || []),
    tags,
    gameplay_categories: uniqueSorted(game.gameplay_categories || []),
    annotation_notes: String(game.annotation_notes || "").trim(),
    annotation_status: String(game.annotation_status || "").trim()
  };
}

function getGame(appid) {
  return indexData?.games?.find((game) => Number(game.appid) === Number(appid));
}

function cloneGame(game) {
  return JSON.parse(JSON.stringify(game));
}

function gameSort(a, b) {
  const rankA = Number(a.rank || 0);
  const rankB = Number(b.rank || 0);
  if (rankA !== rankB) return rankA - rankB;
  return Number(a.appid || 0) - Number(b.appid || 0);
}

function gameMatches(game, keyword) {
  if (!keyword) return true;
  const searchable = [
    game.rank,
    game.name,
    game.appid,
    game.report_dir,
    game.annotation_status,
    game.annotation_notes
  ].join(" ");
  return searchable.toLowerCase().includes(keyword);
}

function formatGameTagSummary(game) {
  let values = [];
  if (selectedTag?.scope === "best_for") values = game.best_for || [];
  else if (selectedTag?.scope === "gameplay_categories") values = game.gameplay_categories || [];
  else if (selectedTag?.scope === "tags") values = game.tags?.[selectedTag.group] || [];
  if (!values.length) return "当前字段暂无 tag";
  return `当前字段：${values.join(", ")}`;
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
}

function formatRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return `${(num * 100).toFixed(1)}%`;
}

function formatGameMeta(game) {
  return `${game.appid} · ${formatReleaseYear(game.release_date)} · ${formatRate(game.positive_rate)} · ${formatNumber(game.reviews)} reviews`;
}

function formatReleaseYear(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})/);
  return match ? match[1] : "year n/a";
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "n/a";
  return num.toLocaleString("en-US");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast${isError ? " error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.className = "toast hidden";
  }, 2400);
}

function getGuideState() {
  const game = selectedAppid ? getGame(selectedAppid) : null;
  const renameBaseline = selectedTag?.tag || "";
  syncDraftFromInputs();
  const draftNorm = draftGame ? normalizeGameForSave(draftGame) : null;
  const gameNorm = game ? normalizeGameForSave(game) : null;
  const tagSnapshot = (payload) =>
    JSON.stringify({
      best_for: payload?.best_for || [],
      tags: payload?.tags || {},
      gameplay_categories: payload?.gameplay_categories || []
    });
  return {
    selectedTagKeysSize: selectedTagKeys.size,
    selectedAppid,
    hasSelectedGame: Boolean(selectedAppid),
    tagSearchValue: tagSearchInput.value.trim(),
    gameSearchValue: gameSearchInput.value.trim(),
    candidateSearchValue: candidateSearchInput.value.trim(),
    isCandidatePanelOpen,
    candidateSelectionCount: candidateSelections.size,
    newTagInputValue: newTagInput.value.trim(),
    renameInputDirty: renameTagInput.value.trim() !== renameBaseline && renameTagInput.value.trim().length > 0,
    notesDirty:
      Boolean(game && draftGame) &&
      String(draftGame.annotation_notes || "").trim() !== String(game.annotation_notes || "").trim(),
    draftTagsDirty: Boolean(draftNorm && gameNorm) && tagSnapshot(draftNorm) !== tagSnapshot(gameNorm),
    hasUnsavedDraft: hasUnsavedDraft(),
    isDarkMode: document.body.classList.contains("dark-mode"),
    trayVisible: !selectedTagTray.classList.contains("hidden")
  };
}

function clickFirstTagButton() {
  document.querySelector(".tag-pane .tag-button")?.click();
}

function ensureAllGamesView() {
  if (selectedTagKeys.size) clearSelectedTag();
}

function ensureSingleTagSelected() {
  if (selectedTagKeys.size === 1) return;
  clearSelectedTag();
  clickFirstTagButton();
}

function ensureSingleTagWithGames() {
  ensureSingleTagSelected();
  if (!getVisibleGames().length) {
    const entry = firstSelectedTagEntry();
    if (entry?.games?.length) return;
    const withGames = buildTagSections()
      .flatMap((section) => section.tags)
      .find((item) => (item.count || 0) > 0);
    if (withGames) {
      clearSelectedTag();
      toggleTagSelection(withGames);
    }
  }
}

function ensureClearTagVisible() {
  if (selectedTagKeys.size === 0) clickFirstTagButton();
}

function ensureGameSelected() {
  if (selectedAppid) return;
  const games = getVisibleGames();
  if (!games.length) return;
  selectedAppid = Number(games[0].appid);
  draftGame = null;
  savedDraftSnapshot = "";
  renderGameList();
  renderGameDetail(true);
}

function ensureCandidatePanelOpen() {
  ensureSingleTagSelected();
  if (!isCandidatePanelOpen) toggleCandidatePanel();
}

function prepareCandidateSelectionStep() {
  ensureCandidatePanelOpen();
  candidateSearchInput.value = "";
  renderCandidateList();
}

function ensureGameListVisible() {
  ensureAllGamesView();
  if (!document.querySelector("#gameList .game-row")) ensureGameSelected();
}

function resetGameDraft() {
  clearSelectedGameDraft();
  renderGameList();
  renderGameDetail(true);
}

function clearTagSearch() {
  tagSearchInput.value = "";
  renderTags();
}

window.initReportIndexGuide?.({
  getState: getGuideState,
  showToast,
  ensureAllGamesView,
  ensureSingleTagSelected,
  ensureSingleTagWithGames,
  ensureClearTagVisible,
  ensureGameSelected,
  ensureCandidatePanelOpen,
  ensureGameListVisible,
  resetGameDraft,
  clearTagSearch,
  prepareCandidateSelectionStep,
  prepareGuideSandbox: () => loadIndex(true, { silent: true })
});
