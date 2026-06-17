# Meow Report Markdown Viewer

一个用于 VS Code 的单文件 Markdown 阅读插件，提供：

- 左侧 TOC，按当前文件标题生成目录
- 标题自动编号
- 表格、代码块、粗体、斜体、行内代码渲染
- `[cite: n]` 引用跳转与返回原文（正文只显示蓝色数字；来源行以 `[cite source]` 标记，见 [格式规范](docs/markdown_format_spec.md)）

## 1. 环境要求

- VS Code `>= 1.90.0`
- Node.js `>= 18`，建议 `20`

## 2. 本地开发启动

在仓库根目录执行：

```bash
npm install
npm run compile
```

然后在 VS Code / Cursor 中：

1. 打开本仓库根目录
2. 打开“运行和调试”，确认顶部下拉框选中 `Run Extension`
3. 按 `F5` 启动 Extension Development Host
4. 在新窗口里打开任意 `.md` 文件测试，例如 `docs/fixtures/cite-demo.md`

如果直接执行 `npm run compile` 被 PowerShell 执行策略拦截，可以使用：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run compile
```

## 3. 打开 Markdown 阅读视图

安装插件后，`.md` 文件会在打开后自动切换到 `Meow Report Markdown Viewer`（可通过 `meowReportMarkdown.autoOpenReaderMode` 关闭）。

其他打开方式：

- 资源管理器右键 `.md`，选择 `Open with Meow Report Markdown Viewer`
- 编辑器标题栏右键，选择同名命令
- 命令面板执行 `Open with Meow Report Markdown Viewer`
- `Reopen Editor With...` 选择 `Meow Report Markdown Viewer`

## 4. 单文件行为

点击哪个 `.md` 文件，就只渲染当前这个文件。

插件不会扫描同目录下的其他 Markdown 文件，也不会把同文件夹里的多个 report 文件组合渲染。顶部只显示当前文件名，不显示文件路径、文件夹名或 Markdown 文件数量。

## 5. 目录交互

- 有子标题的目录项可折叠和展开
- 滚动正文时，目录会高亮当前段落对应条目
- 目录区域可滚动
- 拖动目录右边缘可调整宽度，宽度会保存在本地

## 6. 链接行为

- `http` / `https` / `mailto`：通过系统浏览器打开
- 相对 `.md` 链接：在 VS Code 内打开对应 Markdown 文件
- `#anchor`：在当前 webview 内跳转
- `javascript:` 等危险协议会被拦截

## 7. 常见问题

### Q1: 改了代码但预览没变化？

- 先执行 `npm run compile`
- 重启 Extension Development Host，或重新按 `F5`
- 关闭并重新打开当前 Markdown 阅读页，让 webview 加载新的脚本和样式

### Q2: 为什么点击 `.md` 还是默认文本编辑器？

- 确认 `meowReportMarkdown.autoOpenReaderMode` 为 `true`（默认开启）
- 确认当前窗口已加载本扩展
- 使用 `Reopen Editor With...` 手动选择阅读视图

### Q3: 打开 `.md` 时报 `Assertion Failed: Argument is undefined or null`？

这是 Cursor 在 Custom Editor 打开前 TextDocument 尚未就绪时的已知问题。插件会先加载文本模型再切换到阅读视图；若仍失败，请先用 **Open With → Text Editor** 打开一次，再执行 **Open with Meow Report Markdown Viewer**。
