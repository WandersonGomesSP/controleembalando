@echo off
setlocal
title Controle Embalando - iniciar e atualizar
cd /d "%~dp0"

echo Verificando atualizacoes do Controle Embalando...
git fetch origin desenvolvimento
if errorlevel 1 (
  echo Nao foi possivel consultar o GitHub. Vou iniciar a versao local.
) else (
  git pull --ff-only origin desenvolvimento
  if errorlevel 1 echo A atualizacao foi recusada para proteger seus arquivos locais. Vou iniciar a versao local.
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0acompanhar-atualizacoes.ps1"
if errorlevel 1 (
  echo.
  echo O monitor de atualizacoes nao iniciou. Abrindo o sistema local sem atualizar...
  npm run dev
)
