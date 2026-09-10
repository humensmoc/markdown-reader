@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto missing_node

where npm >nul 2>&1
if errorlevel 1 goto missing_npm

if exist "node_modules\" goto build
echo [INFO] node_modules not found. Running npm install...
call npm install
if errorlevel 1 goto npm_install_failed

:build
echo [INFO] Compiling and packaging...
call npm run package:local
if errorlevel 1 goto package_failed

node -e "var p=require('./package.json');require('fs').writeFileSync('.vsix-name.tmp',p.name+'-'+p.version+'.vsix')"
set /p VSIX=<.vsix-name.tmp
del .vsix-name.tmp

if not exist "%VSIX%" goto missing_vsix

set "CURSOR="
if exist "%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd" set "CURSOR=%LOCALAPPDATA%\Programs\cursor\resources\app\bin\cursor.cmd"
if defined CURSOR goto find_vscode
where cursor >nul 2>&1
if not errorlevel 1 for /f "delims=" %%I in ('where cursor 2^>nul') do if not defined CURSOR set "CURSOR=%%I"

:find_vscode
set "VSCODE="
if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "VSCODE=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if defined VSCODE goto check_editors
if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "VSCODE=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if defined VSCODE goto check_editors
where code >nul 2>&1
if not errorlevel 1 for /f "delims=" %%I in ('where code 2^>nul') do if not defined VSCODE set "VSCODE=%%I"

:check_editors
if defined CURSOR goto install_cursor
if defined VSCODE goto skip_cursor
echo [ERROR] Cursor CLI and VS Code CLI were not found.
echo Add the cursor or code command to PATH, then run this script again.
pause
exit /b 1

:install_cursor
echo [INFO] Installing %VSIX% into Cursor...
call "%CURSOR%" --install-extension "%CD%\%VSIX%" --force
if errorlevel 1 goto cursor_install_failed

:skip_cursor
if defined CURSOR goto install_vscode
echo [WARN] Cursor CLI not found. Skipping Cursor installation.

:install_vscode
if not defined VSCODE goto skip_vscode
echo [INFO] Installing %VSIX% into VS Code...
call "%VSCODE%" --install-extension "%CD%\%VSIX%" --force
if errorlevel 1 goto vscode_install_failed
goto success

:skip_vscode
echo [WARN] VS Code CLI not found. Skipping VS Code installation.
goto success

:missing_node
echo [ERROR] Node.js 18 or newer is required.
pause
exit /b 1

:missing_npm
echo [ERROR] npm was not found. Install Node.js first.
pause
exit /b 1

:npm_install_failed
echo [ERROR] npm install failed.
pause
exit /b 1

:package_failed
echo [ERROR] Compilation or packaging failed.
pause
exit /b 1

:missing_vsix
echo [ERROR] VSIX file not found: %VSIX%
pause
exit /b 1

:cursor_install_failed
echo [ERROR] Cursor extension installation failed.
pause
exit /b 1

:vscode_install_failed
echo [ERROR] VS Code extension installation failed.
pause
exit /b 1

:success
echo.
echo [OK] Package and editor installation completed: %VSIX%
echo Run Developer: Reload Window in Cursor and VS Code.
pause
endlocal
