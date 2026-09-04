@echo off
setlocal
title OpenExecutive Launcher
cd /d "%~dp0"

echo ==============================================
echo   OpenExecutive - Quick Start
echo ==============================================
echo.

REM --- 1. LM Studio check (informational only) ---
echo [1/4] Checking LM Studio (127.0.0.1:1234) ...
netstat -ano | findstr ":1234 " | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo   [WARN] LM Studio is NOT running.
    echo          Start LM Studio, load model zai-org/glm-4.7-flash,
    echo          and enable the local server on port 1234 first.
) else (
    echo   [OK] LM Studio is running.
)
echo.

REM --- 2. Backend ---
echo [2/4] Starting backend FastAPI (port 8000) ...
start "OpenExecutive-Backend" /D "%~dp0packages\core" cmd /k .venv\Scripts\python.exe -m uvicorn openexecutive.api.main:app --host 127.0.0.1 --port 8000
echo   [OK] Backend launching in a new window (~60-120s on first run).
echo.

REM --- 3. Frontend ---
echo [3/4] Starting frontend Next.js (port 3000) ...
start "OpenExecutive-Frontend" /D "%~dp0packages\ui" cmd /k npm run dev
echo   [OK] Frontend launching in a new window.
echo.

REM --- 4. Wait for backend health ---
echo [4/4] Waiting for backend to become healthy (up to 120s) ...
set /a tries=0
:wait_backend
timeout /t 2 /nobreak >nul
curl --noproxy "*" -s -o nul http://127.0.0.1:8000/health >nul 2>&1
if not errorlevel 1 goto backend_ready
set /a tries+=1
if %tries% lss 60 goto wait_backend
echo   [WARN] Backend not healthy after 120s. Check the backend window for errors.
goto finish
:backend_ready
echo   [OK] Backend is healthy (HTTP 200).
:finish

echo.
echo ==============================================
echo   DONE!
echo   Open in browser:  http://localhost:3000
echo   To stop:          run stop.bat
echo ==============================================
echo.
pause
