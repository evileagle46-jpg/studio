@echo off
title Wedding Studio Server
color 0A
echo ========================================
echo   Wedding Studio - Starting Server
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Start the server
echo [INFO] Starting server...
echo.
echo ========================================
echo   Server URLs:
echo ========================================
echo   Main Website: http://localhost:3000
echo   Admin Panel: http://localhost:3000/admin.html
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

node index.js

pause