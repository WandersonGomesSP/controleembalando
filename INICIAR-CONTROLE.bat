@echo off
setlocal
title Controle Embalando - iniciar e atualizar
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0acompanhar-atualizacoes.ps1"
set "RESULTADO=%ERRORLEVEL%"

if "%RESULTADO%"=="10" (
  rem Abre uma nova janela do CMD com o BAT e fecha esta janela.
  start "Controle Embalando" cmd.exe /k ""%~f0""
  exit /b 0
)

if not "%RESULTADO%"=="0" (
  echo.
  echo Ocorreu um erro. Confira a mensagem acima.
  pause
)
