import * as path from "path";
import * as vscode from "vscode";
import { buildReportPayload } from "./reportData";

type ViewerMessage =
  | { type: "ready" }
  | { type: "openExternal"; href?: string }
  | { type: "openFile"; href?: string };

const READER_VIEW_TYPE = "meowReportMarkdown.viewer";
const textModeUris = new Set<string>();
const extensionActivatedAt = Date.now();
const STARTUP_GRACE_MS = 1200;

async function ensureTextDocumentReady(uri: vscode.Uri): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(uri);
  const openedAsText = vscode.window.tabGroups.all.some((group) =>
    group.tabs.some(
      (tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString()
    )
  );

  if (!openedAsText) {
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return document;
}

async function openInReaderMode(uri: vscode.Uri): Promise<void> {
  // Cursor requires the backing TextDocument to exist in the text editor model
  // service before CustomTextEditor can open ("Assertion Failed: Argument is
  // `undefined` or `null`").
  await ensureTextDocumentReady(uri);

  const delays = [0, 200, 500, 900];
  let lastError: unknown;
  for (const delayMs of delays) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      await vscode.commands.executeCommand("vscode.openWith", uri, READER_VIEW_TYPE);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
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
      await openInReaderMode(target);
    })
  );

  setupAutoOpenReaderMode(context);
}

function isAutoOpenEnabled(): boolean {
  return vscode.workspace.getConfiguration("meowReportMarkdown").get<boolean>("autoOpenReaderMode", true);
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

async function maybeAutoOpenReaderMode(uri: vscode.Uri): Promise<void> {
  if (!isAutoOpenEnabled()) {
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

  const startupWait = Math.max(0, STARTUP_GRACE_MS - (Date.now() - extensionActivatedAt));
  if (startupWait > 0) {
    await new Promise((resolve) => setTimeout(resolve, startupWait));
  }

  try {
    await openInReaderMode(uri);
  } catch {
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
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };

    let disposed = false;
    let ready = false;
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingUpdate = false;

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
        const payload = await buildReportPayload(document.uri, document.getText());
        if (disposed) {
          return;
        }
        await webviewPanel.webview.postMessage({ type: "render", payload });
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await webviewPanel.webview.postMessage({
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

      if (message.type === "ready") {
        ready = true;
        await update();
        if (pendingUpdate) {
          pendingUpdate = false;
          await update();
        }
        return;
      }

      if (message.type === "openExternal" && message.href) {
        await this.openExternal(message.href);
        return;
      }

      if (message.type === "openFile" && message.href) {
        await this.openFileFromHref(document.uri, message.href);
      }
    });

    const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        scheduleUpdate();
      }
    });

    const saveSub = vscode.workspace.onDidSaveTextDocument((saved) => {
      if (saved.uri.toString() === document.uri.toString()) {
        scheduleUpdate();
      }
    });

    webviewPanel.onDidDispose(() => {
      disposed = true;
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      messageSub.dispose();
      changeSub.dispose();
      saveSub.dispose();
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

    await vscode.commands.executeCommand("vscode.open", target);
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

    const cleanPath = trimmed.split(/[?#]/)[0];
    if (!cleanPath || !cleanPath.toLowerCase().endsWith(".md")) {
      return null;
    }

    const baseDir = vscode.Uri.file(path.dirname(baseDocumentUri.fsPath));
    return vscode.Uri.joinPath(baseDir, cleanPath);
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
    const nonce = cacheKey;

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Report Markdown Viewer</title>
</head>
<body>
  <header class="report-topbar">
    <div class="report-topbar-main">
      <h1 id="gameTitle">Report Markdown Viewer</h1>
      <p id="gameMeta"></p>
    </div>
  </header>
  <main id="reportLayout" class="report-layout layout-toc-open">
    <aside id="tocDock" class="toc-dock" aria-label="文档目录">
      <button id="tocToggle" type="button" class="toc-toggle" aria-expanded="true" title="收起目录">收起目录</button>
      <nav id="toc" class="toc"></nav>
      <div id="tocResizeHandle" class="toc-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整目录宽度"></div>
    </aside>
    <article id="reportContent" class="report-content"></article>
  </main>
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
    </div>
  </div>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
