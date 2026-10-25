@echo off
setlocal
cd /d "%~dp0"
if exist "Windows\NetPlex-win32-x64\NetPlex.exe" (
  start "" "%~dp0Windows\NetPlex-win32-x64\NetPlex.exe"
  exit /b 0
)
echo Windows-programmet er ikke bygget endnu.
echo Se desktop\README.md for bygning og udvikling.
pause
