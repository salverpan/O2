@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "CHROME_CRASHPAD_PIPE_NAME="
cd /d "%~dp0"
start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0src\server.py"
