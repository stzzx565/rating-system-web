@echo off
chcp 65001 >nul
title 网页版预览服务
cd /d "%~dp0"
echo ============================================
echo   评分系统 - 网页版本地预览
echo   保持本窗口开启，关闭即停止服务
echo ============================================
if not exist "serve.js" (
  echo [错误] 未找到 serve.js，请确认在 web 目录下运行
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org
  pause
  exit /b 1
)
node serve.js
pause
