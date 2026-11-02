@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

rem 所有临时文件、模型缓存都留在项目所在的 E 盘
set "TMP=%~dp0.cache\tmp"
set "TEMP=%~dp0.cache\tmp"
set "HF_HOME=%~dp0.cache\huggingface"
set "HF_ENDPOINT=https://hf-mirror.com"
if not exist "%TMP%" mkdir "%TMP%"

if not exist ".venv\Scripts\python.exe" (
  echo 未找到本地 Python 环境 .venv，请先完成依赖安装。
  pause
  exit /b 1
)

echo.
echo  疆忆 · 援疆口述档案智能采集系统
echo  本地地址：http://127.0.0.1:8766
echo  录音与档案保存在：%~dp0data
echo  关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:8766"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8766
pause
