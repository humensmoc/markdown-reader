# 开发、打包、发布与更新

本文是 **Markdown Reader** 仓库的开发者指南，说明从日常改代码、F5 调试，到本地安装 VSIX，再到发布到扩展商城及后续更新的完整流程。

适用于 **VS Code** 与 **Cursor**（两者扩展 API 相同，调试与打包命令一致）。

---

## 流程概览

```text
改代码 → F5 调试验证 → Package.bat / Package.sh（或手动打包 .vsix）→ 本地安装自测
                              ↓
                    bump version + CHANGELOG
                              ↓
              vsce publish（VS Code 商城）+ ovsx publish（Open VSX / Cursor 可搜）
```

| 阶段 | 是否需要改 version | 典型命令 |
|------|-------------------|----------|
| 日常 F5 调试 | 否 | F5 / Reload Window |
| 本地 VSIX 安装 | 建议递增 patch | `Package.bat` / `Package.sh`（推荐），或 `npm run package:local` + `cursor --install-extension` |
| 对外发版 | **必须递增** | `vsce publish` / `ovsx publish` |

---

## 1. 环境要求

- **Node.js** `>= 18`，建议 LTS 20+
- **VS Code / Cursor** `>= 1.90.0`（与 `package.json` 中 `engines.vscode` 一致）
- 本仓库根目录执行所有命令

首次克隆后：

```bash
npm install
npm run compile
```

---

## 2. 日常开发：F5 调试（改代码时首选）

F5 会启动 **Extension Development Host**（一个带本扩展的开发窗口），不污染你日常 Cursor/VS Code 里已安装的扩展，**日常改代码应优先用这种方式**。

### 2.1 启动步骤

1. 用 Cursor 或 VS Code **打开本仓库根目录**（或打开 `markdown-reader.code-workspace`）
2. 侧边栏打开 **运行和调试**（Run and Debug）
3. 顶部下拉框选择 **`Run Extension`**
4. 按 **F5**（或点击绿色启动按钮）

F5 会自动执行 `npm run compile`（见 `.vscode/launch.json` 中的 `preLaunchTask`），然后新开一个 **Extension Development Host** 窗口。

### 2.2 在新窗口里怎么测

在新开的开发窗口中：

1. 打开测试用 Markdown，例如：
   - `docs/fixtures/cite-demo.md` — 引用跳转
   - `docs/fixtures/extended-markdown-demo.md` — 表格、代码块等
   - `docs/fixtures/tomodachi-cite-demo.md` — 综合示例
2. 确认进入 **Markdown Reader** 阅读视图（是否自动打开由 `meowReportMarkdown.autoOpenReaderMode` 控制）
3. 逐项检查：TOC、标题编号、`[cite:n]` 跳转、链接、滚动高亮等

### 2.3 改代码后如何刷新

| 改了什么 | 怎么做 |
|----------|--------|
| `src/*.ts`（扩展主逻辑） | 保存 → `npm run compile`（F5 已自动 compile 时可省略）→ 在 **Extension Development Host** 窗口执行 `Developer: Reload Window`，或停止调试后重新 F5 |
| `media/reportViewer.js`、`media/report.css`（webview 前端） | 关闭当前 Markdown 阅读 tab，重新打开 `.md` 文件 |
| `package.json`（命令、配置、activationEvents） | 停止调试，重新 F5 |

可选：在终端运行 `npm run watch`，TypeScript 会监听保存并自动编译，减少手动 compile。

### 2.4 开发期自检清单

- [ ] 打开 `.md` 能进入阅读视图，无报错
- [ ] 左侧 TOC 层级、折叠、滚动高亮正常
- [ ] `[cite:n]` 点击跳转与返回正常
- [ ] 相对路径 `.md` 链接能在编辑器内打开
- [ ] `http` / `https` 链接走系统浏览器
- [ ] 改 webview 脚本/样式后，重开 tab 能看到变化

### 2.5 F5 与本地 VSIX 的区别

- **F5**：快速迭代，适合写代码阶段
- **VSIX 安装**：接近真实用户环境，适合 F5 验证通过后、发版前的最后一轮自测

---

## 3. 打包并在本地 Cursor / VS Code 安装

F5 验证没问题后，再打包成 `.vsix` 安装到**日常使用的 Cursor / VS Code**（而非 Extension Development Host）。

### 3.0 一键打包（推荐）

仓库根目录提供一键脚本，**拖到终端回车**即可完成「编译 → 打 VSIX → 安装到本机检测到的 Cursor / VS Code」：

| 平台 | 操作 |
|------|------|
| Windows | 将 [`Package.bat`](../Package.bat) 拖入 cmd / PowerShell，回车 |
| macOS | 首次 `chmod +x Package.sh`，再将 [`Package.sh`](../Package.sh) 拖入 Terminal 回车（或 `bash Package.sh`） |

脚本流程：

1. 自动 `cd` 到仓库根目录（与当前终端工作目录无关）
2. 检查 `node` / `npm`；若无 `node_modules` 则执行 `npm install`
3. `npm run package:local`（内部为 `compile` + `package`）
4. 按 `package.json` 的 `name` + `version` 定位 VSIX（当前为 `markdown-reader-0.0.4.vsix`）
5. 调用检测到的 Cursor / VS Code CLI 执行 `--install-extension ... --force`
6. 提示在对应编辑器中执行 **Developer: Reload Window**

**编辑器 CLI 查找顺序**

- Windows：分别查找 Cursor、VS Code 的常见安装目录，再查 PATH 中的 `cursor` / `code`
- macOS：先查 PATH 中的 `cursor` / `code`，再回退到 `/Applications/Cursor.app/.../cursor` 与 `/Applications/Visual Studio Code.app/.../code`

只找到一个编辑器时会继续安装并跳过另一个；两个 CLI 都找不到时脚本才会失败。可在编辑器中安装 Shell Command，或确认应用位于标准安装目录。

Windows 脚本结束时会 `pause`，便于查看输出；macOS 脚本失败时以非零退出码结束。

### 3.1 手动打包

```bash
npm run package:local
```

等价于：

```bash
npm run compile
npm run package
```

其中 `package` 已内置 `--allow-missing-repository --no-rewrite-relative-links`。

生成文件：`<name>-<version>.vsix`（当前为 `markdown-reader-<version>.vsix`，version 见 `package.json`）。

> **说明**：本仓库 README 含相对路径链接（如 `docs/markdown_format_spec.md`），`vsce package` 默认会尝试改写链接并检测 git 仓库；若报错，使用上述两个 flag。正式发布前建议在 `package.json` 中补全 `repository` 字段，并添加 `CHANGELOG.md`。

### 3.2 命令行安装（Cursor / VS Code）

macOS 上 Cursor CLI 通常不在 PATH 里，使用完整路径：

```bash
"/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
  --install-extension ./markdown-reader-<version>.vsix \
  --force
```

Windows 常见路径：

```powershell
& "$env:LOCALAPPDATA\Programs\cursor\resources\app\bin\cursor.cmd" `
  --install-extension ".\markdown-reader-<version>.vsix" --force
```

`--force` 用于覆盖已安装的同版本扩展。安装后执行 **Developer: Reload Window** 重载编辑器。

VS Code 可使用：

```bash
code --install-extension ./markdown-reader-<version>.vsix --force
```

验证是否安装成功：

```bash
cursor --list-extensions --show-versions | grep markdown-reader
```

应看到：`humensmoc.markdown-reader@<version>`（publisher 与 `package.json` 一致）

### 3.3 图形界面安装

`Cmd+Shift+P` → **Extensions: Install from VSIX...** → 选择生成的 `.vsix` 文件。

也可将 `.vsix` **拖入**扩展面板。

### 3.4 本地 VSIX 不会自动更新

手动安装的 `.vsix` **没有自动更新通道**。每次改完代码要重新打包并安装（运行 `Package.bat` / `Package.sh`，或手动 `package:local` + install），或继续用 F5 开发。

---

## 4. 发布到扩展商城

本地 VSIX 自测通过后，再对外发布。本扩展当前 `publisher` 为 **`humensmoc`**，扩展 ID 为 **`humensmoc.markdown-reader`**。

### 4.1 两个渠道的区别

| 渠道 | 谁在用 | Cursor 能否搜索安装 |
|------|--------|---------------------|
| [VS Code Marketplace](https://marketplace.visualstudio.com/) | VS Code 用户 | **不能**（Cursor 内置市场为 Open VSX） |
| [Open VSX](https://open-vsx.org/) | Cursor、VSCodium 等 | **能** |

**建议双发**：VS Code 用户走 Marketplace，Cursor 用户走 Open VSX（或继续手动装 VSIX）。

### 4.2 首次发布前准备

1. **Publisher 账号**
   - VS Code：[marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) 创建 Publisher，ID 必须与 `package.json` 的 `publisher` 一致（`humensmoc`），创建后不可改
   - Open VSX：注册 [open-vsx.org](https://open-vsx.org/)，签署 Publisher Agreement，创建 namespace

2. **认证**
   ```bash
   # VS Code Marketplace（Azure DevOps PAT，范围 Marketplace Manage）
   npx vsce login humensmoc

   # Open VSX（Settings → Access Tokens）
   export OVSX_PAT="your-token"
   ```

3. **发布前检查**
   - [ ] `package.json` 中 `version`、`displayName`、`description` 正确
   - [ ] 补全 `repository`、`license`（建议添加 `LICENSE` 与 `CHANGELOG.md`）
   - [ ] 准备 `icon.png`（128×128 PNG，**不要用 SVG**）
   - [ ] README 中图片链接使用 `https://`
   - [ ] 源码中无 API Key、Token、`.env` 等敏感信息（`vsce` 打包时会扫描）
   - [ ] F5 + 本地 VSIX 均已验证

### 4.3 首次发布

```bash
npm run compile

# VS Code Marketplace
npx vsce publish

# Open VSX（Cursor 可搜索）
npx ovsx publish -p $OVSX_PAT
```

上架后 Marketplace 索引约 5–15 分钟。验证地址：

```text
https://marketplace.visualstudio.com/items?itemName=humensmoc.markdown-reader
https://open-vsx.org/extension/humensmoc/markdown-reader
```

---

## 5. 后续更新

### 5.1 只更新本机 Cursor（不对外发版）

适合个人试用最新改动：

```bash
# 推荐：Windows 运行 Package.bat，macOS 运行 Package.sh
# 或手动：
npm run package:local
cursor --install-extension ./markdown-reader-<version>.vsix --force
```

开发阶段仍优先 F5，不必每次改都打包。

### 5.2 更新 VS Code Marketplace

```bash
# 1. 更新 CHANGELOG.md
# 2. 自动 bump patch 版本并发布
npx vsce publish patch
# 或指定版本：npx vsce publish 0.0.4
```

已安装用户会在扩展视图看到 **Update**，或随自动更新策略升级。

### 5.3 更新 Open VSX（Cursor 用户）

```bash
npx vsce publish patch          # 或手动改 version 后 vsce publish
npx ovsx publish -p $OVSX_PAT
```

两边 **version 建议保持一致**。Cursor 从 Open VSX 拉取更新。

### 5.4 标准发版 checklist

1. F5 调试 + fixture 文件自测
2. 本地 VSIX 安装到干净 Cursor 窗口再测一轮（`Package.bat` / `Package.sh` 或手动流程）
3. 更新 `CHANGELOG.md`
4. `npm run package` 确认无密钥扫描错误
5. `npx vsce publish patch`
6. `npx ovsx publish -p $OVSX_PAT`（若服务 Cursor）
7. `git push`（若 vsce 自动打了 tag，一并 `git push --tags`）
8. 从商城/Open VSX 全新安装验证

---

## 6. 常见问题

### Q1：改了 TypeScript 但 F5 窗口里没变化？

先 `npm run compile`，再在 Extension Development Host 里 **Developer: Reload Window**，或重新 F5。

### Q2：改了 `media/reportViewer.js` 但没变化？

关闭 Markdown 阅读 tab 后重新打开；webview 不会随 Reload 自动刷新已打开的 tab。

### Q3：`vsce package` 报 README 链接或 repository 错误？

本仓库 `npm run package` 已带所需 flag。手动执行时使用：

```bash
npm run package
```

等价于：

```bash
npx vsce package --allow-missing-repository --no-rewrite-relative-links
```

长期建议在 `package.json` 添加：

```json
"repository": {
  "type": "git",
  "url": "https://github.com/humensmoc/markdown-reader.git"
}
```

### Q4：`vsce package` / `publish` 报 secret 扫描错误？

从源码移除 API Key、Token 等；不要把 `.env` 打进包。确属误报时再考虑 `--allow-package-*` 类 flag（谨慎使用）。

### Q5：Cursor 里搜不到刚发 Marketplace 的扩展？

正常。Cursor 内置市场为 Open VSX，需额外 `ovsx publish`，或手动装 VSIX。

### Q6：Windows 上 `npm run compile` 被 PowerShell 拦截？

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run compile
```

### Q7：一键打包脚本找不到 Cursor / VS Code？

- Windows：确认 `%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd` 存在，或在 Cursor 中安装 Shell Command
- macOS：确认 Cursor / VS Code 位于 `/Applications`，或安装对应的 `cursor` / `code` Shell Command
- 仍失败时，用 **Extensions: Install from VSIX...** 手动选择生成的 `.vsix`

---

## 7. 相关文档

- [README.md](../README.md) — 功能说明与用户向 FAQ
- [markdown_format_spec.md](./markdown_format_spec.md) — Markdown / cite 格式规范；文末附录含 Marketplace / Open VSX 调研细节
- [markdown_reader_plan.md](./markdown_reader_plan.md) — 插件架构与设计说明
