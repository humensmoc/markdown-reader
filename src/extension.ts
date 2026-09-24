import * as path from "path";
import * as vscode from "vscode";
import { updateReadingHighlight, type HighlightMessage } from "./readingHighlights";
import { LiveDocument, type LiveMessage } from "./liveDocument";
import { normalizeText } from "./textChanges";
import { locateImage, resolveVaultRoot } from "./reportData";

type ViewerMessage =
  | LiveMessage
  | { type: "resolveImage"; href: string }
  | HighlightMessage
  | { type: "ready" }
  | { type: "requestReaderSettings" }
  | { type: "requestReaderStyle" }
  | { type: "saveReaderStyle"; settings?: unknown }
  | { type: "openExternal"; href?: string }
  | { type: "openFile"; href?: string }
  | { type: "setAutoOpenReaderMode"; enabled?: boolean }
  | {
      type: "addAnnotation";
      selectedText?: string;
      comment?: string;
      lineStart?: number;
      lineEnd?: number;
      heading?: string;
      anchor?: string;
    }
  | { type: "updateAnnotation"; annotationId?: string; comment?: string; status?: "open" | "pending_review" }
  | { type: "resolveAnnotation"; annotationId?: string }
  | { type: "deleteAnnotation"; annotationId?: string }
  | { type: "normalizeAnnotations"; annotationIds?: string[] }
  | { type: "requestReload" };

const READER_VIEW_TYPE = "meowReportMarkdown.viewer";
const readerWebviews = new Set<vscode.Webview>();
let activeReaderWebview: vscode.Webview | undefined;
const textModeUris = new Set<string>();
const readerIntentUris = new Set<string>();
const openInReaderModeInflight = new Map<string, Promise<void>>();
const extensionActivatedAt = Date.now();
const STARTUP_GRACE_MS = 1200;

function buildAnnotationAiGuide(eol: string): string {
  return [
    "<!-- mr-annotation:ai-guide",
    'AI 操作指南：批注状态为 open（待处理）、pending_review（待验收）、resolved（已解决）。只处理 status 为 open 的批注；pending_review 等待用户验收，resolved 已归档，不要主动处理。',
    '按最新批注要求修改正文后，对比修改前后的内容；在原批注元数据写入 change_quotes JSON 字符串数组，逐项记录所有与该批注要求直接相关的实际新增或改写正文。每一项都应能在修改后正文中精确匹配，并包含足够上下文以便唯一定位；不要填写未改动的上下文、原批注选文或无关调整。旧版 change_quote 字段仍可读取；写入 change_quotes 时移除旧 change_quote，避免高亮过期内容。',
    '在批注末尾的 **AI 回复：** 下说明本轮改动，然后将 status 改为 "pending_review"。未完成处理时保持 "open" 并说明原因。禁止将 status 写成 "resolved" 或写入 resolved_at；只有用户点击“确认解决”才表示验收通过。保留批注 ID、原始选文和用户批注。',
    '用户验收不通过时，会在编辑批注中补充要求并将 status 改回 "open"。已有 AI 回复仅作为上轮参考；按最新要求重新处理，更新 change_quotes 和 AI 回复以反映本轮结果，完成后再次设为 "pending_review"。',
    "-->"
  ].join(eol);
}

type ReaderStyleSettings = {
  bodyFontSize: number;
  lineHeight: number;
  contentWidth: number;
  tocFontSize: number;
  paragraphSpacing: number;
  listItemSpacing: number;
  flatHeadingSize: number;
  h1Size: number;
  h2Size: number;
  h3Size: number;
  h4Size: number;
  h5Size: number;
  h6Size: number;
  h1MarginTop: number;
  h2MarginTop: number;
  h3MarginTop: number;
  h4MarginTop: number;
  h5MarginTop: number;
  h6MarginTop: number;
  h1MarginBottom: number;
  headingMarginBottom: number;
};

const DEFAULT_READER_STYLE: ReaderStyleSettings = {
  bodyFontSize: 16,
  lineHeight: 1.5,
  contentWidth: 700,
  tocFontSize: 13,
  paragraphSpacing: 16,
  listItemSpacing: 4.8,
  flatHeadingSize: 23,
  h1Size: 28,
  h2Size: 24,
  h3Size: 21,
  h4Size: 18,
  h5Size: 16,
  h6Size: 15,
  h1MarginTop: 0,
  h2MarginTop: 38,
  h3MarginTop: 32,
  h4MarginTop: 28,
  h5MarginTop: 24,
  h6MarginTop: 24,
  h1MarginBottom: 24,
  headingMarginBottom: 12
};

function normalizeStyleNumber(
  source: Record<string, unknown>,
  key: keyof ReaderStyleSettings,
  min: number,
  max: number,
  precision = 1
): number {
  const candidate = Number(source[key]);
  const fallback = DEFAULT_READER_STYLE[key];
  const bounded = Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : fallback;
  const factor = 10 ** precision;
  return Math.round(bounded * factor) / factor;
}

function normalizeReaderStyle(value: unknown): ReaderStyleSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    bodyFontSize: normalizeStyleNumber(source, "bodyFontSize", 12, 24),
    lineHeight: normalizeStyleNumber(source, "lineHeight", 1.2, 2, 2),
    contentWidth: normalizeStyleNumber(source, "contentWidth", 480, 1200, 0),
    tocFontSize: normalizeStyleNumber(source, "tocFontSize", 10, 20),
    paragraphSpacing: normalizeStyleNumber(source, "paragraphSpacing", 0, 32),
    listItemSpacing: normalizeStyleNumber(source, "listItemSpacing", 0, 20),
    flatHeadingSize: normalizeStyleNumber(source, "flatHeadingSize", 14, 36),
    h1Size: normalizeStyleNumber(source, "h1Size", 18, 48),
    h2Size: normalizeStyleNumber(source, "h2Size", 16, 40),
    h3Size: normalizeStyleNumber(source, "h3Size", 14, 36),
    h4Size: normalizeStyleNumber(source, "h4Size", 13, 32),
    h5Size: normalizeStyleNumber(source, "h5Size", 12, 28),
    h6Size: normalizeStyleNumber(source, "h6Size", 12, 28),
    h1MarginTop: normalizeStyleNumber(source, "h1MarginTop", 0, 80),
    h2MarginTop: normalizeStyleNumber(source, "h2MarginTop", 0, 80),
    h3MarginTop: normalizeStyleNumber(source, "h3MarginTop", 0, 80),
    h4MarginTop: normalizeStyleNumber(source, "h4MarginTop", 0, 80),
    h5MarginTop: normalizeStyleNumber(source, "h5MarginTop", 0, 80),
    h6MarginTop: normalizeStyleNumber(source, "h6MarginTop", 0, 80),
    h1MarginBottom: normalizeStyleNumber(source, "h1MarginBottom", 0, 48),
    headingMarginBottom: normalizeStyleNumber(source, "headingMarginBottom", 0, 48)
  };
}

interface GitChangeState {
  uri: vscode.Uri;
}

interface GitRepository {
  state: {
    workingTreeChanges: GitChangeState[];
    indexChanges: GitChangeState[];
  };
}

interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markReaderIntent(uri: vscode.Uri): void {
  readerIntentUris.add(uri.toString());
}

function hasReaderIntent(uri: vscode.Uri): boolean {
  return readerIntentUris.has(uri.toString());
}

function consumeReaderIntent(uri: vscode.Uri): boolean {
  const key = uri.toString();
  if (!readerIntentUris.has(key)) {
    return false;
  }
  readerIntentUris.delete(key);
  return true;
}

async function isFileInGitChanges(uri: vscode.Uri): Promise<boolean> {
  if (uri.scheme !== "file") {
    return false;
  }

  const gitExtension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>("vscode.git");
  if (!gitExtension) {
    return false;
  }
  if (!gitExtension.isActive) {
    try {
      await gitExtension.activate();
    } catch {
      return false;
    }
  }

  const repo = gitExtension.exports.getAPI(1).getRepository(uri);
  if (!repo) {
    return false;
  }

  return [...repo.state.workingTreeChanges, ...repo.state.indexChanges].some(
    (change) => change.uri.fsPath === uri.fsPath
  );
}

function findReaderTab(uri: vscode.Uri): vscode.Tab | undefined {
  const uriStr = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === READER_VIEW_TYPE &&
        tab.input.uri.toString() === uriStr
      ) {
        return tab;
      }
    }
  }
  return undefined;
}

function resolveOpenColumn(): vscode.ViewColumn {
  return vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
}

function isCursorAssertionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Assertion Failed|undefined|null/i.test(message);
}

function findTextTabsForUri(uri: vscode.Uri): vscode.Tab[] {
  const uriStr = uri.toString();
  const tabs: vscode.Tab[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uriStr) {
        tabs.push(tab);
      }
    }
  }
  return tabs;
}

async function closeDuplicateTextTab(uri: vscode.Uri): Promise<void> {
  if (!hasReaderModeTab(uri)) {
    return;
  }

  for (const tab of findTextTabsForUri(uri)) {
    try {
      await vscode.window.tabGroups.close(tab);
    } catch {
      // Ignore close failures.
    }
  }
}

async function openWithReader(uri: vscode.Uri, column: vscode.ViewColumn): Promise<void> {
  await vscode.commands.executeCommand("vscode.openWith", uri, READER_VIEW_TYPE, [
    column,
    { pinned: true }
  ]);
}

async function openInReaderModeInternal(uri: vscode.Uri): Promise<void> {
  if (hasReaderModeTab(uri)) {
    await openWithReader(uri, resolveOpenColumn());
    await closeDuplicateTextTab(uri);
    return;
  }

  // Cursor requires the backing TextDocument to exist before CustomTextEditor
  // can open ("Assertion Failed: Argument is `undefined` or `null`").
  await vscode.workspace.openTextDocument(uri);
  const column = resolveOpenColumn();

  const delays = [0, 200, 500, 900];
  let lastError: unknown;
  let usedTextTabFallback = false;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    const delayMs = delays[attempt];
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      await openWithReader(uri, column);
      await closeDuplicateTextTab(uri);
      return;
    } catch (error) {
      lastError = error;
      if (!usedTextTabFallback && isCursorAssertionError(error) && attempt < delays.length - 1) {
        usedTextTabFallback = true;
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: true,
          viewColumn: column
        });
        await sleep(150);
      }
    }
  }

  throw lastError;
}

/**
 * Resource roots the reader webview may load local files from. Besides the bundled `media`
 * folder this must include the document folder, its Obsidian vault / workspace root and every
 * workspace folder, otherwise relative image paths in the Markdown resolve to blocked URIs.
 */
function buildLocalResourceRoots(extensionUri: vscode.Uri, documentUri: vscode.Uri): vscode.Uri[] {
  const roots: vscode.Uri[] = [vscode.Uri.joinPath(extensionUri, "media")];
  const seen = new Set(roots.map((root) => root.toString()));

  const addRoot = (dir: string | undefined): void => {
    if (!dir) return;
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.file(dir);
    } catch {
      return;
    }
    const key = uri.toString();
    if (!seen.has(key)) {
      seen.add(key);
      roots.push(uri);
    }
  };

  const documentDir = path.dirname(documentUri.fsPath);
  addRoot(documentDir);

  const folder = vscode.workspace.getWorkspaceFolder(documentUri);
  addRoot(folder?.uri.fsPath);
  addRoot(resolveVaultRoot(documentDir, folder?.uri.fsPath));
  for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
    addRoot(workspaceFolder.uri.fsPath);
  }

  return roots;
}

async function openInReaderMode(uri: vscode.Uri): Promise<void> {
  const key = uri.toString();
  const inflight = openInReaderModeInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = openInReaderModeInternal(uri).finally(() => {
    openInReaderModeInflight.delete(key);
  });
  openInReaderModeInflight.set(key, promise);
  return promise;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ReportMarkdownEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(READER_VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(vscode.commands.registerCommand("meowReportMarkdown.toggleSource", () => {
    void activeReaderWebview?.postMessage({ type: "toggleSource" });
  }));

  context.subscriptions.push(
    vscode.commands.registerCommand("meowReportMarkdown.openPreview", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        return;
      }
      textModeUris.delete(target.toString());
      markReaderIntent(target);
      await openInReaderMode(target);
    })
  );

  setupAutoOpenReaderMode(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("meowReportMarkdown.autoOpenReaderMode")) {
        void broadcastReaderSettings();
      }
    })
  );

  setTimeout(() => {
    void reconcileRestoredReaderTabs();
  }, 600);
}

function isAutoOpenEnabled(): boolean {
  return vscode.workspace.getConfiguration("meowReportMarkdown").get<boolean>("autoOpenReaderMode", false);
}

async function setAutoOpenReaderMode(enabled: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("meowReportMarkdown")
    .update("autoOpenReaderMode", enabled, vscode.ConfigurationTarget.Global);
}

function readerSettingsMessage(): { type: "settings"; autoOpenReaderMode: boolean } {
  return {
    type: "settings",
    autoOpenReaderMode: isAutoOpenEnabled()
  };
}

async function postReaderSettings(webview: vscode.Webview): Promise<void> {
  await webview.postMessage(readerSettingsMessage());
}

function registerReaderWebview(webview: vscode.Webview): void {
  readerWebviews.add(webview);
}

function unregisterReaderWebview(webview: vscode.Webview): void {
  readerWebviews.delete(webview);
}

async function broadcastReaderSettings(): Promise<void> {
  const message = readerSettingsMessage();
  for (const webview of readerWebviews) {
    try {
      await webview.postMessage(message);
    } catch {
      // Webview may already be disposed.
    }
  }
}

function hasReaderModeTab(uri: vscode.Uri): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => {
      if (!(tab.input instanceof vscode.TabInputCustom)) {
        return false;
      }
      return tab.input.viewType === READER_VIEW_TYPE && tab.input.uri.toString() === uri.toString();
    })
  );
}

function tabLabelText(tab: vscode.Tab): string {
  const label = tab.label;
  if (typeof label === "string") {
    return label;
  }
  if (label && typeof label === "object" && "label" in label) {
    return String((label as { label: string }).label);
  }
  return "";
}

function uriMatchesDiffSide(diffUri: vscode.Uri, target: vscode.Uri): boolean {
  if (diffUri.toString() === target.toString()) {
    return true;
  }
  if (diffUri.scheme === "file" && target.scheme === "file") {
    return diffUri.fsPath === target.fsPath;
  }
  if (diffUri.scheme === "git" && target.scheme === "file") {
    return diffUri.fsPath === target.fsPath || diffUri.path.endsWith(target.fsPath);
  }
  return false;
}

function isUriInDiffEditor(uri: vscode.Uri): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => {
      const input = tab.input;
      if (input instanceof vscode.TabInputTextDiff) {
        return uriMatchesDiffSide(input.original, uri) || uriMatchesDiffSide(input.modified, uri);
      }
      return false;
    })
  );
}

function isLikelyGitChangeTab(tab: vscode.Tab, uri: vscode.Uri): boolean {
  if (isUriInDiffEditor(uri)) {
    return true;
  }

  const label = tabLabelText(tab);
  if (/Working Tree|\(Index\)|\(HEAD\)|↔| — /.test(label)) {
    return true;
  }

  return false;
}

function eventOpenedDiffForUri(opened: readonly vscode.Tab[], uri: vscode.Uri): boolean {
  return opened.some((tab) => {
    const input = tab.input;
    if (!(input instanceof vscode.TabInputTextDiff)) {
      return false;
    }
    return uriMatchesDiffSide(input.modified, uri) || uriMatchesDiffSide(input.original, uri);
  });
}

function shouldSuppressReaderMode(uri: vscode.Uri, tab?: vscode.Tab): boolean {
  if (textModeUris.has(uri.toString())) {
    return true;
  }
  if (isUriInDiffEditor(uri)) {
    return true;
  }
  if (tab && isLikelyGitChangeTab(tab, uri)) {
    return true;
  }
  return false;
}

async function shouldSuppressReaderModeAsync(uri: vscode.Uri, tab?: vscode.Tab): Promise<boolean> {
  if (shouldSuppressReaderMode(uri, tab)) {
    return true;
  }
  if (tab?.isPreview && (await isFileInGitChanges(uri))) {
    return true;
  }
  return false;
}

async function revertToTextOrGitDiff(uri: vscode.Uri, tab?: vscode.Tab): Promise<void> {
  textModeUris.add(uri.toString());

  if (tab) {
    try {
      await vscode.window.tabGroups.close(tab);
    } catch {
      // Ignore close failures.
    }
  }

  try {
    await vscode.commands.executeCommand("git.openChange", uri);
    return;
  } catch {
    // Fall back to plain text editor when git command is unavailable.
  }

  await vscode.commands.executeCommand("vscode.openWith", uri, "default");
}

async function handleReaderTabOpened(uri: vscode.Uri, tab: vscode.Tab): Promise<void> {
  if (consumeReaderIntent(uri)) {
    return;
  }
  if (await shouldSuppressReaderModeAsync(uri, tab)) {
    await revertToTextOrGitDiff(uri, tab);
  }
}

async function reconcileRestoredReaderTabs(): Promise<void> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputCustom)) {
        continue;
      }
      if (tab.input.viewType !== READER_VIEW_TYPE) {
        continue;
      }

      const uri = tab.input.uri;
      if (!uri.fsPath.toLowerCase().endsWith(".md")) {
        continue;
      }
      if (hasReaderIntent(uri)) {
        continue;
      }
      if (await shouldSuppressReaderModeAsync(uri, tab)) {
        await revertToTextOrGitDiff(uri, tab);
      }
    }
  }
}

async function maybeAutoOpenReaderMode(uri: vscode.Uri): Promise<void> {
  if (!isAutoOpenEnabled()) {
    return;
  }
  if (uri.scheme !== "file") {
    return;
  }
  if (!uri.fsPath.toLowerCase().endsWith(".md")) {
    return;
  }
  if (textModeUris.has(uri.toString())) {
    return;
  }
  if (hasReaderModeTab(uri)) {
    return;
  }
  if (isUriInDiffEditor(uri)) {
    textModeUris.add(uri.toString());
    return;
  }

  const startupWait = Math.max(0, STARTUP_GRACE_MS - (Date.now() - extensionActivatedAt));
  if (startupWait > 0) {
    await sleep(startupWait);
  }

  for (const delay of [0, 200, 400]) {
    if (delay > 0) {
      await sleep(delay);
    }
    if (isUriInDiffEditor(uri)) {
      textModeUris.add(uri.toString());
      return;
    }
    if (await isFileInGitChanges(uri)) {
      const tab = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .find(
          (candidate) =>
            candidate.input instanceof vscode.TabInputText && candidate.input.uri.toString() === uri.toString()
        );
      if (tab?.isPreview) {
        textModeUris.add(uri.toString());
        return;
      }
    }
  }

  markReaderIntent(uri);
  try {
    await openInReaderMode(uri);
  } catch {
    readerIntentUris.delete(uri.toString());
    // Ignore auto-open failures; user can reopen via Open With or explorer context menu.
  }
}

function setupAutoOpenReaderMode(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const closed of event.closed) {
        if (!(closed.input instanceof vscode.TabInputCustom)) {
          continue;
        }
        if (closed.input.viewType !== READER_VIEW_TYPE) {
          continue;
        }

        const uri = closed.input.uri.toString();
        const openedText = event.opened.find(
          (tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri
        );
        if (openedText) {
          textModeUris.add(uri);
        }
      }

      for (const opened of event.opened) {
        if (opened.input instanceof vscode.TabInputTextDiff) {
          textModeUris.add(opened.input.modified.toString());
          continue;
        }

        if (opened.input instanceof vscode.TabInputCustom && opened.input.viewType === READER_VIEW_TYPE) {
          const uri = opened.input.uri;
          if (uri.fsPath.toLowerCase().endsWith(".md")) {
            setTimeout(() => {
              void handleReaderTabOpened(uri, opened);
            }, 0);
          }
          continue;
        }

        if (!(opened.input instanceof vscode.TabInputText)) {
          continue;
        }
        if (!opened.input.uri.fsPath.toLowerCase().endsWith(".md")) {
          continue;
        }

        const uri = opened.input.uri;
        const fromReader = event.closed.some(
          (tab) =>
            tab.input instanceof vscode.TabInputCustom &&
            tab.input.viewType === READER_VIEW_TYPE &&
            tab.input.uri.toString() === uri.toString()
        );
        if (fromReader) {
          textModeUris.add(uri.toString());
          continue;
        }

        if (eventOpenedDiffForUri(event.opened, uri) || isLikelyGitChangeTab(opened, uri)) {
          textModeUris.add(uri.toString());
          continue;
        }

        if (opened.isPreview) {
          void isFileInGitChanges(uri).then((inGitChanges) => {
            if (inGitChanges) {
              textModeUris.add(uri.toString());
              return;
            }
            setTimeout(() => {
              void maybeAutoOpenReaderMode(uri);
            }, 400);
          });
          continue;
        }

        setTimeout(() => {
          void maybeAutoOpenReaderMode(uri);
        }, 400);
      }
    })
  );
}

export class ReportMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const uri = document.uri;
    const tab = findReaderTab(uri);

    if (!hasReaderIntent(uri)) {
      if (await shouldSuppressReaderModeAsync(uri, tab)) {
        textModeUris.add(uri.toString());
        setTimeout(() => {
          void revertToTextOrGitDiff(uri, tab);
        }, 0);
        return;
      }
    } else {
      consumeReaderIntent(uri);
    }

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: buildLocalResourceRoots(this.context.extensionUri, document.uri)
    };
    registerReaderWebview(webviewPanel.webview);
    activeReaderWebview = webviewPanel.webview;
    const viewStateSub = webviewPanel.onDidChangeViewState(e => { if (e.webviewPanel.active) activeReaderWebview = e.webviewPanel.webview; });

    let disposed = false;
    const postToWebview = async (message: unknown): Promise<void> => {
      if (disposed) {
        return;
      }
      try {
        await webviewPanel.webview.postMessage(message);
      } catch {
        // Webview may already be disposed.
      }
    };

    const live = LiveDocument.attach(document, postToWebview);
    const update = async (): Promise<void> => { await postToWebview(live.coordinator.snapshot()); };

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message: ViewerMessage) => {
      if (disposed) {
        return;
      }

      if (["applyEdits", "editorCommand", "compareDraft", "reloadLiveDocument"].includes(message.type)) {
        await live.coordinator.receive(message as LiveMessage, postToWebview);
        return;
      }
      if (message.type === "resolveImage") {
        const href = String(message.href || "");
        if (!/^[a-zA-Z][\w+.-]*:/.test(href)) {
          const documentDir = path.dirname(document.uri.fsPath);
          const folder = vscode.workspace.getWorkspaceFolder(document.uri);
          let absolute: string;
          try {
            // Document-relative first, then vault-relative and vault-wide file name lookup.
            absolute = locateImage(
              decodeURIComponent(href),
              documentDir,
              resolveVaultRoot(documentDir, folder?.uri.fsPath)
            ) ?? path.resolve(documentDir, decodeURIComponent(href));
          } catch {
            absolute = path.resolve(documentDir, decodeURIComponent(href));
          }
          const target = vscode.Uri.file(absolute);
          await postToWebview({ type: "resolvedImage", href, url: webviewPanel.webview.asWebviewUri(target).toString() });
        }
        return;
      }

      if (message.type === "requestReaderSettings") {
        await postReaderSettings(webviewPanel.webview);
        return;
      }

      if (message.type === "requestReaderStyle") {
        await this.postReaderStyle(webviewPanel.webview);
        return;
      }

      if (message.type === "ready") {
        await postReaderSettings(webviewPanel.webview);
        await this.postReaderStyle(webviewPanel.webview);
        await update();
        return;
      }

      if (message.type === "setAutoOpenReaderMode") {
        await setAutoOpenReaderMode(Boolean(message.enabled));
        await broadcastReaderSettings();
        return;
      }

      if (message.type === "openExternal" && message.href) {
        await this.openExternal(message.href);
        return;
      }

      if (message.type === "openFile" && message.href) {
        await this.openFileFromHref(document.uri, message.href);
        return;
      }

      if (message.type === "saveReaderStyle") {
        try {
          const settings = await this.saveReaderStyle(message.settings);
          await this.broadcastReaderStyle(settings);
          await postToWebview({
            type: "readerStyleSaved",
            settings,
            filePath: this.readerStyleUri.fsPath || this.readerStyleUri.toString()
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "readerStyleError", message: detail });
        }
        return;
      }

      await live.coordinator.run(async () => {
      if (message.type === "saveReadingHighlight" || message.type === "deleteReadingHighlight") {
        try {
          const content = document.getText();
          const isLive = Boolean((message as unknown as { livePreview?: boolean }).livePreview);
          const edited = updateReadingHighlight(isLive ? normalizeText(content) : content, message);
          const next = isLive && document.eol === vscode.EndOfLine.CRLF ? edited.replace(/\n/g, "\r\n") : edited;
          if (next !== content) {
            // All fragments share one undo entry. Never submit per-cell edits separately.
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(content.length)), next);
            if (!await vscode.workspace.applyEdit(edit)) throw new Error("无法更新当前 Markdown。");
            if (!await document.save()) throw new Error("高亮已写入编辑器，但文件尚未保存到磁盘。");
          }
          await postToWebview({ type: "readingHighlightSaved", unchanged: next === content });
        } catch (error) {
          await postToWebview({ type: "readingHighlightError", message: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (message.type === "addAnnotation") {
        try {
          await this.insertAnnotation(document, message);
          await postToWebview({ type: "annotationSaved" });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "annotationError", message: detail });
        }
        return;
      }

      if (message.type === "updateAnnotation") {
        try {
          await this.updateAnnotation(document, message);
          await postToWebview({ type: "annotationUpdated" });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "annotationError", message: detail });
        }
        return;
      }

      if (message.type === "resolveAnnotation") {
        try {
          await this.resolveAnnotation(document, message);
          await postToWebview({ type: "annotationResolved" });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "annotationError", message: detail });
        }
        return;
      }

      if (message.type === "deleteAnnotation") {
        try {
          await this.deleteAnnotation(document, message);
          await postToWebview({ type: "annotationDeleted" });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "annotationError", message: detail });
        }
        return;
      }

      if (message.type === "normalizeAnnotations") {
        try {
          const changed = await this.normalizeAnnotationPlacement(document, message.annotationIds);
          if (changed) await postToWebview({ type: "annotationsNormalized" });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await postToWebview({ type: "annotationError", message: detail });
        }
        return;
      }

      });

      if (message.type === "requestReload") await update();
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      unregisterReaderWebview(webviewPanel.webview);
      if (activeReaderWebview === webviewPanel.webview) activeReaderWebview = undefined;
      viewStateSub.dispose();
      messageSub.dispose();
      live.dispose();
    });

    // Register listeners before loading HTML so the initial "ready" message is not lost.
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);


  }

  private async openExternal(href: string): Promise<void> {
    try {
      const parsed = vscode.Uri.parse(href, true);
      if (!["http", "https", "mailto"].includes(parsed.scheme)) {
        return;
      }
      await vscode.env.openExternal(parsed);
    } catch {
      // Ignore invalid external URL.
    }
  }

  private get readerStyleUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, "reader-style.json");
  }

  private async readReaderStyle(): Promise<{ settings: ReaderStyleSettings; exists: boolean }> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.readerStyleUri);
      const parsed = JSON.parse(new TextDecoder("utf-8").decode(bytes));
      return { settings: normalizeReaderStyle(parsed), exists: true };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        return { settings: { ...DEFAULT_READER_STYLE }, exists: false };
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`样式配置文件读取失败：${detail}`);
    }
  }

  private async postReaderStyle(webview: vscode.Webview): Promise<void> {
    try {
      const result = await this.readReaderStyle();
      await webview.postMessage({
        type: "readerStyleSettings",
        settings: result.settings,
        exists: result.exists,
        filePath: this.readerStyleUri.fsPath || this.readerStyleUri.toString()
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await webview.postMessage({ type: "readerStyleError", message: detail });
    }
  }

  private async saveReaderStyle(value: unknown): Promise<ReaderStyleSettings> {
    const settings = normalizeReaderStyle(value);
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    const content = JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        ...settings
      },
      null,
      2
    );
    await vscode.workspace.fs.writeFile(this.readerStyleUri, new TextEncoder().encode(`${content}\n`));
    return settings;
  }

  private async broadcastReaderStyle(settings: ReaderStyleSettings): Promise<void> {
    const message = {
      type: "readerStyleSettings",
      settings,
      exists: true,
      filePath: this.readerStyleUri.fsPath || this.readerStyleUri.toString()
    };
    for (const webview of readerWebviews) {
      try {
        await webview.postMessage(message);
      } catch {
        // Webview may already be disposed.
      }
    }
  }

  private async insertAnnotation(
    document: vscode.TextDocument,
    message: Extract<ViewerMessage, { type: "addAnnotation" }>
  ): Promise<void> {
    const selectedText = String(message.selectedText || "").trim();
    const comment = String(message.comment || "").trim();
    if (!selectedText || !comment) {
      throw new Error("选中文本和批注内容不能为空。");
    }

    const createdAt = new Date().toISOString();
    const id = `annotation-${createdAt.replace(/[^0-9]/g, "")}`;
    const lineStart = Number.isFinite(message.lineStart) ? Math.max(1, Number(message.lineStart)) : undefined;
    const lineEnd = Number.isFinite(message.lineEnd)
      ? Math.max(lineStart || 1, Number(message.lineEnd))
      : lineStart;
    const heading = String(message.heading || "").trim();
    const anchor = String(message.anchor || "").trim();
    const metaLines = [
      `id: ${JSON.stringify(id)}`,
      `quote: ${JSON.stringify(selectedText)}`,
      `created_at: ${JSON.stringify(createdAt)}`,
      `status: "open"`
    ];
    if (lineStart) metaLines.push(`line_start: ${lineStart}`);
    if (lineEnd) metaLines.push(`line_end: ${lineEnd}`);
    if (heading) metaLines.push(`heading: ${JSON.stringify(heading)}`);
    if (anchor) metaLines.push(`anchor: ${JSON.stringify(anchor)}`);

    const quoteLabel = selectedText.replace(/\s+/g, " ").slice(0, 80);
    const quotedComment = comment
      .split(/\r?\n/)
      .map((line) => (line ? `> ${line}` : ">"));
    const entry = [
      "<!-- mr-annotation:start",
      ...metaLines,
      "-->",
      `> **批注：${quoteLabel}${selectedText.replace(/\s+/g, " ").length > 80 ? "…" : ""}**`,
      ">",
      ...quotedComment,
      "<!-- mr-annotation:end -->"
    ].join("\n");

    const currentContent = document.getText();
    const eol = currentContent.includes("\r\n") ? "\r\n" : "\n";
    const aiGuideMatch = /^[ \t]*<!--\s*mr-annotation:ai-guide\s*$[\s\S]*?^[ \t]*-->[ \t]*$/m.exec(currentContent);
    const hasAiGuide = Boolean(aiGuideMatch);
    const firstAnnotationMatch = /^[ \t]*<!--\s*mr-annotation:start\s*$/m.exec(currentContent);
    const aiGuide = buildAnnotationAiGuide(eol);
    const entryForDocument = eol === "\n" ? entry : entry.replace(/\n/g, eol);
    const insertAt = document.positionAt(currentContent.length);
    const edit = new vscode.WorkspaceEdit();
    if (aiGuideMatch && aiGuideMatch[0] !== aiGuide) {
      edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(aiGuideMatch.index),
          document.positionAt(aiGuideMatch.index + aiGuideMatch[0].length)
        ),
        aiGuide
      );
    }
    if (!hasAiGuide && firstAnnotationMatch) {
      edit.insert(document.uri, document.positionAt(firstAnnotationMatch.index), `${aiGuide}${eol}${eol}`);
    }
    const annotationPayload = !hasAiGuide && !firstAnnotationMatch
      ? `${aiGuide}${eol}${eol}${entryForDocument}`
      : entryForDocument;
    const insertion = `${currentContent.endsWith("\n") ? eol : `${eol}${eol}`}${annotationPayload}${eol}`;
    edit.insert(document.uri, insertAt, insertion);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error("无法把批注写入当前 Markdown 文档。");
    }
    const saved = await document.save();
    if (!saved) {
      throw new Error("批注已写入编辑器，但当前 Markdown 尚未保存到磁盘。");
    }
  }

  private findAnnotationBlock(
    content: string,
    annotationId: string
  ): { start: number; end: number; metaEnd: number; metadata: Record<string, unknown> } | null {
    const startMarker = "<!-- mr-annotation:start";
    const endMarker = "<!-- mr-annotation:end -->";
    let searchFrom = 0;
    while (searchFrom < content.length) {
      const start = content.indexOf(startMarker, searchFrom);
      if (start < 0) return null;
      const metaEnd = content.indexOf("-->", start + startMarker.length);
      if (metaEnd < 0) return null;
      const endStart = content.indexOf(endMarker, metaEnd + 3);
      if (endStart < 0) return null;
      const metadata: Record<string, unknown> = {};
      const metaText = content.slice(start + startMarker.length, metaEnd);
      for (const line of metaText.split(/\r?\n/)) {
        const match = /^([a-z_][a-z0-9_]*):\s*(.*)$/i.exec(line.trim());
        if (!match) continue;
        let value: unknown = match[2].trim();
        try {
          value = JSON.parse(String(value));
        } catch {
          // Preserve forward-compatible unquoted metadata.
        }
        metadata[match[1].toLowerCase()] = value;
      }
      const end = endStart + endMarker.length;
      if (String(metadata.id || "") === annotationId) {
        return { start, end, metaEnd: metaEnd + 3, metadata };
      }
      searchFrom = end;
    }
    return null;
  }

  private async replaceAnnotationRange(
    document: vscode.TextDocument,
    startOffset: number,
    endOffset: number,
    replacement: string,
    refreshAiGuide = false
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    if (refreshAiGuide) {
      const content = document.getText();
      const eol = content.includes("\r\n") ? "\r\n" : "\n";
      const guide = buildAnnotationAiGuide(eol);
      const guideMatch = /^[ \t]*<!--\s*mr-annotation:ai-guide\s*$[\s\S]*?^[ \t]*-->[ \t]*$/m.exec(content);
      if (guideMatch && guideMatch[0] !== guide) {
        edit.replace(document.uri, new vscode.Range(
          document.positionAt(guideMatch.index),
          document.positionAt(guideMatch.index + guideMatch[0].length)
        ), guide);
      } else if (!guideMatch) {
        // Keep the new guide next to the edited annotation, after any frontmatter.
        replacement = `${guide}${eol}${eol}${replacement}`;
      }
    }
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset)),
      replacement
    );
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) throw new Error("无法更新当前 Markdown 中的批注。");
    const saved = await document.save();
    if (!saved) throw new Error("批注已更新到编辑器，但当前 Markdown 尚未保存到磁盘。");
  }

  private async updateAnnotation(
    document: vscode.TextDocument,
    message: Extract<ViewerMessage, { type: "updateAnnotation" }>
  ): Promise<void> {
    const annotationId = String(message.annotationId || "").trim();
    const comment = String(message.comment || "").trim();
    if (!annotationId || !comment) throw new Error("批注 ID 和批注内容不能为空。");
    if (message.status !== undefined && message.status !== "open" && message.status !== "pending_review") {
      throw new Error("编辑批注只能设为待处理或待验收；请使用“确认解决”完成验收。");
    }
    const content = document.getText();
    const block = this.findAnnotationBlock(content, annotationId);
    if (!block) throw new Error("没有在当前 Markdown 中找到这条批注。");
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const selectedText = String(block.metadata.quote || "");
    const compactQuote = selectedText.replace(/\s+/g, " ");
    const quoteLabel = compactQuote.slice(0, 80);
    const quotedComment = comment
      .split(/\r?\n/)
      .map((line) => (line ? `> ${line}` : ">"))
      .join(eol);
    const visibleBlock = content.slice(block.metaEnd, block.end);
    const replyMatch = /(?:\r?\n)>\s*\*\*AI\s*回复[：:]?\*\*[\s\S]*?(?=(?:\r?\n)?<!--\s*mr-annotation:end\s*-->)/i.exec(visibleBlock);
    const preservedReply = replyMatch ? replyMatch[0].replace(/^\r?\n/, "") : "";
    let metadataText = content.slice(block.start, block.metaEnd);
    if (message.status !== undefined) {
      metadataText = metadataText.replace(/(?:\r?\n)?-->$/, "");
      const statusLine = `status: ${JSON.stringify(message.status)}`;
      metadataText = /^[ \t]*status:/im.test(metadataText)
        ? metadataText.replace(/^[ \t]*status:[^\r\n]*/gim, statusLine)
        : `${metadataText}${eol}${statusLine}`;
      metadataText = metadataText.replace(/^[ \t]*resolved_at:[^\r\n]*(?:\r?\n|$)/gim, "");
      metadataText = `${metadataText}${eol}-->`;
    }
    const replacement = [
      metadataText,
      `> **批注：${quoteLabel}${compactQuote.length > 80 ? "…" : ""}**`,
      ">",
      quotedComment,
      ...(preservedReply ? [">", preservedReply] : []),
      "<!-- mr-annotation:end -->"
    ].join(eol);
    await this.replaceAnnotationRange(document, block.start, block.end, replacement, true);
  }

  private async deleteAnnotation(
    document: vscode.TextDocument,
    message: Extract<ViewerMessage, { type: "deleteAnnotation" }>
  ): Promise<void> {
    const annotationId = String(message.annotationId || "").trim();
    if (!annotationId) throw new Error("批注 ID 不能为空。");
    const content = document.getText();
    const block = this.findAnnotationBlock(content, annotationId);
    if (!block) throw new Error("没有在当前 Markdown 中找到这条批注。");
    let start = block.start;
    let end = block.end;
    if (content.slice(start - 4, start) === "\r\n\r\n") start -= 2;
    else if (content.slice(start - 2, start) === "\n\n") start -= 1;
    if (content.slice(end, end + 2) === "\r\n") end += 2;
    else if (content[end] === "\n") end += 1;
    await this.replaceAnnotationRange(document, start, end, "");
  }

  private async resolveAnnotation(
    document: vscode.TextDocument,
    message: Extract<ViewerMessage, { type: "resolveAnnotation" }>
  ): Promise<void> {
    const annotationId = String(message.annotationId || "").trim();
    if (!annotationId) throw new Error("批注 ID 不能为空。");
    const content = document.getText();
    const block = this.findAnnotationBlock(content, annotationId);
    if (!block) throw new Error("没有在当前 Markdown 中找到这条批注。");

    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const metadataText = content.slice(block.start, block.metaEnd);
    const resolvedAt = new Date().toISOString();
    let nextMetadata = metadataText.replace(/(?:\r?\n)?-->$/, "");
    const upsertMetadata = (key: string, value: string): void => {
      const pattern = new RegExp(`^${key}:\\s*.*$`, "im");
      if (pattern.test(nextMetadata)) nextMetadata = nextMetadata.replace(pattern, `${key}: ${value}`);
      else nextMetadata = `${nextMetadata}${eol}${key}: ${value}`;
    };
    upsertMetadata("status", '"resolved"');
    upsertMetadata("resolved_at", JSON.stringify(resolvedAt));
    nextMetadata = `${nextMetadata}${eol}-->`;
    const replacement = `${nextMetadata}${content.slice(block.metaEnd, block.end)}`;
    await this.replaceAnnotationRange(document, block.start, block.end, replacement);
  }

  private async normalizeAnnotationPlacement(
    document: vscode.TextDocument,
    annotationIds: string[] | undefined
  ): Promise<boolean> {
    const ids = Array.from(new Set((annotationIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return false;
    const content = document.getText();
    const blocks = ids
      .map((id) => this.findAnnotationBlock(content, id))
      .filter((block): block is NonNullable<typeof block> => Boolean(block))
      .sort((a, b) => a.start - b.start);
    if (!blocks.length) return false;
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const rawBlocks = blocks.map((block) => content.slice(block.start, block.end));
    let remaining = content;
    for (const block of [...blocks].reverse()) {
      let start = block.start;
      let end = block.end;
      if (remaining.slice(start - 2, start) === "\r\n") start -= 2;
      else if (remaining[start - 1] === "\n") start -= 1;
      if (remaining.slice(end, end + 2) === "\r\n") end += 2;
      else if (remaining[end] === "\n") end += 1;
      remaining = `${remaining.slice(0, start)}${remaining.slice(end)}`;
    }
    const normalized = `${remaining.trimEnd()}${remaining.trim() ? `${eol}${eol}` : ""}${rawBlocks.join(`${eol}${eol}`)}${eol}`;
    if (normalized === content) return false;
    await this.replaceAnnotationRange(document, 0, content.length, normalized);
    return true;
  }

  private async openFileFromHref(baseDocumentUri: vscode.Uri, href: string): Promise<void> {
    const target = this.resolveMarkdownHref(baseDocumentUri, href);
    if (!target) {
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(baseDocumentUri);
    if (folder && !this.isSubPath(folder.uri.fsPath, target.fsPath)) {
      vscode.window.showWarningMessage("只能打开当前 workspace 内部的 Markdown 路径。");
      return;
    }

    textModeUris.delete(target.toString());
    markReaderIntent(target);
    await openInReaderMode(target);
  }

  private resolveMarkdownHref(baseDocumentUri: vscode.Uri, href: string): vscode.Uri | null {
    const trimmed = String(href || "").trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return null;
    }

    try {
      const maybeUri = vscode.Uri.parse(trimmed, true);
      if (maybeUri.scheme) {
        if (maybeUri.scheme === "file") {
          return maybeUri;
        }
        return null;
      }
    } catch {
      // Continue with relative path logic.
    }

    const pathPart = trimmed.split(/[?#]/)[0].trim();
    if (!pathPart) {
      return null;
    }

    let cleanPath = pathPart;
    if (!cleanPath.toLowerCase().endsWith(".md")) {
      cleanPath = `${cleanPath}.md`;
    }

    const baseDir = path.dirname(baseDocumentUri.fsPath);
    const resolvedPath = path.normalize(path.join(baseDir, cleanPath));
    return vscode.Uri.file(resolvedPath);
  }

  private isSubPath(parentPath: string, candidatePath: string): boolean {
    const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }

  private getHtml(webview: vscode.Webview): string {
    const cacheKey = String(Date.now());
    const cssUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "report.css"))
      .with({ query: `v=${cacheKey}` });
    const jsUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "reportViewer.js"))
      .with({ query: `v=${cacheKey}` });
    const mermaidUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "mermaid.min.js"))
      .with({ query: `v=${cacheKey}` });
    const livePreviewUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "livePreview.js"))
      .with({ query: `v=${cacheKey}` });
    const highlightsUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "readerHighlights.js"))
      .with({ query: `v=${cacheKey}` });
    const highlightFormatUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "highlightFormat.js"))
      .with({ query: `v=${cacheKey}` });
    const liveCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "livePreview.css"));
    const nonce = cacheKey;
    const mathUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "readerMath.js")).with({ query: `v=${cacheKey}` });
    const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "katex", "katex.min.js"));
    const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "katex", "katex.min.css"));

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${katexCssUri}" />
  <link rel="stylesheet" href="${cssUri}" />
  <link rel="stylesheet" href="${liveCssUri}" />
  <title>Report Markdown Viewer</title>
</head>
<body>
  <main id="reportLayout" class="report-layout layout-toc-open">
    <aside id="tocDock" class="toc-dock" aria-label="文档目录">
      <div class="toc-toolbar">
        <button id="tocToggle" type="button" class="toc-toggle" aria-expanded="true" title="收起目录">收起目录</button>
        <button id="tocSideToggle" type="button" class="toc-side-toggle" aria-label="将目录移到右侧" title="将目录移到右侧">→</button>
      </div>
      <nav id="toc" class="toc"></nav>
      <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整目录宽度"></div>
    </aside>
    <aside id="annotationDock" class="annotation-dock annotation-right" aria-label="文档批注" hidden></aside>
    <article id="reportContent" class="report-content"></article>
  </main>
  <div id="annotationNavigationRoot" class="annotation-navigation-root" hidden aria-label="未解决批注导航">
    <span id="openAnnotationCount" class="annotation-open-count" aria-live="polite">未解决批注 0</span>
    <button id="previousAnnotationButton" type="button" class="annotation-navigation-button" title="跳转到上一个未解决批注" aria-label="跳转到上一个未解决批注">上一条</button>
    <button id="nextAnnotationButton" type="button" class="annotation-navigation-button" title="跳转到下一个未解决批注" aria-label="跳转到下一个未解决批注">下一条</button>
  </div>
  <div id="annotationHistoryRoot" class="annotation-history-root" hidden>
    <button id="annotationHistoryButton" type="button" class="editor-mode-btn annotation-history-button" aria-expanded="false" aria-controls="annotationHistoryPanel">已解决批注 0</button>
    <section id="annotationHistoryPanel" class="annotation-history-panel" hidden aria-label="已完成批注"></section>
  </div>
  <div class="reader-tools-root">
    <button id="reloadDocumentBtn" type="button" class="reader-tool-button" title="重新加载文档" aria-label="重新加载文档">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"/></svg>
    </button>
    <div class="reader-settings-root">
      <button id="readerSettingsToggle" type="button" class="reader-settings-toggle" aria-expanded="false" aria-controls="readerSettingsPanel" title="阅读设置">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.94 4.88a8.96 8.96 0 0 0 .06-1.76l2.03-1.58a.75.75 0 0 0 .18-.96l-1.92-3.32a.75.75 0 0 0-.9-.33l-2.39.96a9.06 9.06 0 0 0-1.52-.88l-.36-2.54A.75.75 0 0 0 14.9 2h-3.8a.75.75 0 0 0-.74.65l-.36 2.54c-.54.22-1.05.5-1.52.88l-2.39-.96a.75.75 0 0 0-.9.33L2.27 8.96a.75.75 0 0 0 .18.96l2.03 1.58c-.04.29-.06.58-.06.88s.02.59.06.88L2.45 14.9a.75.75 0 0 0-.18.96l1.92 3.32c.18.31.57.45.9.33l2.39-.96c.47.38.98.66 1.52.88l.36 2.54c.08.57.62 1 1.19 1h3.8c.57 0 1.11-.43 1.19-1l.36-2.54c.54-.22 1.05-.5 1.52-.88l2.39.96c.33.12.72-.02.9-.33l1.92-3.32a.75.75 0 0 0-.18-.96l-2.03-1.58Z"/></svg>
      </button>
      <div id="readerSettingsPanel" class="reader-settings-panel" hidden role="dialog" aria-label="阅读设置">
      <section class="reader-settings-group">
        <h2 class="reader-settings-label">字号</h2>
        <div class="reader-settings-control">
          <button id="fontDecrease" type="button" aria-label="缩小字号">−</button>
          <span id="fontValue" class="reader-settings-value">100%</span>
          <button id="fontIncrease" type="button" aria-label="放大字号">+</button>
        </div>
        <button id="readerStyleButton" type="button" class="reader-settings-action">自定义阅读样式…</button>
        <button id="tocPositionButton" type="button" class="reader-settings-action">目录位置…</button>
      </section>
      <section class="reader-settings-group">
        <h2 class="reader-settings-label">标题</h2>
        <label class="reader-settings-switch" for="showTocNumbers">
          <span>显示目录编号</span>
          <input id="showTocNumbers" type="checkbox" checked />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
        <label class="reader-settings-switch" for="showContentNumbers">
          <span>显示正文编号</span>
          <input id="showContentNumbers" type="checkbox" checked />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
        <label class="reader-settings-switch" for="headingFontScale">
          <span>标题逐级缩小</span>
          <input id="headingFontScale" type="checkbox" checked />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
        <label class="reader-settings-switch" for="rainbowHeadingColors">
          <span>彩虹标题颜色</span>
          <input id="rainbowHeadingColors" type="checkbox" />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
      </section>
      <section class="reader-settings-group">
        <h2 class="reader-settings-label">打开方式</h2>
        <label class="reader-settings-switch" for="autoOpenReaderMode">
          <span>左键打开 .md 时使用阅读器</span>
          <input id="autoOpenReaderMode" type="checkbox" />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
      </section>
      <section class="reader-settings-group">
        <h2 class="reader-settings-label">编辑</h2>
        <label class="reader-settings-switch" for="showMarkdownSource">
          <span>显示全部 Markdown 标记</span>
          <input id="showMarkdownSource" type="checkbox" />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
      </section>
      <section class="reader-settings-group">
        <h2 class="reader-settings-label">交互</h2>
        <label class="reader-settings-switch" for="enableBlockDrag">
          <span>正文块拖动排序</span>
          <input id="enableBlockDrag" type="checkbox" />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
      </section>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${katexUri}"></script>
  <script nonce="${nonce}" src="${mathUri}"></script>
  <script nonce="${nonce}" src="${highlightFormatUri}"></script>
  <script nonce="${nonce}" src="${highlightsUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
  <script nonce="${nonce}" src="${livePreviewUri}"></script>
</body>
</html>`;
  }
}
