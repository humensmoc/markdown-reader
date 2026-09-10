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
- 内嵌批注：批注保存在当前 Markdown 中，在本阅读器显示于目录对侧，在其他阅读器退化为普通引用块

### 安装

<!-- 上架 Marketplace / Open VSX 后，在此补充一键安装链接，例如： -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=meow-agent.meow-report-markdown-viewer) -->

当前若尚未上架扩展市场，可从源码本地安装，见下方 [开发与发布](#开发与发布)。

### 使用

默认情况下，`.md` 文件以 VS Code/Cursor 内置文本编辑器打开。如需左键打开时自动进入阅读器，可：

- 阅读视图右下角 **设置** → 开启 **左键打开 .md 时使用阅读器**
- 或在 VS Code 设置中将 `meowReportMarkdown.autoOpenReaderMode` 设为 `true`

其他打开方式：

- 资源管理器右键 `.md` → **Open with Meow Report Markdown Viewer**
- 编辑器标题栏右键 → 同名命令
- 命令面板 → **Open with Meow Report Markdown Viewer**
- **Reopen Editor With...** → **Meow Report Markdown Viewer**

#### 行为说明

- **单文件渲染**：打开哪个 `.md` 就只渲染当前文件，不会扫描或合并同目录其他 Markdown
- **目录**：子标题可折叠；滚动正文时高亮当前段落；可拖动右边缘调整宽度（宽度会本地保存）
- **批注**：选中正文后添加批注；AI 修改正文后可在原批注中记录首个改动片段和回复；解决后的批注继续留在 Markdown 文末，并可从右下角“批注”按钮查看
- **链接**：`http` / `https` / `mailto` 走系统浏览器；相对 `.md` 在编辑器内打开；`#anchor` 在 webview 内跳转；危险协议（如 `javascript:`）会被拦截

#### AI 批注回写格式

Markdown Reader 不绑定某一家 AI。AI 或自动化工具修改正文后，应保留批注块，在元数据中写入修改后正文里可精确匹配的 `change_quote`（有多处改动时只写第一处），并把简述追加在 `AI 回复` 下：

```markdown
<!-- mr-annotation:start
id: "annotation-20260910120000000"
quote: "用户最初选中的内容"
created_at: "2026-09-10T04:00:00.000Z"
status: "open"
change_quote: "AI 修改后的第一处正文"
-->
> **批注：用户最初选中的内容**
>
> 用户提出的问题或修改要求
>
> **AI 回复：**
>
> 已调整这一段的表述，并补充了缺失的条件。
<!-- mr-annotation:end -->
```

阅读器会把正文高亮从原选区切换到 `change_quote`。点击“解决”后会写入 `status: "resolved"` 和 `resolved_at`；批注块不删除，也不会作为普通正文渲染。

### 常见问题

#### 改了代码但预览没变化？

见 [开发文档](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) 中的刷新说明。

#### 想让左键打开 `.md` 时自动进入阅读器？

- 阅读视图右下角 **设置** → 开启 **左键打开 .md 时使用阅读器**
- 或在设置中将 `meowReportMarkdown.autoOpenReaderMode` 设为 `true`
- 确认当前窗口已加载本扩展

#### 右键打开后没有进入阅读器？

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

F5 验证通过后，**推荐**使用仓库根目录的一键脚本（编译 → 打 VSIX → 安装到 Cursor）：

| 平台 | 操作 |
|------|------|
| Windows | 将 [`Package.bat`](Package.bat) 拖入 cmd / PowerShell，回车 |
| macOS | 首次执行 `chmod +x Package.sh`，再将 [`Package.sh`](Package.sh) 拖入 Terminal 回车（或 `bash Package.sh`） |

脚本会自动：检查 Node.js → 缺少依赖时 `npm install` → `npm run package:local` → 调用 Cursor CLI 安装 → 提示 **Developer: Reload Window**。

Windows 优先使用 `%LOCALAPPDATA%\Programs\cursor\...\cursor.cmd`；macOS 若 PATH 无 `cursor`，会回退到 `/Applications/Cursor.app/.../cursor`。

也可手动执行：

```bash
npm run package:local
cursor --install-extension ./markdown-reader-<version>.vsix --force
```

`<version>` 见 `package.json`（当前生成 `markdown-reader-0.0.2.vsix`）。Windows / Linux 若 `cursor` 不在 PATH，请换成本机 CLI 路径，或用 **Extensions: Install from VSIX...** 图形安装。

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
- Embedded annotations stored in the current Markdown; this reader shows them opposite the TOC, while other readers render ordinary blockquotes

### Installation

<!-- After publishing to Marketplace / Open VSX, add one-click install badges here, e.g.: -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=meow-agent.meow-report-markdown-viewer) -->

Not yet on the extension marketplace? Install from source — see [Development & release](#development--release) below.

### Usage

By default, `.md` files open in the built-in text editor. To use **Meow Report Markdown Viewer**, pick one of:

- Explorer: right-click a `.md` file → **Open with Meow Report Markdown Viewer** (recommended)
- Editor title bar: right-click → same command
- Command Palette → **Open with Meow Report Markdown Viewer**
- **Reopen Editor With...** → **Meow Report Markdown Viewer**

To auto-switch every `.md` file to the reader on left-click:

- Reader view → bottom-right **Settings** → enable **Open .md with reader on click**
- Or set `meowReportMarkdown.autoOpenReaderMode` to `true` in VS Code settings

#### Behavior

- **Single-file rendering**: Only the opened `.md` is rendered; sibling Markdown files in the same folder are not scanned or merged
- **TOC**: Collapsible sub-headings; scroll-sync highlight; drag the right edge to resize (width persisted locally)
- **Annotations**: Select body text to add one, then edit, delete, or click it to highlight the source text; annotations are appended to the end of the current Markdown instead of a companion file
- **Links**: `http` / `https` / `mailto` open in the system browser; relative `.md` opens in the editor; `#anchor` jumps inside the webview; dangerous schemes (e.g. `javascript:`) are blocked

### FAQ

#### Code changed but preview didn’t update?

See the reload instructions in the [dev guide](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) (Chinese).

#### Want every `.md` to open in the reader automatically?

- Reader view → bottom-right **Settings** → enable **Open .md with reader on click**
- Or set `meowReportMarkdown.autoOpenReaderMode` to `true` in settings
- Confirm the extension is loaded in the current window

#### Reader did not open from the context menu?

- Use **Reopen Editor With...** and pick **Meow Report Markdown Viewer**
- Reload the window after installing or updating the extension

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

After F5 verification, **recommended**: use the one-click scripts at the repo root (compile → VSIX → install into Cursor):

| Platform | Action |
|----------|--------|
| Windows | Drag [`Package.bat`](Package.bat) into cmd / PowerShell, press Enter |
| macOS | Run `chmod +x Package.sh` once, then drag [`Package.sh`](Package.sh) into Terminal (or `bash Package.sh`) |

The scripts check Node.js → `npm install` if needed → `npm run package:local` → install via Cursor CLI → prompt **Developer: Reload Window**.

Manual alternative:

```bash
npm run package:local
cursor --install-extension ./markdown-reader-<version>.vsix --force
```

See `version` in `package.json` (currently produces `markdown-reader-0.0.2.vsix`). On Windows / Linux, use your local `cursor` path if not in PATH, or install via **Extensions: Install from VSIX...**.

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
