@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未找到 node，请先安装 Node.js ^>= 18
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未找到 npm，请先安装 Node.js
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] 未找到 node_modules，正在 npm install ...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install 失败
    pause
    exit /b 1
  )
)

echo [INFO] 正在编译并打包 ...
call npm run package:local
if errorlevel 1 (
  echo [ERROR] 编译或打包失败
  pause
  exit /b 1
)

node -e "var p=require('./package.json');require('fs').writeFileSync('.vsix-name.tmp',p.name+'-'+p.version+'.vsix')"
set /p VSIX=<.vsix-name.tmp
del .vsix-name.tmp

if not exist "%VSIX%" (
  echo [ERROR] 未找到 VSIX 文件: %VSIX%
  pause
  exit /b 1
)

set "CURSOR="
if exist "%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd" (
  set "CURSOR=%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd"
) else (
  where cursor >nul 2>&1
  if not errorlevel 1 set "CURSOR=cursor"
)

if not defined CURSOR (
  echo [ERROR] 未找到 Cursor CLI
  echo 请在 Cursor 中执行: Shell Command: Install 'cursor' command in PATH
  echo 或确认已安装: %LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd
  pause
  exit /b 1
)

echo [INFO] 正在安装 %VSIX% ...
"%CURSOR%" --install-extension "%CD%\%VSIX%" --force
if errorlevel 1 (
  echo [ERROR] 安装扩展失败
  pause
  exit /b 1
)

echo.
echo [OK] 打包并安装完成: %VSIX%
echo 请在 Cursor 中执行 Developer: Reload Window 重载窗口
pause
