@echo off
setlocal
title Controle Embalando - iniciar e atualizar
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0acompanhar-atualizacoes.ps1"
set "RESULTADO=%ERRORLEVEL%"

if not "%RESULTADO%"=="0" (
  echo.
  echo Ocorreu um erro. Confira a mensagem acima.
  pause
)
