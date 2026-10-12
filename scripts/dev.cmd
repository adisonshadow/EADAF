@echo off
rem scripts/dev.cmd -- Windows cmd / double-click entry point.
rem All real logic (environment probe + runner selection) lives in scripts/dev.cjs.
rem Keep this file ASCII-only: cmd.exe reads it with the OEM code page (936/GBK on
rem zh-CN), so UTF-8 comments here would be garbled and can even be executed.
setlocal
cd /d "%~dp0.."

node "%~dp0dev.cjs" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [dev.cmd] node scripts/dev.cjs exited with code %EXITCODE%
  echo Hint: run "pnpm dev:check" to print the environment probe report.
)

endlocal & exit /b %EXITCODE%
