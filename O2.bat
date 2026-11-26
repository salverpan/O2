@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "CHROME_CRASHPAD_PIPE_NAME="
cd /d "%~dp0"

:: Cleanly stop any existing O2 server / Electron instances from this folder so restart always works
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = (Resolve-Path '.').Path; Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^(pythonw?|electron)\.exe$') -and $_.CommandLine -and ($_.CommandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.CommandLine -match 'src[\\/]server\.py') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

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
