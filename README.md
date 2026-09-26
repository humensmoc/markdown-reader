# Markdown Reader

**[中文](#中文)** | **[English](#english)**

---

<a id="中文"></a>

## 中文

一个用于 VS Code / Cursor 的单文件 Markdown 阅读与批注插件，提供：

- 可悬浮、换边、缩放并记忆状态的 TOC 与批注侧栏
- 标题自动编号，以及可持久化的字体、行宽、主题等阅读样式
- 表格、代码块、Mermaid、粗体、斜体、行内代码与 Obsidian 笔记属性渲染
- `[cite: n]` 引用跳转与返回原文（正文只显示蓝色数字；来源行以 `[cite source]` 标记，见 [格式规范](docs/markdown_format_spec.md)）
- CodeMirror 6 实时预览编辑、源码范围块拖拽，沿用 VS Code 保存与撤销
- 划词高亮：正文 `==高亮==`、可选脚注评论、悬停预览与点击编辑，可在 Obsidian 阅读
- 内嵌批注：正文定位、上下条导航、AI 回复高亮、解决归档，数据保存在当前 Markdown 中

### 安装

<!-- 上架 Marketplace / Open VSX 后，在此补充一键安装链接，例如： -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=humensmoc.markdown-reader) -->

当前若尚未上架扩展市场，可从源码本地安装，见下方 [开发与发布](#开发与发布)。

### 使用

默认情况下，`.md` 文件以 VS Code/Cursor 内置文本编辑器打开。如需左键打开时自动进入阅读器，可：

- 阅读视图右下角 **设置** → 开启 **左键打开 .md 时使用阅读器**
- 或在 VS Code 设置中将 `meowReportMarkdown.autoOpenReaderMode` 设为 `true`

其他打开方式：

- 资源管理器右键 `.md` → **Open with Markdown Reader**
- 编辑器标题栏右键 → 同名命令
- 命令面板 → **Open with Markdown Reader**
- **Reopen Editor With...** → **Markdown Reader**

#### 行为说明

- **单文件渲染**：打开哪个 `.md` 就只渲染当前文件，不会扫描或合并同目录其他 Markdown
- **目录**：子标题可折叠；滚动正文时高亮当前段落；可拖动右边缘调整宽度（宽度会本地保存）
- **批注**：选中正文后添加批注；AI 修改正文后，与批注相关的所有改动都会直接在正文中高亮，批注卡片会区分用户问题和 AI 回复；解决后的批注继续留在 Markdown 文末，并可从右下角“已解决批注”按钮查看
- **链接**：`http` / `https` / `mailto` 走系统浏览器；相对 `.md` 在编辑器内打开；`#anchor` 在 webview 内跳转；危险协议（如 `javascript:`）会被拦截

#### 普通渲染与实时编辑（0.0.12）

每次打开默认使用普通渲染，支持 Obsidian 图片、指定宽度与点击全屏查看。点击右下角设置按钮上方的书本按钮切换到实时编辑，再点铅笔按钮返回普通渲染；悬停提示当前模式。切换不保存或重写文件，未同步输入会先完成同步，外部修改会更新当前视图。

实时编辑中，标题、粗体、斜体、删除线、行内代码和链接在光标离开后隐藏 Markdown 标记；光标或选区进入时显示标记，并保留对应样式。未闭合的语法保留原文。

- 输入立即同步 VS Code 文档；**Ctrl+S** 或已有自动保存设置负责落盘。正文和表格输入不主动保存。批注、高亮仍在显式保存时写入磁盘。
- **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y** 使用 VS Code 文档撤销历史；**Ctrl+B / Ctrl+I** 为选文切换粗体和斜体。
- 表格保持网格显示，点击单元格即可输入。**Tab / Shift+Tab** 切换单元格，**Enter** 到下一行同列，最后一行退出；**Esc** 返回正文。支持跨格选字和批量高亮。
- 普通链接单击编辑，**Ctrl/Cmd+单击**打开；引用数字单击跳转，并提供“返回原文”。公式、图片、Mermaid 点击展开源码，Mermaid 保留放大按钮。
- 设置中的 **显示全部 Markdown 标记**，或同名命令面板命令，仅切换显示方式，不产生另一份文档。
- 遇到重叠的外部修改时，编辑器暂停写入并保留本地输入。先使用 **查看差异** 复制/保存需要的内容，再选择重新加载。非重叠修改自动映射。
- 打开、移动光标、折叠、切换主题不会格式化文件，不更改用户的默认打开方式与自动保存设置。
- 彩虹标题在显示编号时只给编号着色；块拖动手柄位于正文左侧，引用跳转显示来源高亮框。0.0.10 修复了预览块间距、退出表格单元格时引起的鼠标定位偏移。
- 标题编号与标题文字字号一致；正文与目录使用相同的折叠箭头，引用块沿用白色竖线和正文颜色。

实现与验收记录见 [实时预览开发说明](docs/live-preview.md)。

#### 划词高亮与阅读评论

直接在正文或表格中选中文字，快速点击笔形按钮即可高亮；悬停约 350ms，或点击“评论”，可填写可选评论。Enter 保存、Shift+Enter 换行、Esc 取消，输入法选字不会触发保存。点击已有高亮可修改评论或删除。

从 0.0.6 起，新高亮直接保存为正文 `==文字==`，评论保存为对应脚注。没有评论时不生成脚注；Obsidian 可使用其原生高亮与脚注语法显示。新标记统一使用黄色，不再记录自定义颜色。例如：

```markdown
这是一段==重要内容==[^mark1]。

[^mark1]: 之后再看
```

可直接打开 [高亮与脚注示例](docs/fixtures/highlights-demo.md) 试用。阅读器也识别手写的高亮和紧跟高亮（或一个标点之后）的脚注。删除高亮会保留正文，并清理仅被该高亮引用的评论脚注；被其他地方引用的脚注保留。

旧版 `<!-- mr-highlight {...} -->` 仍能读取，打开文档不会自动改写。编辑旧高亮并保存时，仅将该条转换为新格式；无法准确定位时保留原数据并提示。旧版重叠高亮不适合嵌套 `==...==`，转换冲突时需先调整选区。

从 0.0.8 起，可一次选中多行正文、多段文字、列表、引用或多个表格单元格并高亮。阅读器按源码行、单元格和格式边界自动拆分，保留首尾的精确选区、表格分隔符、列表编号和原有换行；显示时的自动折行不影响高亮。一次保存统一写入，撤销一次即可还原整批标记。已有高亮和评论保持原样，只补上未高亮的部分。

批量高亮添加评论时，各片段共用一条脚注；重新打开文档后，点击任一片段修改评论会同步整组，删除高亮只取消当前片段。清空共享评论会取消整组评论，保留各片段高亮。公式和代码块暂不参与高亮，跨过这些内容选择时会提示已跳过；行内代码需完整选中。表格拖选按实际文字选区处理，不会自动扩大为整列。

拖拽排序和实时预览编辑会保留新格式。阅读评论不进入 AI 待处理队列，需要 AI 修改正文时使用“AI 批注”。

#### AI 批注回写格式

Markdown Reader 不绑定某一家 AI。AI 或自动化工具修改正文后，应保留批注块，并在修改前后对照确认实际改动。在元数据的 `change_quotes` JSON 字符串数组中，逐项记录所有与该批注直接相关、且能在修改后正文中精确匹配的改动。不要记录未变化的上下文或无关的顺手调整。改动简述追加在 `AI 回复` 下；旧版单值 `change_quote` 仍然兼容：

批注状态为 `open`（待处理）、`pending_review`（待验收）、`resolved`（已解决）。AI 只处理 `open`，完成本轮修改、更新 `change_quotes` 和 `AI 回复` 后，将状态设为 `pending_review`；未完成时保留 `open` 并说明原因。AI 不得写入 `resolved` 或 `resolved_at`，待验收和已解决批注不主动处理。

每次新增或编辑批注时，阅读器都会补充缺失的隐藏 AI 操作指南，或将已有指南升级到当前版本，不重复添加。仅打开旧文档不会改写文件。

```markdown
<!-- mr-annotation:start
id: "annotation-20260910120000000"
quote: "用户最初选中的内容"
created_at: "2026-09-10T04:00:00.000Z"
status: "pending_review"
change_quotes: ["第一处相关改动正文", "第二处相关改动正文"]
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

阅读器会逐项匹配并高亮 `change_quotes` 中的正文，并兼容表格行、列表、标题和常见行内 Markdown 语法。待验收批注显示橙色边框，仍计入未解决数量。验收有问题时，点击“编辑”，补充要求并将状态改回“待处理（open）”；保留上次 AI 回复供参考，但不再显示待验收样式。AI 再次处理时应更新本轮改动和回复；写入 `change_quotes` 时移除旧 `change_quote`，避免高亮过期内容。

点击“确认解决”后会写入 `status: "resolved"` 和 `resolved_at`；批注块不删除，也不会作为普通正文渲染。状态仍存储在 Markdown 中，这套流程依赖外部 AI 遵守操作指南，不校验修改者身份。

### 数学公式

从 0.0.7 起，内置 KaTeX 和字体，离线支持 LaTeX 数学公式：行内使用 `$...$` 或 `\(...\)`，独立公式使用 `$$...$$` 或 `\[...\]`，独立公式可以跨多行。支持分式、矩阵、积分、求和及 `aligned` 等 KaTeX 支持的数学语法。

公式也可放在列表、引用和表格单元格中。代码块与行内代码不渲染公式；转义美元 `\$` 保持原样。错误或不支持的公式保留源码，悬停可查看原因。长公式在自身区域横向滚动。

公式默认显示排版结果，点击后就地展开 LaTeX 源码；光标离开后恢复预览。编辑周围文字保留原始 LaTeX。示例见 [公式示例](docs/fixtures/math-demo.md)。

### 常见问题

#### 改了代码但预览没变化？

见 [开发文档](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) 中的刷新说明。

#### 想让左键打开 `.md` 时自动进入阅读器？

- 阅读视图右下角 **设置** → 开启 **左键打开 .md 时使用阅读器**
- 或在设置中将 `meowReportMarkdown.autoOpenReaderMode` 设为 `true`
- 确认当前窗口已加载本扩展

#### 右键打开后没有进入阅读器？

#### 打开 `.md` 时报 `Assertion Failed: Argument is undefined or null`？

这是 Cursor 在 Custom Editor 打开前 TextDocument 尚未就绪时的已知问题。可先用 **Open With → Text Editor** 打开一次，再执行 **Open with Markdown Reader**。

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

#### 本地打包安装（Cursor / VS Code）

F5 验证通过后，**推荐**使用仓库根目录的一键脚本（编译 → 打 VSIX → 安装到本机已检测到的 Cursor 和 VS Code）：

| 平台 | 操作 |
|------|------|
| Windows | 将 [`Package.bat`](Package.bat) 拖入 cmd / PowerShell，回车 |
| macOS | 首次执行 `chmod +x Package.sh`，再将 [`Package.sh`](Package.sh) 拖入 Terminal 回车（或 `bash Package.sh`） |

脚本会自动：检查 Node.js → 缺少依赖时 `npm install` → `npm run package:local` → 调用可用的 Cursor / VS Code CLI 安装 → 提示 **Developer: Reload Window**。只安装其中一个编辑器时，脚本会跳过缺失的另一个。

Windows 会查找常见安装目录和 PATH；macOS 若 PATH 中没有 `cursor` / `code`，会回退到 `/Applications/Cursor.app/.../cursor` 与 `/Applications/Visual Studio Code.app/.../code`。

也可手动执行：

```bash
npm run package:local
cursor --install-extension ./markdown-reader-<version>.vsix --force
code --install-extension ./markdown-reader-<version>.vsix --force
```

`<version>` 见 `package.json`（当前生成 `markdown-reader-0.0.11.vsix`）。若 CLI 不在 PATH，请换成本机 CLI 路径，或用 **Extensions: Install from VSIX...** 图形安装。

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

A single-file Markdown reader, editor, and annotation extension for VS Code / Cursor. Features:

- A floating, resizable, side-switchable TOC and annotation dock with persisted layout
- Automatic heading numbering and persistent typography, width, and theme settings
- Tables, code blocks, Mermaid, inline formatting, and read-only Obsidian properties
- `[cite: n]` citation navigation with jump-back (body shows blue numbers only; source lines use `[cite source]` — see [format spec](docs/markdown_format_spec.md))
- CodeMirror 6 live preview editing, draggable Markdown blocks, and save-back to the original file
- Embedded annotations with source navigation, AI-response highlighting, and resolved-history storage in the Markdown file

### Installation

<!-- After publishing to Marketplace / Open VSX, add one-click install badges here, e.g.: -->
<!-- [![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/items?itemName=humensmoc.markdown-reader) -->

Not yet on the extension marketplace? Install from source — see [Development & release](#development--release) below.

### Usage

By default, `.md` files open in the built-in text editor. To use **Markdown Reader**, pick one of:

- Explorer: right-click a `.md` file → **Open with Markdown Reader** (recommended)
- Editor title bar: right-click → same command
- Command Palette → **Open with Markdown Reader**
- **Reopen Editor With...** → **Markdown Reader**

To auto-switch every `.md` file to the reader on left-click:

- Reader view → bottom-right **Settings** → enable **Open .md with reader on click**
- Or set `meowReportMarkdown.autoOpenReaderMode` to `true` in VS Code settings

#### Behavior

- **Single-file rendering**: Only the opened `.md` is rendered; sibling Markdown files in the same folder are not scanned or merged
- **TOC**: Collapsible sub-headings; scroll-sync highlight; resize, collapse, or switch sides with the layout persisted locally
- **Annotations**: Select body text to add one; navigate unresolved items, highlight the AI-updated passage, and keep resolved history inside the current Markdown
- **Rendering modes**: Documents open in read mode by default. Use the button above Settings to switch to the CodeMirror live editor and back. Switching preserves unsaved changes. In live mode, tables stay editable grids; Ctrl+S and auto-save write to disk, and undo/redo uses VS Code history.
- **Links**: `http` / `https` / `mailto` open in the system browser; relative `.md` opens in the editor; `#anchor` jumps inside the webview; dangerous schemes (e.g. `javascript:`) are blocked

### FAQ

#### Code changed but preview didn’t update?

See the reload instructions in the [dev guide](docs/how-to-release&update-local&extension-market.md#23-改代码后如何刷新) (Chinese).

#### Want every `.md` to open in the reader automatically?

- Reader view → bottom-right **Settings** → enable **Open .md with reader on click**
- Or set `meowReportMarkdown.autoOpenReaderMode` to `true` in settings
- Confirm the extension is loaded in the current window

#### Reader did not open from the context menu?

- Use **Reopen Editor With...** and pick **Markdown Reader**
- Reload the window after installing or updating the extension

#### `Assertion Failed: Argument is undefined or null` when opening `.md`?

Known Cursor issue when the TextDocument isn’t ready before the Custom Editor opens. Open once with **Open With → Text Editor**, then run **Open with Markdown Reader**.

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

#### Local package & install (Cursor / VS Code)

After F5 verification, **recommended**: use the one-click scripts at the repo root (compile → VSIX → install into detected Cursor and VS Code apps):

| Platform | Action |
|----------|--------|
| Windows | Drag [`Package.bat`](Package.bat) into cmd / PowerShell, press Enter |
| macOS | Run `chmod +x Package.sh` once, then drag [`Package.sh`](Package.sh) into Terminal (or `bash Package.sh`) |

The scripts check Node.js → `npm install` if needed → `npm run package:local` → install through each available Cursor / VS Code CLI → prompt **Developer: Reload Window**. A missing editor is skipped when the other is available.

Manual alternative:

```bash
npm run package:local
cursor --install-extension ./markdown-reader-<version>.vsix --force
code --install-extension ./markdown-reader-<version>.vsix --force
```

See `version` in `package.json` (currently produces `markdown-reader-0.0.11.vsix`). If a CLI is not in PATH, use its full local path or install through **Extensions: Install from VSIX...**.

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
