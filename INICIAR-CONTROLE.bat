@echo off
title Controle Embalando - iniciar e atualizar
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0acompanhar-atualizacoes.ps1"
if errorlevel 1 (
  echo.
  echo Ocorreu um erro ao iniciar. Confira a mensagem acima.
  pause
)
