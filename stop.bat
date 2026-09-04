@echo off
setlocal
title OpenExecutive Stopper

echo ==============================================
echo   OpenExecutive - Stop
echo ==============================================
echo.

echo [1/3] Closing backend (port 8000) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo   Killing PID %%a ...
    taskkill /PID %%a /F >nul 2>&1
)

echo [2/3] Closing frontend (port 3000) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   Killing PID %%a ...
    taskkill /PID %%a /F >nul 2>&1
)

echo [3/3] Closing launcher windows ...
taskkill /FI "WINDOWTITLE eq OpenExecutive-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq OpenExecutive-Frontend*" /F >nul 2>&1

echo.
echo Done. OpenExecutive stopped.
echo.
pause
