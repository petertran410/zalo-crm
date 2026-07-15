@echo off
title Zalo CRM Launcher

echo =======================================================
echo          ZALO CRM SYSTEM LAUNCHER
echo =======================================================
echo.

:: 1. Check if Docker is running
echo [1/5] Checking Docker daemon status...
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
echo Application Port configured: %APP_PORT%
echo.

:: 3. Select Mode
echo [2/5] Selecting Launch Mode...
echo [1] Development Mode (Auto-reloads when you change frontend or backend code)
echo [2] Production Mode (Pre-built, optimized, no auto-reloads)
echo.
choice /c 12 /n /m "Please select launch mode (Press 1 or 2): "

if errorlevel 2 (
    set LAUNCH_MODE=production
    set COMPOSE_FILES=-f docker-compose.yml
    set TARGET_PORT=%APP_PORT%
    set TARGET_URL=http://localhost:%APP_PORT%/setup
    set LOG_SERVICES=app
    echo Selected: Production Mode
) else (
    set LAUNCH_MODE=development
    set COMPOSE_FILES=-f docker-compose.yml -f docker-compose.dev.yml
    set TARGET_PORT=5173
    set TARGET_URL=http://localhost:5173/setup
    set LOG_SERVICES=app frontend
    echo Selected: Development Mode
)
echo.

:: 4. Restart container ports
echo [3/5] Stopping existing containers to free up ports...
docker compose %COMPOSE_FILES% down
if %errorlevel% neq 0 (
    echo Error: Failed to stop existing containers.
    pause
    exit /b 1
)
echo.

echo [4/5] Rebuilding and starting containers in the background...
docker compose %COMPOSE_FILES% up -d --build
if %errorlevel% neq 0 (
    echo Error: Failed to build and start containers.
    pause
    exit /b 1
)
echo.

:: 5. Wait for the application to be ready
echo [5/5] Waiting for the application to respond on port %TARGET_PORT%...
set ATTEMPTS=0
:wait_app
timeout /t 3 >nul
set HTTP_STATUS=000

for /f "delims=" %%a in ('curl -s -o nul -w "%%{http_code}" http://localhost:%TARGET_PORT%/') do set HTTP_STATUS=%%a

if "%HTTP_STATUS%"=="200" goto app_ready
if "%HTTP_STATUS%"=="302" goto app_ready
if "%HTTP_STATUS%"=="307" goto app_ready

set /a ATTEMPTS=ATTEMPTS+1
if %ATTEMPTS% gtr 40 (
    echo.
    echo Error: Application failed to respond after 2 minutes.
    echo Please check container logs with command: docker compose logs app
    pause
    exit /b 1
)

echo Application not ready yet (HTTP Status: %HTTP_STATUS%). Retrying (%ATTEMPTS%/40)...
goto wait_app

:app_ready
echo.
echo ✓ Application is ready and healthy!
echo.

:: 6. Find and open link in Coc Coc or default browser
set COCCOC_PATH=
if exist "%USERPROFILE%\AppData\Local\CocCoc\Browser\Application\browser.exe" (
    set "COCCOC_PATH=%USERPROFILE%\AppData\Local\CocCoc\Browser\Application\browser.exe"
) else if exist "%ProgramFiles%\CocCoc\Browser\Application\browser.exe" (
    set "COCCOC_PATH=%ProgramFiles%\CocCoc\Browser\Application\browser.exe"
) else if exist "%ProgramFiles(x86)%\CocCoc\Browser\Application\browser.exe" (
    set "COCCOC_PATH=%ProgramFiles(x86)%\CocCoc\Browser\Application\browser.exe"
)

if defined COCCOC_PATH (
    echo Opening link in Coc Coc browser...
    start "" "%COCCOC_PATH%" "%TARGET_URL%"
) else (
    echo Coc Coc browser not found. Opening in default browser...
    start "" "%TARGET_URL%"
)

echo.
echo =======================================================
echo  ✓ Launch sequence complete!
echo  → streaming logs from: %LOG_SERVICES%
echo  → Press Ctrl+C inside this window to stop streaming logs.
echo =======================================================
echo.

docker compose %COMPOSE_FILES% logs -f %LOG_SERVICES%
