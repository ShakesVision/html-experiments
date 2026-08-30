@echo off
echo.
echo  =============================================
echo   Rekhta Reader - Local Reverse Proxy
echo  =============================================
echo.
echo  Once running, set proxy prefix in the webapp to:
echo  http://localhost:8888/?url={url}
echo.
echo  Press CTRL+C to stop.
echo.


REM Fallback: Caddy
if exist caddy.exe (
    echo  Node.js not found, trying Caddy...
    caddy.exe run --config Caddyfile
    goto :done
)

REM Prefer Node.js (no install needed, just node.exe)
where node >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo  Using Node.js...
    node proxy-server.js
    goto :done
)
echo  ERROR: Neither node.exe nor caddy.exe found in PATH.
echo  Install Node.js from https://nodejs.org (LTS) and re-run this bat file.
echo.
pause
exit /b 1

:done
pause
