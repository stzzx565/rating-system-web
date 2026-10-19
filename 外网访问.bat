@echo off
chcp 65001 >nul
title 外网访问服务（免费）
cd /d "%~dp0"
echo ============================================
echo   一键开启外网访问（完全免费）
echo   保持本窗口开启，关闭即断开外网
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
  pause
  exit /b 1
)
node "外网启动.js"
echo.
echo 窗口已结束，外网访问已停止。
pause
