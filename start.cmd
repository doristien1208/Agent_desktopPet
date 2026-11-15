@echo off
chcp 65001 >nul
cd /d "%~dp0"
node node_modules\@angular\cli\bin\ng.js build --base-href ./
if errorlevel 1 exit /b %errorlevel%
call node_modules\.bin\electron.cmd .
