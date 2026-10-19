@echo off
cd /d "%~dp0"
title OmniCloud Python Server
color 0B
echo ===================================================
echo   Starting OmniCloud Python Backend Server...
echo ===================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in your PATH.
    echo Please install Python 3.10+ from python.org and try again.
    pause
    exit /b 1
)

python -c "import flask, flask_cors, requests" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing required packages from requirements.txt...
    pip install -r requirements.txt
)

python server.py
pause
