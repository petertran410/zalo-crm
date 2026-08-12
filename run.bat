@echo off
setlocal enabledelayedexpansion
title Hi-CRM Development Server (native - no Docker)

echo =======================================================
echo        HI-CRM - DEVELOPMENT SERVER (NATIVE)
echo   PostgreSQL Windows service + Vite HMR + tsx watch
echo   Khong dung Docker.
echo =======================================================
echo.

cd /d "%~dp0"

set PG_SERVICE=postgresql-x64-18

:: ────────────────────────────────────────────────────────────────────────────
:: [1/6] PostgreSQL (thay cho container `db`)
:: ────────────────────────────────────────────────────────────────────────────
echo [1/6] Checking PostgreSQL service (%PG_SERVICE%)...
sc query %PG_SERVICE% >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Service %PG_SERVICE% not found.
    echo   Install PostgreSQL, or edit PG_SERVICE at the top of this file
    echo   to match your installed service name ^(sc query ^| findstr postgres^).
    pause
    exit /b 1
)

sc query %PG_SERVICE% | findstr /i "RUNNING" >nul
if errorlevel 1 (
    echo   Service stopped. Starting...
    net start %PG_SERVICE% >nul 2>&1
    if errorlevel 1 (
        echo   ERROR: Could not start %PG_SERVICE% ^(needs Administrator^).
        echo   Right-click this file - Run as administrator, or start it from services.msc
        pause
        exit /b 1
    )
)
echo   OK: PostgreSQL is running.
echo.

:: ────────────────────────────────────────────────────────────────────────────
:: [2/6] Config (thay cho env_file cua docker-compose)
:: ────────────────────────────────────────────────────────────────────────────
echo [2/6] Checking config...
if not exist "backend\.env" (
    echo   ERROR: backend\.env is missing.
    pause
    exit /b 1
)
findstr /c:"__SET_ME__" "backend\.env" >nul
if not errorlevel 1 (
    echo   ERROR: DATABASE_URL in backend\.env still contains __SET_ME__ - fill it in first.
    pause
    exit /b 1
)
echo   OK: backend\.env present.
echo.

:: ────────────────────────────────────────────────────────────────────────────
:: [3/6] Dependencies (thay cho `docker build`)
:: ────────────────────────────────────────────────────────────────────────────
echo [3/6] Checking dependencies...
if not exist "backend\node_modules" (
    echo   Installing backend dependencies ^(first run, a few minutes^)...
    pushd backend
    call npm install
    if errorlevel 1 ( echo   ERROR: backend npm install failed. & popd & pause & exit /b 1 )
    popd
)
if not exist "frontend\node_modules" (
    echo   Installing frontend dependencies ^(first run, a few minutes^)...
    pushd frontend
    call npm install
    if errorlevel 1 ( echo   ERROR: frontend npm install failed. & popd & pause & exit /b 1 )
    popd
)
echo   OK: dependencies present.
echo.

:: ────────────────────────────────────────────────────────────────────────────
:: [4/6] Redis - TUY CHON (thay cho container `redis`)
:: ────────────────────────────────────────────────────────────────────────────
echo [4/6] Checking Redis on port 6379 ^(optional^)...
netstat -ano | findstr ":6379" | findstr /i "LISTENING" >nul
if errorlevel 1 (
    echo   WARNING: no Redis listening on 6379.
    echo   The app still boots. BullMQ workers ^(group scan, list enrichment,
    echo   POS push^) will retry ~6 min, log errors, then give up. Cron jobs
    echo   and everything else are unaffected.
    echo   To add it later:  choco install memurai-developer
) else (
    echo   OK: Redis is listening.
)
echo.

:: ────────────────────────────────────────────────────────────────────────────
:: [5/6] Prisma (thay cho `command:` cua container app-dev)
:: ────────────────────────────────────────────────────────────────────────────
:: `migrate deploy`, KHONG `db push`: database nay da co _prisma_migrations that
:: va DU LIEU THAT (contacts, conversations, Zalo session...). db push khong doc
:: migration history nen co the lam lech schema; migrate deploy chi APPLY cac
:: migration con thieu, khong bao gio xoa/ghi de du lieu.
echo [5/6] Applying pending Prisma migrations...
pushd backend
call npx prisma generate
if errorlevel 1 ( echo   ERROR: prisma generate failed. & popd & pause & exit /b 1 )
call npx prisma migrate deploy
if errorlevel 1 (
    echo.
    echo   ERROR: prisma migrate deploy failed - check DATABASE_URL in backend\.env.
    popd
    pause
    exit /b 1
)
popd
echo   OK: schema in sync.
echo.

:: ────────────────────────────────────────────────────────────────────────────
:: [6/6] Launch (thay cho container `app` + `frontend`)
:: ────────────────────────────────────────────────────────────────────────────
:: 2026-08-01: test_feature tach BullMQ worker ra process rieng (src/worker.ts).
:: startGroupScanWorker + startListEnrichmentWorker khong con chay trong app.ts,
:: nen phai mo them cua so nay — thieu no thi quet nhom / enrich list im lang.
echo [6/6] Starting backend, worker and frontend in separate windows...
start "Hi-CRM Backend (tsx watch)" cmd /k "cd /d "%~dp0backend" && npm run dev"
start "Hi-CRM Worker (BullMQ)" cmd /k "cd /d "%~dp0backend" && npm run dev:worker"
start "Hi-CRM Frontend (Vite HMR)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo =======================================================
echo  Development server is starting.
echo.
echo  Frontend (Vite HMR) : http://localhost:5173
echo  Backend API         : http://localhost:3000
echo.
echo  - Backend and frontend each run in their own window.
echo  - Edit .vue/.ts files and they auto-reload.
echo  - Close those two windows to stop the servers.
echo  - First run: open http://localhost:5173 and complete
echo    the Setup wizard (creates org + owner account).
echo =======================================================
echo.
pause
