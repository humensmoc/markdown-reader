import * as path from "path";
import * as vscode from "vscode";
import { buildReportPayload } from "./reportData";

type ViewerMessage =
  | { type: "ready" }
  | { type: "requestReaderSettings" }
  | { type: "openExternal"; href?: string }
  | { type: "openFile"; href?: string }
  | { type: "saveContent"; content?: string; persist?: boolean }
  | { type: "setAutoOpenReaderMode"; enabled?: boolean }
  | { type: "editorState"; dirty?: boolean; inEditorMode?: boolean; inWysiwygMode?: boolean }
  | { type: "requestReload" };

const READER_VIEW_TYPE = "meowReportMarkdown.viewer";
const readerWebviews = new Set<vscode.Webview>();
const textModeUris = new Set<string>();
const readerIntentUris = new Set<string>();
const openInReaderModeInflight = new Map<string, Promise<void>>();
const extensionActivatedAt = Date.now();
const STARTUP_GRACE_MS = 1200;

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
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

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

class ReportMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
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
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };
    registerReaderWebview(webviewPanel.webview);

    let disposed = false;
    let ready = false;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingUpdate = false;
    let webviewEditorDirty = false;
    let webviewInEditorMode = false;
    let webviewInWysiwygMode = false;
    let suppressDocumentUpdateUntil = 0;

    const shouldSuppressDocumentUpdate = (): boolean => Date.now() < suppressDocumentUpdateUntil;

    const suppressDocumentUpdates = (durationMs = 400): void => {
      suppressDocumentUpdateUntil = Date.now() + durationMs;
    };

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

    const update = async (): Promise<void> => {
      if (disposed) {
        return;
      }
      if (!ready) {
        pendingUpdate = true;
        return;
      }

      pendingUpdate = false;
      try {
        const content = document.getText();
        const payload = await buildReportPayload(document.uri, content);
        if (disposed) {
          return;
        }
        if (webviewEditorDirty && webviewInEditorMode) {
          await postToWebview({
            type: "documentChanged",
            content,
            payload
          });
          return;
        }
        await postToWebview({ type: "render", payload });
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await postToWebview({
          type: "render",
          payload: {
            ok: true,
            title: "Report Markdown Viewer",
            meta: message,
            rootUri: document.uri.toString(),
            files: []
          }
        });
      }
    };

    const scheduleUpdate = (): void => {
      if (disposed) {
        return;
      }
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      updateTimer = setTimeout(() => {
        updateTimer = undefined;
        void update();
      }, 150);
    };

    const messageSub = webviewPanel.webview.onDidReceiveMessage(async (message: ViewerMessage) => {
      if (disposed) {
        return;
      }

      if (message.type === "requestReaderSettings") {
        await postReaderSettings(webviewPanel.webview);
        return;
      }

      if (message.type === "ready") {
        if (ready) {
          return;
        }
        ready = true;
        await postReaderSettings(webviewPanel.webview);
        await update();
        if (pendingUpdate) {
          pendingUpdate = false;
          await update();
        }
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

      if (message.type === "saveContent" && typeof message.content === "string") {
        suppressDocumentUpdates(600);
        await this.applyDocumentContent(document, message.content, {
          saveToDisk: message.persist === true
        });
        webviewEditorDirty = false;
        return;
      }

      if (message.type === "editorState") {
        webviewEditorDirty = Boolean(message.dirty);
        webviewInEditorMode = Boolean(message.inEditorMode);
        webviewInWysiwygMode = Boolean(message.inWysiwygMode);
        return;
      }

      if (message.type === "requestReload") {
        try {
          const content = document.getText();
          const payload = await buildReportPayload(document.uri, content);
          if (disposed) {
            return;
          }
          await postToWebview({
            type: "reloadDocument",
            content,
            payload
          });
        } catch {
          // Ignore reload failures.
        }
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (shouldSuppressDocumentUpdate()) {
        return;
      }
      scheduleUpdate();
    });

    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() !== document.uri.toString()) {
        return;
      }
      if (shouldSuppressDocumentUpdate()) {
        return;
      }
      scheduleUpdate();
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      unregisterReaderWebview(webviewPanel.webview);
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      messageSub.dispose();
      changeSub.dispose();
      saveSub.dispose();
    });

    // Register listeners before loading HTML so the initial "ready" message is not lost.
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    // Fallback: if webview "ready" is missed, still push the first render.
    setTimeout(() => {
      if (!disposed && !ready) {
        ready = true;
        void update();
      }
    }, 250);
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

  private async applyDocumentContent(
    document: vscode.TextDocument,
    nextContent: string,
    options: { saveToDisk?: boolean } = {}
  ): Promise<void> {
    const current = document.getText();
    if (current === nextContent) {
      return;
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(current.length)
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, nextContent);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      vscode.window.showErrorMessage("保存失败：无法写入文档变更。");
      return;
    }

    if (options.saveToDisk) {
      try {
        await document.save();
      } catch {
        // Document may have been closed while saving.
      }
    }
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
    const wysiwygUri = webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "wysiwygEditor.js"))
      .with({ query: `v=${cacheKey}` });
    const nonce = cacheKey;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Report Markdown Viewer</title>
</head>
<body>
  <main id="reportLayout" class="report-layout layout-toc-open">
    <aside id="tocDock" class="toc-dock" aria-label="文档目录">
      <button id="tocToggle" type="button" class="toc-toggle" aria-expanded="true" title="收起目录">收起目录</button>
      <nav id="toc" class="toc"></nav>
      <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整目录宽度"></div>
    </aside>
    <article id="reportContent" class="report-content"></article>
    <textarea
      id="reportEditor"
      class="report-editor"
      hidden
      spellcheck="false"
      aria-label="Markdown 编辑器"
    ></textarea>
  </main>
  <div class="editor-mode-root">
    <button id="editorModeToggle" type="button" class="editor-mode-btn" aria-pressed="false">编辑</button>
    <button id="editorSaveBtn" type="button" class="editor-mode-btn primary" hidden>保存并预览</button>
    <button id="editorCancelBtn" type="button" class="editor-mode-btn" hidden>取消</button>
  </div>
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
        <label class="reader-settings-switch" for="enableWysiwygMode">
          <span>所见即所得编辑</span>
          <input id="enableWysiwygMode" type="checkbox" />
          <span class="reader-settings-switch-ui" aria-hidden="true"></span>
        </label>
        <button id="reloadDocumentBtn" type="button" class="reader-settings-action">重新加载文档</button>
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
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
  <script nonce="${nonce}" src="${wysiwygUri}"></script>
</body>
</html>`;
  }
}
