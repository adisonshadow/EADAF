@echo off
rem scripts/killdev.cmd -- Windows cmd / double-click entry point.
rem All real logic (process discovery + process-tree kill) lives in scripts/killdev.cjs.
rem Keep this file ASCII-only: cmd.exe reads it with the OEM code page (936/GBK on
rem zh-CN), so UTF-8 comments here would be garbled and can even be executed.
setlocal
cd /d "%~dp0.."

node "%~dp0killdev.cjs" %*
set "EXITCODE=%ERRORLEVEL%"

endlocal & exit /b %EXITCODE%
