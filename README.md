# Meow Report Markdown Viewer

**[中文](#中文)** | **[English](#english)**

---

<a id="中文"></a>

## 中文

一个用于 VS Code / Cursor 的单文件 Markdown 阅读插件，提供：

- 左侧 TOC，按当前文件标题生成目录
- 标题自动编号
- 表格、代码块、粗体、斜体、行内代码渲染
- `[cite: n]` 引用跳转与返回原文（正文只显示蓝色数字；来源行以 `[cite source]` 标记，见 [格式规范](docs/markdown_format_spec.md)）

### 安装

<!-- 上架 Marketplace / Open VSX 后，在此补充一键安装链接，例如： -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=meow-agent.meow-report-markdown-viewer) -->

当前若尚未上架扩展市场，可从源码本地安装，见下方 [开发与发布](#开发与发布)。

### 使用

安装插件后，`.md` 文件会在打开后自动切换到 **Meow Report Markdown Viewer**（可通过设置 `meowReportMarkdown.autoOpenReaderMode` 关闭，默认 `true`）。

其他打开方式：

- 资源管理器右键 `.md` → **Open with Meow Report Markdown Viewer**
- 编辑器标题栏右键 → 同名命令
- 命令面板 → **Open with Meow Report Markdown Viewer**
- **Reopen Editor With...** → **Meow Report Markdown Viewer**

#### 行为说明

- **单文件渲染**：打开哪个 `.md` 就只渲染当前文件，不会扫描或合并同目录其他 Markdown
- **目录**：子标题可折叠；滚动正文时高亮当前段落；可拖动右边缘调整宽度（宽度会本地保存）
- **链接**：`http` / `https` / `mailto` 走系统浏览器；相对 `.md` 在编辑器内打开；`#anchor` 在 webview 内跳转；危险协议（如 `javascript:`）会被拦截

### 常见问题

#### 改了代码但预览没变化？

见 [开发文档](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) 中的刷新说明。

#### 为什么点击 `.md` 还是默认文本编辑器？

- 确认 `meowReportMarkdown.autoOpenReaderMode` 为 `true`
- 确认当前窗口已加载本扩展
- 使用 **Reopen Editor With...** 手动选择阅读视图

#### 打开 `.md` 时报 `Assertion Failed: Argument is undefined or null`？

这是 Cursor 在 Custom Editor 打开前 TextDocument 尚未就绪时的已知问题。可先用 **Open With → Text Editor** 打开一次，再执行 **Open with Meow Report Markdown Viewer**。

### 开发与发布

本仓库面向贡献者与维护者。完整的 **F5 调试 → 本地打包 → 商城发布 → 版本更新** 流程见：

**[docs/how-to-release&update-local&extension-market.md](docs/how-to-release&update-local&extension-market.md)**（中文）

#### 快速开始（F5 调试）

**环境**：Node.js `>= 18`（建议 20+），VS Code / Cursor `>= 1.90.0`

```bash
npm install
npm run compile
```

在 Cursor / VS Code 中打开本仓库 → **运行和调试** → 选择 **Run Extension** → 按 **F5** → 在新窗口打开 `docs/fixtures/cite-demo.md` 测试。

#### 本地打包安装（Cursor）

F5 验证通过后：

```bash
npm run compile
npx vsce package --allow-missing-repository --no-rewrite-relative-links
"/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
  --install-extension ./meow-report-markdown-viewer-0.0.1.vsix --force
```

Windows / Linux 请将 `cursor` 路径换为本机 CLI；也可用 **Extensions: Install from VSIX...** 图形安装。

#### 对外发版（摘要）

1. 更新 `CHANGELOG.md`，递增 `package.json` 中的 `version`
2. `npx vsce publish patch` → [VS Code Marketplace](https://marketplace.visualstudio.com/)
3. `npx ovsx publish` → [Open VSX](https://open-vsx.org/)（Cursor 用户可搜索安装）

细节、首次 Publisher 注册、PAT 配置与发版 checklist 均见 [开发文档](docs/how-to-release&update-local&extension-market.md)。

### 文档索引

| 文档 | 内容 |
|------|------|
| [how-to-release&update-local&extension-market.md](docs/how-to-release&update-local&extension-market.md) | 开发、F5、打包、本地安装、商城发布与更新 |
| [markdown_format_spec.md](docs/markdown_format_spec.md) | Markdown / cite 格式规范 |
| [markdown_reader_plan.md](docs/markdown_reader_plan.md) | 插件架构与设计 |

### License

<!-- 添加 LICENSE 文件后在此注明，例如：MIT -->

---

<a id="english"></a>

## English

A single-file Markdown reader extension for VS Code / Cursor. Features:

- Left sidebar TOC generated from headings in the current file
- Automatic heading numbering
- Tables, code blocks, bold, italic, and inline code rendering
- `[cite: n]` citation navigation with jump-back (body shows blue numbers only; source lines use `[cite source]` — see [format spec](docs/markdown_format_spec.md))

### Installation

<!-- After publishing to Marketplace / Open VSX, add one-click install badges here, e.g.: -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=meow-agent.meow-report-markdown-viewer) -->

Not yet on the extension marketplace? Install from source — see [Development & release](#development--release) below.

### Usage

After installation, opening a `.md` file automatically switches to **Meow Report Markdown Viewer** (disable via `meowReportMarkdown.autoOpenReaderMode`, default `true`).

Other ways to open:

- Explorer: right-click a `.md` file → **Open with Meow Report Markdown Viewer**
- Editor title bar: right-click → same command
- Command Palette → **Open with Meow Report Markdown Viewer**
- **Reopen Editor With...** → **Meow Report Markdown Viewer**

#### Behavior

- **Single-file rendering**: Only the opened `.md` is rendered; sibling Markdown files in the same folder are not scanned or merged
- **TOC**: Collapsible sub-headings; scroll-sync highlight; drag the right edge to resize (width persisted locally)
- **Links**: `http` / `https` / `mailto` open in the system browser; relative `.md` opens in the editor; `#anchor` jumps inside the webview; dangerous schemes (e.g. `javascript:`) are blocked

### FAQ

#### Code changed but preview didn’t update?

See the reload instructions in the [dev guide](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) (Chinese).

#### `.md` still opens in the default text editor?

- Ensure `meowReportMarkdown.autoOpenReaderMode` is `true`
- Confirm the extension is loaded in the current window
- Use **Reopen Editor With...** and pick the reader view manually

#### `Assertion Failed: Argument is undefined or null` when opening `.md`?

Known Cursor issue when the TextDocument isn’t ready before the Custom Editor opens. Open once with **Open With → Text Editor**, then run **Open with Meow Report Markdown Viewer**.

### Development & release

For contributors and maintainers. Full workflow (**F5 debug → local VSIX → marketplace publish → updates**):

**[docs/how-to-release&update-local&extension-market.md](docs/how-to-release&update-local&extension-market.md)** (Chinese)

#### Quick start (F5 debug)

**Requirements**: Node.js `>= 18` (20+ recommended), VS Code / Cursor `>= 1.90.0`

```bash
npm install
npm run compile
```

Open this repo in Cursor / VS Code → **Run and Debug** → select **Run Extension** → press **F5** → in the new window, open `docs/fixtures/cite-demo.md` to test.

#### Local package & install (Cursor)

After F5 verification:

```bash
npm run compile
npx vsce package --allow-missing-repository --no-rewrite-relative-links
"/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
  --install-extension ./meow-report-markdown-viewer-0.0.1.vsix --force
```

On Windows / Linux, use your local `cursor` CLI path, or install via **Extensions: Install from VSIX...**.

#### Public release (summary)

1. Update `CHANGELOG.md` and bump `version` in `package.json`
2. `npx vsce publish patch` → [VS Code Marketplace](https://marketplace.visualstudio.com/)
3. `npx ovsx publish` → [Open VSX](https://open-vsx.org/) (searchable in Cursor)

Publisher setup, PAT, and release checklist: [dev guide](docs/how-to-release&update-local&extension-market.md).

### Documentation

| Document | Description |
|----------|-------------|
| [how-to-release&update-local&extension-market.md](docs/how-to-release&update-local&extension-market.md) | Dev, F5, packaging, local install, marketplace release |
| [markdown_format_spec.md](docs/markdown_format_spec.md) | Markdown / cite format spec |
| [markdown_reader_plan.md](docs/markdown_reader_plan.md) | Architecture and design |

### License

<!-- Add LICENSE file and note here, e.g. MIT -->
