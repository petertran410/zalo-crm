@echo off
title Zalo CRM - Prisma Studio Launcher
color 0B

echo =======================================================
echo          PRISMA STUDIO DATABASE VIEWER
echo =======================================================
echo.

:: 1. Check if Node.js is installed
echo [1/4] Checking Node.js installation...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo Error: Node.js is not installed or not in your system's PATH.
    echo Please install Node.js from https://nodejs.org to run Prisma Studio locally.
    echo.
    pause
    exit /b 1
)
echo Status: Node.js is installed.
echo.

:: 2. Read database configuration from .env
echo [2/4] Reading database configuration from .env...
if not exist .env (
    color 0C
    echo Error: .env file not found in the current directory!
    echo Please run this script from the root folder of the project.
    echo.
    pause
    exit /b 1
)

set DB_USER=
set DB_PASSWORD=
set DB_NAME=
set DB_PORT=
set STUDIO_PORT=

for /f "tokens=2 delims==" %%A in ('findstr /b "DB_USER=" .env') do set DB_USER=%%A
for /f "tokens=2 delims==" %%A in ('findstr /b "DB_PASSWORD=" .env') do set DB_PASSWORD=%%A
for /f "tokens=2 delims==" %%A in ('findstr /b "DB_NAME=" .env') do set DB_NAME=%%A
for /f "tokens=2 delims==" %%A in ('findstr /b "DB_PORT=" .env') do set DB_PORT=%%A
for /f "tokens=2 delims==" %%A in ('findstr /b "PRISMA_STUDIO_PORT=" .env 2^>nul') do set STUDIO_PORT=%%A

:: Trim spaces (if any)
if defined DB_USER set DB_USER=%DB_USER: =%
if defined DB_PASSWORD set DB_PASSWORD=%DB_PASSWORD: =%
if defined DB_NAME set DB_NAME=%DB_NAME: =%
if defined DB_PORT set DB_PORT=%DB_PORT: =%
if defined STUDIO_PORT set STUDIO_PORT=%STUDIO_PORT: =%

:: Apply defaults if not set in .env
if "%DB_USER%"=="" set DB_USER=crmuser
if "%DB_NAME%"=="" set DB_NAME=zalocrm
if "%DB_PORT%"=="" set DB_PORT=5435
if "%STUDIO_PORT%"=="" set STUDIO_PORT=5555

if "%DB_PASSWORD%"=="" (
    color 0C
    echo Error: DB_PASSWORD is not defined in your .env file!
    echo.
    pause
    exit /b 1
)

:: Construct local DATABASE_URL
set DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@127.0.0.1:%DB_PORT%/%DB_NAME%

echo Status: Database configuration loaded.
echo   - Host: 127.0.0.1
echo   - Port: %DB_PORT%
echo   - User: %DB_USER%
echo   - Database: %DB_NAME%
echo   - Studio Port: %STUDIO_PORT%
echo.

:: 3. Check and kill process on Prisma Studio port
echo [3/4] Checking and clearing port %STUDIO_PORT%...
set PORT_KILLED=0
for /f "tokens=5" %%A in ('netstat -aon ^| findstr /r /c:":%STUDIO_PORT% .*LISTENING"') do (
    echo Found existing process ^(PID: %%A^) on port %STUDIO_PORT%. Terminating...
    taskkill /F /PID %%A >nul 2>&1
    set PORT_KILLED=1
)

if "%PORT_KILLED%"=="1" (
    echo Port %STUDIO_PORT% cleared successfully.
    timeout /t 1 /nobreak >nul 2>&1
) else (
    echo Port %STUDIO_PORT% is free.
)
echo.

:: 4. Launch Prisma Studio
echo [4/4] Launching Prisma Studio...
if not exist backend (
    color 0C
    echo Error: "backend" folder not found.
    echo Please make sure this script is placed in the project root.
    echo.
    pause
    exit /b 1
)

cd backend

:: Check if node_modules exists, if not install it
if not exist node_modules (
    echo node_modules not found in backend folder.
    echo Installing dependencies locally. This may take a minute...
    echo.
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        color 0C
        echo Error: Failed to install node dependencies.
        echo Please try running "npm install" manually inside the "backend" directory.
        echo.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
    echo.
)

echo Prisma Studio will open in your default browser on port %STUDIO_PORT%.
echo Press Ctrl+C in this terminal window to stop Prisma Studio.
echo.

call npx prisma studio --port %STUDIO_PORT%

pause
