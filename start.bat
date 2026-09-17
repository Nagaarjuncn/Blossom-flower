@echo off
echo =======================================================
echo   🌸 Starting Gesture Flower Full-Stack Web Application
echo =======================================================

cd /d "%~dp0"

start http://localhost:3000

if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" server.js
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        node server.js
    ) else (
        echo Node.js not found in PATH, launching with PowerShell server...
        powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
    )
)

pause
