@echo off
title Wedding Studio - Stop Server
color 0C
echo ========================================
echo   Stopping Wedding Studio Server
echo ========================================
echo.

REM Find and kill Node.js processes running index.js
echo [INFO] Looking for running server processes...
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq node.exe" /FO LIST ^| findstr /C:"PID:"') do (
    echo [INFO] Found Node.js process: %%a
    taskkill /PID %%a /F >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [SUCCESS] Stopped process %%a
    )
)

echo.
echo [INFO] Server stopped (if it was running)
echo.
pause


