@echo off
set "PORT=8888"
netstat -ano | findstr ":8888 " >nul
if %ERRORLEVEL% == 0 (
    echo  Port 8888 is already in use.
    echo  Falling back to port 8890 instead.
    set "PORT=8890"
)

echo.
echo  =============================================
echo   Rekhta Reader - Local Reverse Proxy
echo  =============================================
echo.
echo  Once running, set proxy prefix in the webapp to:
echo  http://localhost:%PORT%/?url={url}
echo.
echo  Press CTRL+C to stop.
echo.

REM Prefer Node.js (no install needed, just node.exe)
where node >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Using Node.js...
    set "PORT=%PORT%"
    node proxy-server.js
    goto :done
)

REM Fallback: Caddy
if exist caddy.exe (
    echo  Node.js not found, trying Caddy...
    caddy.exe run --config Caddyfile
    goto :done
)

echo  ERROR: Neither node.exe nor caddy.exe found in PATH.
echo  Install Node.js from https://nodejs.org (LTS) and re-run this bat file.
echo.
pause
exit /b 1

:done
pause
