---
name: 实现Markdown阅读插件
overview: 已确认 `report-index-browser` 源码已落仓，计划调整为“基于现有 report.js/report.css 直接迁移并最小改造入口”，并采用项目级默认打开策略。
todos:
  - id: wait-source-files
    content: 等待并确认 report-index-browser 四个源文件已加入仓库
    status: completed
  - id: scaffold-extension
    content: 创建插件骨架并注册 CustomTextEditorProvider 与命令
    status: completed
  - id: migrate-webview-assets
    content: 迁移并改造 report.css/report.js 到 media 资源
    status: completed
  - id: implement-payload-layer
    content: 实现 reportData.ts 与 markdownHeadings.ts 并接入自动刷新
    status: completed
  - id: implement-link-routing
    content: 完成外链与本地链接路由及安全协议校验
    status: completed
  - id: theme-and-association
    content: 完成主题变量适配与项目级 editor association
    status: completed
  - id: validate-acceptance
    content: 按验收清单进行构建与功能验证
    status: completed
isProject: false
---

# Markdown 阅读插件实施计划

## 实施前提
- 源文件已在仓库中：`report-index-browser/report.html`、`report-index-browser/report.css`、`report-index-browser/report.js`、`report-index-browser/server.js`。
- 默认打开策略采用“项目级默认打开”：插件 `customEditors.priority` 保持 `option`，并在项目里配置 editor association。

## 目标范围（第一版）
- 基于 `CustomTextEditorProvider` 在 VS Code 中间编辑区渲染 `.md`。
- 支持单文件渲染 + 同目录报告文件聚合渲染。
- 迁移现有报告阅读体验：左侧目录、标题编号、表格、引用跳转。
- 文档变更自动刷新。
- 链接分流：外链系统浏览器打开，本地 Markdown 链接在 VS Code 打开。

## 实施步骤
1. 创建插件骨架并完成基础注册
   - 新建目录与工程文件：[`tools/vscode-report-markdown-viewer/package.json`](tools/vscode-report-markdown-viewer/package.json)、[`tools/vscode-report-markdown-viewer/tsconfig.json`](tools/vscode-report-markdown-viewer/tsconfig.json)、[`tools/vscode-report-markdown-viewer/src/extension.ts`](tools/vscode-report-markdown-viewer/src/extension.ts)。
   - 注册 `meowReportMarkdown.viewer` 与 `meowReportMarkdown.openPreview` 命令。
   - 实现基础 Webview 页面、CSP 与消息通道。

2. 迁移阅读前端资源并改造数据入口
   - 迁移样式与渲染脚本：[`report-index-browser/report.css`](report-index-browser/report.css) -> [`tools/vscode-report-markdown-viewer/media/report.css`](tools/vscode-report-markdown-viewer/media/report.css)，[`report-index-browser/report.js`](report-index-browser/report.js) -> [`tools/vscode-report-markdown-viewer/media/reportViewer.js`](tools/vscode-report-markdown-viewer/media/reportViewer.js)。
   - 入口最小改造：移除 `loadReport()` 中 `fetch('/api/report?appid=...')`，改为监听扩展发送的 `render` 消息并调用 `renderReport(payload)`。
   - UI 适配改造：去除/隐藏 Webview 内无效元素（如主页跳转、Steam 链接），保留 `toc/reportContent` 主体。
   - 保留现有安全渲染方式（`createElement` / `textContent`），避免把 Markdown 直接注入 `innerHTML`。

3. 实现后端数据构建层
   - 新增 [`tools/vscode-report-markdown-viewer/src/reportData.ts`](tools/vscode-report-markdown-viewer/src/reportData.ts)：实现单文件 payload 与目录聚合 payload。
   - 新增 [`tools/vscode-report-markdown-viewer/src/markdownHeadings.ts`](tools/vscode-report-markdown-viewer/src/markdownHeadings.ts)：迁移 heading 提取与稳定 anchor 生成。
   - 在 `extension.ts` 中接入数据构建逻辑，监听 `onDidChangeTextDocument` 做自动刷新。

4. 完成链接路由与路径解析
   - Webview 前端拦截链接点击后发消息；对于 `[cite: n]`、目录锚点继续保留前端本地处理。
   - 扩展端处理：`http/https/mailto` 走 `vscode.env.openExternal`；相对 `.md` 路径基于当前文档目录解析后用 `vscode.open`。
   - 屏蔽危险协议（如 `javascript:`、未验证命令协议）。

5. 主题适配与配置落地
   - 在 [`tools/vscode-report-markdown-viewer/media/report.css`](tools/vscode-report-markdown-viewer/media/report.css) 用 VS Code 变量替换关键颜色。
   - 配置 `package.json` 的 `meowReportMarkdown.autoGroupReportFolder` 与 `meowReportMarkdown.reportFileOrder`。
   - 添加项目关联：[` .vscode/settings.json`](.vscode/settings.json)（`"*.md": "meowReportMarkdown.viewer"`）。

6. 本地构建与验收
   - 编译插件并在 Extension Development Host 中验证。
   - 按方案验收清单逐项验证：打开行为、聚合顺序、目录跳转、引用跳转、刷新机制、主题可读性与基础安全项。

## 风险与对策
- 迁移差异风险：`report.js` 与 VS Code Webview 环境差异（无 HTTP API、路径处理不同）可能导致引用和链接行为变化；通过“先单文件再聚合”的分阶段验证降低风险。
- 路径兼容风险：Windows 相对路径与 URI 解析容易出错；统一在扩展后端做 URI 解析并下发规范化数据。
- 性能风险：大文件聚合渲染可能卡顿；第一版保留结构，后续可加分块渲染或延迟渲染。

## 验收重点
- 打开 `.md` 后渲染视图位于 editor area，且随文档变更自动刷新。
- 报告目录聚合顺序符合配置，TOC 与正文锚点一致。
- `[cite: n]` 跳转与回跳行为可用。
- 外链在系统浏览器打开，本地 Markdown 链接在 VS Code 内打开。