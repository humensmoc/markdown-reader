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

if [[ -z "$CURSOR" ]]; then
  echo "[ERROR] 未找到 Cursor CLI"
  echo "请在 Cursor 中执行: Shell Command: Install 'cursor' command in PATH"
  echo "或确认已安装: /Applications/Cursor.app/Contents/Resources/app/bin/cursor"
  exit 1
fi

echo "[INFO] 正在安装 $VSIX ..."
"$CURSOR" --install-extension "./$VSIX" --force

echo
echo "[OK] 打包并安装完成: $VSIX"
echo "请在 Cursor 中执行 Developer: Reload Window 重载窗口"
