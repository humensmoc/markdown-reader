# VS Code Report Markdown Viewer 插件实现方案

## 背景

当前 `docs/report-index-browser/report.html` 用于展示 DeepResearch 报告页面。它的核心能力不只是普通 Markdown 预览，而是一套面向报告阅读的定制渲染逻辑：

- 按报告文件生成左侧目录。
- 自动给文件与标题加层级编号。
- 渲染标题、段落、列表、表格、代码块、粗体、斜体、行内代码和链接。
- 识别 `[cite: 1]` 这类引用标记，并跳转到 `Sources` 中对应编号。
- 支持深色主题、报告布局和阅读样式。

目标是把这套能力整理成一个 VS Code 插件，使 `.md` 文件可以在 VS Code 中间编辑区以插件渲染视图打开，而不是只用 VS Code 默认 Markdown Preview。

## 目标

插件应支持以下能力：

1. 在 VS Code 资源管理器中点击 `.md` 文件，可以用插件渲染视图打开。
2. 渲染视图显示在 VS Code 中间 editor area，而不是侧边栏或外部浏览器。
3. 复用 `report.html` 当前的报告阅读体验，包括左侧目录、标题编号、表格和引用跳转。
4. 支持普通单个 Markdown 文件预览。
5. 支持报告目录聚合预览：打开 `gameplay.md`、`system.md` 等报告文件时，可以把同目录下的一组报告文件按固定顺序聚合显示。
6. 文件保存或内容变化后，渲染视图自动刷新。
7. 本地相对 Markdown 链接可以继续在 VS Code 中打开。
8. 外部 HTTP/HTTPS 链接使用系统浏览器打开。

第一版建议只做只读渲染，不做 Webview 内编辑。普通文本编辑仍然交给 VS Code 默认 Markdown 编辑器。

## 现有实现拆解

当前相关文件位于：

```
docs/report-index-browser/
  report.html
  report.css
  report.js
  server.js
```

### report.html

`report.html` 提供页面结构：

```
header.report-topbar
main.report-layout
  nav#toc
  article#reportContent
script report.js
```

VS Code 插件可以保留这个结构，把它作为 Webview HTML 模板。

### report.css

`report.css` 负责报告阅读布局与视觉样式：

- 顶部标题栏。
- 左侧目录栏。
- 正文阅读区。
- 表格样式。
- 引用按钮、高亮和返回按钮。
- 深色主题。

插件中可先直接复制，然后逐步改为使用 VS Code 主题变量。

### report.js

`report.js` 是核心渲染逻辑，主要函数包括：

```
loadReport()
renderReport(payload)
createFileToc(file)
renderFile(file)
withOutlineNumbers(file, fileNumber)
renderMarkdown(content, file)
renderTable(rows, context)
renderInlineMarkdown(text, context)
renderCitationGroup(rawNumbers, context)
activateCitation(cite)
returnToCitation(citeRef)
```

其中 `renderMarkdown` 是当前最重要的可迁移能力。

### server.js

`server.js` 中与报告预览相关的能力主要是：

```
REPORT_FILE_ORDER
handleGetReport(url, res)
resolveReportDir(game)
extractMarkdownHeadings(content, fileName)
```

在 VS Code 插件中，不再需要启动 HTTP server，也不需要通过 `/api/report?appid=...` 拉取数据。插件可以直接读取当前 workspace 文件系统，并生成与 `renderReport(payload)` 兼容的数据结构。

## 推荐插件类型

推荐使用 VS Code 的 `CustomTextEditorProvider`。

原因：

- `.md` 是文本文件，适合用 Custom Text Editor。
- 打开位置天然在 VS Code editor area。
- 可以通过 `vscode.openWith` 指定自定义编辑器打开。
- 能监听 `TextDocument` 内容变化，保存后或编辑后刷新 Webview。
- 不需要自己维护完整文档生命周期。

不建议第一版使用 `WebviewViewProvider`，因为它更适合侧边栏视图，不符合“在中间显示代码的窗口中打开”的目标。

## 插件目录结构

插件工程位于仓库根目录，参考实现保留在 `docs/report-index-browser/`：

```
markdown-reader/
  package.json
  tsconfig.json
  README.md
  src/
    extension.ts
    reportData.ts
    markdownHeadings.ts
  media/
    reportViewer.js
    report.css
  docs/
    report-index-browser/
      report.html
      report.css
      report.js
      server.js
```

职责划分：

```
extension.ts
  注册 CustomTextEditorProvider
  生成 Webview HTML
  监听文档变化
  处理 Webview 消息

reportData.ts
  根据当前 md 文件构造渲染 payload
  判断是否聚合同目录报告文件
  读取同目录 md 文件

markdownHeadings.ts
  从 server.js 迁移 heading 提取逻辑
  生成稳定 anchor

media/reportViewer.js
  从 report.js 迁移前端渲染逻辑
  改为接收 VS Code postMessage 数据

media/report.css
  从 report.css 迁移阅读样式
  适配 VS Code 主题变量
```

## package.json 设计

核心配置如下：

```
{
  "name": "meow-report-markdown-viewer",
  "displayName": "Meow Report Markdown Viewer",
  "version": "0.0.1",
  "publisher": "meow-agent",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onCustomEditor:meowReportMarkdown.viewer",
    "onCommand:meowReportMarkdown.openPreview"
  ],
  "contributes": {
    "commands": [
      {
        "command": "meowReportMarkdown.openPreview",
        "title": "Open with Meow Report Markdown Viewer"
      }
    ],
    "customEditors": [
      {
        "viewType": "meowReportMarkdown.viewer",
        "displayName": "Meow Report Markdown Viewer",
        "selector": [
          {
            "filenamePattern": "*.md"
          }
        ],
        "priority": "option"
      }
    ],
    "menus": {
      "explorer/context": [
        {
          "command": "meowReportMarkdown.openPreview",
          "when": "resourceExtname == .md"
        }
      ],
      "editor/title/context": [
        {
          "command": "meowReportMarkdown.openPreview",
          "when": "resourceExtname == .md"
        }
      ]
    },
    "configuration": {
      "title": "Meow Report Markdown Viewer",
      "properties": {
        "meowReportMarkdown.autoGroupReportFolder": {
          "type": "boolean",
          "default": true,
          "description": "Open report markdown files as a grouped report folder when possible."
        },
        "meowReportMarkdown.reportFileOrder": {
          "type": "array",
          "default": [
            "gameplay.md",
            "system.md",
            "feedback.md",
            "marketing.md",
            "presentation.md",
            "numerical.md",
            "technical.md"
          ],
          "description": "Preferred file order when rendering a report folder."
        }
      }
    }
  },
  "main": "./out/extension.js",
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.90.0",
    "@vscode/vsce": "^2.15.0",
    "typescript": "^5.0.0"
  }
}
```

第一版建议 `priority` 使用 `option`。这样默认点击 `.md` 仍然可以保持 VS Code 原有行为，用户可以通过右键菜单或 `Reopen Editor With...` 选择插件预览。确认稳定后再改成 `default`，或者在 workspace settings 中指定默认打开方式。

如果要让当前项目默认使用该插件打开 `.md`，可在 `.vscode/settings.json` 中配置：

```
{
  "workbench.editorAssociations": {
    "*.md": "meowReportMarkdown.viewer"
  }
}
```

## Webview 数据协议

插件后端向 Webview 发送统一 payload：

```
type ReportPayload = {
  ok: true;
  title: string;
  meta: string;
  rootUri: string;
  files: ReportFile[];
};

type ReportFile = {
  name: string;
  label: string;
  uri: string;
  content: string;
  headings: ReportHeading[];
};

type ReportHeading = {
  level: number;
  text: string;
  line: number;
  anchor: string;
};
```

普通单文件预览时：

```
files.length = 1
title = 当前文件名
meta = 当前文件完整路径
```

报告目录聚合预览时：

```
files = 同目录下按 reportFileOrder 排序后的 md 文件
title = 当前目录名
meta = 当前目录路径 + 文件数量
```

## extension.ts 核心骨架

```
import * as vscode from "vscode";
import { buildReportPayload } from "./reportData";

export function activate(context: vscode.ExtensionContext) {
  const provider = new ReportMarkdownEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "meowReportMarkdown.viewer",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("meowReportMarkdown.openPreview", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;

      await vscode.commands.executeCommand(
        "vscode.openWith",
        target,
        "meowReportMarkdown.viewer"
      );
    })
  );
}

class ReportMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ) {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media")
      ]
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const update = async () => {
      const payload = await buildReportPayload(document.uri, document.getText());
      webviewPanel.webview.postMessage({
        type: "render",
        payload
      });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        update();
      }
    });

    webviewPanel.onDidDispose(() => changeSub.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "openFile" && message.uri) {
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(message.uri));
      }

      if (message.type === "openExternal" && message.href) {
        await vscode.env.openExternal(vscode.Uri.parse(message.href));
      }
    });

    await update();
  }

  private getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "report.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "reportViewer.js")
    );
    const nonce = String(Date.now());

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Report Markdown Viewer</title>
</head>
<body>
  <header class="report-topbar">
    <div>
      <h1 id="gameTitle">Report Markdown Viewer</h1>
      <p id="gameMeta"></p>
    </div>
    <div class="report-actions">
      <button id="themeBtn" type="button" class="theme-button" aria-pressed="false">Theme</button>
    </div>
  </header>
  <main class="report-layout">
    <nav id="toc" class="toc"></nav>
    <article id="reportContent" class="report-content"></article>
  </main>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
```

## reportData.ts 核心逻辑

```
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { extractMarkdownHeadings } from "./markdownHeadings";

const DEFAULT_REPORT_FILE_ORDER = [
  "gameplay.md",
  "system.md",
  "feedback.md",
  "marketing.md",
  "presentation.md",
  "numerical.md",
  "technical.md"
];

export async function buildReportPayload(uri: vscode.Uri, currentText: string) {
  const config = vscode.workspace.getConfiguration("meowReportMarkdown");
  const autoGroup = config.get<boolean>("autoGroupReportFolder", true);

  if (!autoGroup || uri.scheme !== "file") {
    return buildSingleFilePayload(uri, currentText);
  }

  const folder = path.dirname(uri.fsPath);
  const names = await fs.promises.readdir(folder);
  const mdNames = names.filter((name) => name.toLowerCase().endsWith(".md"));
  const orderedNames = orderReportFiles(mdNames);

  if (orderedNames.length <= 1) {
    return buildSingleFilePayload(uri, currentText);
  }

  const files = [];
  for (const name of orderedNames) {
    const filePath = path.join(folder, name);
    const content =
      path.resolve(filePath) === path.resolve(uri.fsPath)
        ? currentText
        : await fs.promises.readFile(filePath, "utf8");

    const label = name.replace(/\.md$/i, "");
    files.push({
      name,
      label,
      uri: vscode.Uri.file(filePath).toString(),
      content,
      headings: extractMarkdownHeadings(content, label)
    });
  }

  return {
    ok: true,
    title: path.basename(folder),
    meta: `${folder} · ${files.length} markdown files`,
    rootUri: vscode.Uri.file(folder).toString(),
    files
  };
}

function buildSingleFilePayload(uri: vscode.Uri, content: string) {
  const name = path.basename(uri.fsPath || uri.path);
  const label = name.replace(/\.md$/i, "");

  return {
    ok: true,
    title: name,
    meta: uri.fsPath || uri.toString(),
    rootUri: uri.toString(),
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

function orderReportFiles(names: string[]) {
  const config = vscode.workspace.getConfiguration("meowReportMarkdown");
  const preferred = config.get<string[]>("reportFileOrder", DEFAULT_REPORT_FILE_ORDER);
  const existing = new Set(names);

  return [
    ...preferred.filter((name) => existing.has(name)),
    ...names
      .filter((name) => !preferred.includes(name))
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
  ];
}
```

## markdownHeadings.ts 逻辑

从 `server.js` 中迁移 `extractMarkdownHeadings`，并补齐 anchor 生成：

```
export function extractMarkdownHeadings(content: string, fileName: string) {
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

function makeAnchor(fileName: string, index: number, text: string) {
  return slugify(`${fileName}-${index}-${text}`) || `${fileName}-${index}`;
}

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
```

## reportViewer.js 改造方式

从 `report.js` 迁移时，重点改造入口逻辑。

原逻辑：

```
loadReport()
  读取 URL appid
  fetch('/api/report?appid=...')
  renderReport(payload)
```

插件逻辑：

```
const vscode = acquireVsCodeApi();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "render") {
    renderReport(message.payload);
  }
});
```

`renderReport(payload)` 改为不依赖 `payload.game`：

```
function renderReport(payload) {
  gameTitle.textContent = payload.title || "Report Markdown Viewer";
  gameMeta.textContent = payload.meta || "";
  document.title = payload.title || "Report Markdown Viewer";

  toc.innerHTML = "";
  reportContent.innerHTML = "";
  activeCitation = null;
  citeRefSerial = 0;

  if (!payload.files || !payload.files.length) {
    renderError("No markdown files found.");
    return;
  }

  const tocInner = document.createElement("div");
  tocInner.className = "toc-inner";

  const numberedFiles = payload.files.map((file, index) =>
    withOutlineNumbers(file, index + 1)
  );

  for (const file of numberedFiles) {
    tocInner.appendChild(createFileToc(file));
    reportContent.appendChild(renderFile(file));
  }

  toc.appendChild(tocInner);
}
```

链接处理建议：

```
function openHref(href) {
  if (/^https?:\/\//i.test(href)) {
    vscode.postMessage({ type: "openExternal", href });
    return;
  }

  vscode.postMessage({ type: "openFile", uri: href });
}
```

如果要支持相对路径，建议后端在 payload 中带上当前文件 `uri` 和 `rootUri`，前端把点击事件发回后端，由后端用 `vscode.Uri.joinPath` 或 `path.resolve` 解析，避免 Webview 自己处理 Windows 路径细节。

## CSS 适配建议

`report.css` 第一版可以直接复制现有样式。为了和 VS Code 主题融合，建议逐步把颜色变量改成：

```
:root {
  color-scheme: light dark;
  --bg: var(--vscode-editor-background);
  --paper: var(--vscode-editor-background);
  --paper-strong: var(--vscode-sideBar-background);
  --line: var(--vscode-panel-border);
  --line-strong: var(--vscode-editorWidget-border);
  --text: var(--vscode-editor-foreground);
  --muted: var(--vscode-descriptionForeground);
  --blue: var(--vscode-textLink-foreground);
  --shadow: none;
}

body {
  color: var(--text);
  background: var(--bg);
  font-family: var(--vscode-font-family);
}
```

如果保留 `themeBtn`，需要注意 VS Code 本身已有主题系统。第一版更推荐跟随 VS Code 主题，后续再考虑插件内部额外主题切换。

## 默认打开行为

有三种策略：

### 策略一：右键或 Open With 打开

`priority: "option"`。

优点：

- 不影响默认 Markdown 编辑体验。
- 风险最低。

缺点：

- 不能完全满足“点击 md 直接打开插件视图”。

### 策略二：项目级默认打开

保持 `priority: "option"`，在当前项目 `.vscode/settings.json` 设置：

```
{
  "workbench.editorAssociations": {
    "*.md": "meowReportMarkdown.viewer"
  }
}
```

优点：

- 只影响当前 workspace。
- 用户体验符合目标。

缺点：

- 其他项目不会自动应用。

### 策略三：插件级默认打开

把 `customEditors.priority` 改为：

```
"priority": "default"
```

优点：

- 安装后 `.md` 默认使用插件打开。

缺点：

- 会抢占用户习惯的默认 Markdown 编辑器。
- 对普通 Markdown 文件可能过重。

推荐先用策略二：插件稳定后，在当前项目里通过 `.vscode/settings.json` 绑定默认打开方式。

## 安全注意事项

Webview 必须设置 CSP：

```
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
```

Markdown 渲染时不要直接使用 `innerHTML` 注入用户内容。现有 `report.js` 基本使用 `textContent` 和 `document.createElement`，这是优点，应继续保持。

链接协议只允许：

```
http:
https:
mailto:
file/workspace 内部 markdown 路径
```

不要允许任意 `javascript:`、`vscode:` 或未验证的命令链接。

## 实施步骤

### 第一步：创建插件骨架

创建：

```
package.json
tsconfig.json
src/extension.ts
```

先实现一个最小 Webview，确认 `.md` 可以通过 `Open With` 打开。

### 第二步：迁移静态资源

复制并改造：

```
docs/report-index-browser/report.css -> media/report.css
docs/report-index-browser/report.js -> media/reportViewer.js
```

删除 `fetch('/api/report')` 入口，改为监听 VS Code message。

### 第三步：实现单文件渲染

实现：

```
buildSingleFilePayload(uri, content)
extractMarkdownHeadings(content, label)
```

确认普通 Markdown 文件能渲染。

### 第四步：实现报告目录聚合

当 `autoGroupReportFolder = true` 时：

1. 读取当前文件所在目录。
2. 找出所有 `.md` 文件。
3. 按 `reportFileOrder` 排序。
4. 生成 `files` 数组。
5. 传给 Webview 渲染。

### 第五步：实现链接处理

前端拦截链接点击，将事件发给插件后端。

后端判断：

- HTTP/HTTPS：`vscode.env.openExternal`。
- 相对 `.md`：解析为 workspace 文件并 `vscode.open`。
- 页面内 anchor：前端自行处理，不发给后端。

### 第六步：适配 VS Code 主题

把 `report.css` 中主要颜色迁移到 VS Code CSS 变量。

### 第七步：项目级默认打开

确认插件稳定后，在当前项目设置：

```
{
  "workbench.editorAssociations": {
    "*.md": "meowReportMarkdown.viewer"
  }
}
```

## 验收清单

基础打开：

- 普通 `.md` 文件可以用 `Open with Meow Report Markdown Viewer` 打开。
- Webview 显示在 VS Code 中间 editor area。
- 打开后标题显示当前文件名。
- 文件修改后 Webview 自动刷新。

报告目录：

- 打开 `gameplay.md` 时，能聚合同目录下的报告文件。
- 聚合顺序符合 `gameplay.md -> system.md -> feedback.md -> marketing.md -> presentation.md -> numerical.md -> technical.md`。
- 左侧目录能显示文件标题和各级 heading。
- 点击目录能跳转到对应章节。

Markdown 渲染：

- 标题层级正常。
- 段落正常。
- 无序列表和有序列表正常。
- 表格正常。
- 代码块正常。
- 行内代码、粗体、斜体正常。
- 普通链接正常。

引用跳转：

- `[cite: 1]` 渲染为可点击引用。
- 点击引用能跳到 `Sources` 中对应编号。
- 来源高亮正常。
- 返回按钮能跳回原引用位置。

主题与样式：

- VS Code 深色主题下可读。
- VS Code 浅色主题下可读。
- 左侧目录和正文滚动不互相干扰。
- 大报告文件渲染时布局不明显卡顿。

安全：

- Markdown 内容不通过 `innerHTML` 直接注入。
- `javascript:` 链接不会执行。
- 外部链接通过 `vscode.env.openExternal` 打开。
- 本地文件路径只解析 workspace 内部相对路径。

## 后续增强

第一版稳定后，可以考虑：

1. 增加“单文件模式 / 目录聚合模式”切换按钮。
2. 增加搜索框，支持在当前渲染报告内搜索。
3. 增加 TOC 当前章节高亮。
4. 支持根据 `report_index.json` 显示游戏名称、appid、Steam 链接等元信息。
5. 支持导出当前渲染结果为 HTML。
6. 支持把引用来源折叠或固定在右侧。
7. 支持 command palette 命令：`Meow Report: Open Current Folder Report`。

## 推荐第一版范围

第一版建议控制在以下范围：

- `CustomTextEditorProvider` 打开 `.md`。
- 单文件渲染。
- 同目录报告文件聚合。
- 左侧目录。
- 现有 Markdown 渲染能力迁移。
- `[cite: n]` 引用跳转。
- VS Code 主题适配。
- 右键菜单打开。
- 当前 workspace 可配置默认打开。

暂不做：

- Webview 内编辑。
- report_index.json 游戏元信息联动。
- HTML 导出。
- 插件市场发布。

这样可以用较小风险把当前 `report.html` 的阅读体验先搬进 VS Code，后续再围绕报告索引和阅读效率继续扩展。