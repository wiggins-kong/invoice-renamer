@echo off
cd /d "%~dp0"
echo 发票识别重命名工具启动中...
echo 浏览器访问 http://127.0.0.1:8600
venv\Scripts\python.exe app.py
pause
