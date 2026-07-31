@echo off
title Zalo CRM Development Server

echo =======================================================
echo        ZALO CRM - DEVELOPMENT SERVER
echo   Auto-reloads frontend (Vite HMR) + backend (tsx watch)
echo =======================================================
echo.

:: 1. Check if Docker is running
echo [1/4] Checking Docker daemon status...
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo Status: Docker is not running. Starting Docker Desktop...
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else (
    echo Warning: Docker Desktop not found in default path. Please start Docker manually.
    pause
    exit /b 1
)

echo Waiting for Docker daemon to start (this may take 1-2 minutes)...
:wait_docker
timeout /t 5 >nul
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready
echo Still waiting for Docker daemon...
goto wait_docker

:docker_ready
echo Status: Docker daemon is running.
echo.

:: 2. Read APP_PORT from .env
set APP_PORT=3080
if exist .env (
    for /f "tokens=2 delims==" %%A in ('findstr /b "APP_PORT=" .env') do set APP_PORT=%%A
)
echo.

:: 3. Start containers
echo [2/4] Starting development containers...
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
if %errorlevel% neq 0 (
    echo Error: Failed to build and start containers.
    pause
    exit /b 1
)
echo.

:: 4. Wait for the application to be ready (backend healthcheck + frontend)
echo [3/4] Waiting for backend to be healthy...
set ATTEMPTS=0
:wait_backend
timeout /t 3 >nul
docker inspect --format="{{.State.Health.Status}}" zalo-crm-app-dev 2>nul | findstr /i "healthy" >nul
if %errorlevel% equ 0 goto backend_ready

set /a ATTEMPTS=ATTEMPTS+1
if %ATTEMPTS% gtr 60 (
    echo.
    echo Error: Backend failed to become healthy after 3 minutes.
    echo Check logs: docker compose -f docker-compose.yml -f docker-compose.dev.yml logs app
    pause
    exit /b 1
)
echo Backend not ready yet. Waiting... (%ATTEMPTS%/60)
goto wait_backend

:backend_ready
echo ✓ Backend is healthy!
echo.

echo [4/4] Waiting for frontend (Vite) on port 5173...
set ATTEMPTS=0
:wait_frontend
timeout /t 2 >nul
set HTTP_STATUS=000
for /f "delims=" %%a in ('curl -s -o nul -w "%%{http_code}" http://localhost:5173/ 2^>nul') do set HTTP_STATUS=%%a

if "%HTTP_STATUS%"=="200" goto app_ready
if "%HTTP_STATUS%"=="302" goto app_ready
if "%HTTP_STATUS%"=="304" goto app_ready

set /a ATTEMPTS=ATTEMPTS+1
if %ATTEMPTS% gtr 30 (
    echo.
    echo Error: Frontend failed to respond after 1 minute.
    echo Check logs: docker compose -f docker-compose.yml -f docker-compose.dev.yml logs frontend
    pause
    exit /b 1
)
echo Frontend not ready yet (HTTP: %HTTP_STATUS%). Waiting... (%ATTEMPTS%/30)
goto wait_frontend

:app_ready
echo ✓ Frontend is ready!
echo.

:: 5. Open browser
@REM set COCCOC_PATH=
@REM if exist "%USERPROFILE%\AppData\Local\CocCoc\Browser\Application\browser.exe" (
@REM     set "COCCOC_PATH=%USERPROFILE%\AppData\Local\CocCoc\Browser\Application\browser.exe"
@REM ) else if exist "%ProgramFiles%\CocCoc\Browser\Application\browser.exe" (
@REM     set "COCCOC_PATH=%ProgramFiles%\CocCoc\Browser\Application\browser.exe"
@REM ) else if exist "%ProgramFiles(x86)%\CocCoc\Browser\Application\browser.exe" (
@REM     set "COCCOC_PATH=%ProgramFiles(x86)%\CocCoc\Browser\Application\browser.exe"
@REM )

@REM if defined COCCOC_PATH (
@REM     echo Opening in Coc Coc browser...
@REM     start "" "%COCCOC_PATH%" "http://localhost:5173/setup"
@REM ) else (
@REM     echo Opening in default browser...
@REM     start "" "http://localhost:5173/setup"
@REM )

echo.
echo =======================================================
echo  ✓ Development server is running!
echo.
echo  Frontend (Vite HMR) : http://localhost:5173
echo  Backend API          : http://localhost:%APP_PORT%
echo.
echo  → Edit .vue/.ts files and changes auto-reload!
echo  → Logs streaming below. Press Ctrl+C to stop logs.
echo  → Containers keep running in background after Ctrl+C.
echo  → To stop all: docker compose -f docker-compose.yml -f docker-compose.dev.yml down
echo =======================================================
echo.

docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f app frontend
