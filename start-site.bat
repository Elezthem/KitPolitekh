@echo off
setlocal
set NODE_EXE=C:\Users\Serhii\AppData\Local\Programs\Tuanjie Cowork\cli\bin\win32-x64\node.exe
if not exist "%NODE_EXE%" (
  echo Node.js executable not found at:
  echo %NODE_EXE%
  exit /b 1
)
"%NODE_EXE%" server.js
