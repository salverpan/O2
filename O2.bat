@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "CHROME_CRASHPAD_PIPE_NAME="
cd /d "%~dp0"
if exist "%~dp0O2.vbs" (
  start "" wscript //nologo "%~dp0O2.vbs"
  exit /b 0
)
if exist "%~dp0.venv\Scripts\pythonw.exe" (
  start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0src\server.py"
) else (
  start "" pythonw "%~dp0src\server.py"
)
exit /b 0
