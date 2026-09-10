#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] 未找到 node，请先安装 Node.js >= 18"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] 未找到 npm，请先安装 Node.js"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "[INFO] 未找到 node_modules，正在 npm install ..."
  npm install
fi

echo "[INFO] 正在编译并打包 ..."
npm run package:local

VSIX="$(node -p "require('./package.json').name + '-' + require('./package.json').version + '.vsix'")"

if [[ ! -f "$VSIX" ]]; then
  echo "[ERROR] 未找到 VSIX 文件: $VSIX"
  exit 1
fi

CURSOR=""
if command -v cursor >/dev/null 2>&1; then
  CURSOR="cursor"
elif [[ -x "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" ]]; then
  CURSOR="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
fi

VSCODE=""
if command -v code >/dev/null 2>&1; then
  VSCODE="code"
elif [[ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
  VSCODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

if [[ -z "$CURSOR" && -z "$VSCODE" ]]; then
  echo "[ERROR] 未找到 Cursor CLI 或 VS Code CLI"
  echo "请安装 cursor/code shell command，或确认应用位于 /Applications"
  exit 1
fi

if [[ -n "$CURSOR" ]]; then
  echo "[INFO] 正在将 $VSIX 安装到 Cursor ..."
  "$CURSOR" --install-extension "./$VSIX" --force
else
  echo "[WARN] 未找到 Cursor CLI，跳过 Cursor 安装"
fi

if [[ -n "$VSCODE" ]]; then
  echo "[INFO] 正在将 $VSIX 安装到 VS Code ..."
  "$VSCODE" --install-extension "./$VSIX" --force
else
  echo "[WARN] 未找到 VS Code CLI，跳过 VS Code 安装"
fi

echo
echo "[OK] 打包及编辑器安装完成: $VSIX"
echo "请在 Cursor / VS Code 中执行 Developer: Reload Window 重载窗口"
