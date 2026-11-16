$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Get-Head { return (git rev-parse HEAD).Trim() }

function Start-DevServer {
  Write-Host ""
  Write-Host "Iniciando o sistema em http://localhost:3000 ..." -ForegroundColor Green
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow
  Start-Sleep -Seconds 8
  Start-Process "http://localhost:3000"
  return $p
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "desenvolvimento") {
  Write-Host "Esta pasta precisa estar na branch desenvolvimento. Branch atual: $branch" -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}

Write-Host "Buscando atualizacoes do GitHub..." -ForegroundColor Cyan
git fetch origin desenvolvimento
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nao foi possivel consultar o GitHub. Confira sua conexao." -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}
git pull --ff-only origin desenvolvimento
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nao foi possivel atualizar automaticamente. Verifique se ha alteracoes locais." -ForegroundColor Yellow
  Read-Host "Pressione Enter para sair"
  exit 1
}

$server = Start-DevServer
$lastHead = Get-Head
try {
  while ($true) {
    Start-Sleep -Seconds 5
    if ($server.HasExited) {
      Write-Host "O servidor foi encerrado. Iniciando novamente..." -ForegroundColor Yellow
      $server = Start-DevServer
      continue
    }
    git fetch origin desenvolvimento 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { continue }
    $remoteHead = (git rev-parse origin/desenvolvimento).Trim()
    if ($remoteHead -eq $lastHead) { continue }
    $alteracoes = git status --porcelain
    if ($alteracoes) {
      Write-Host "Ha arquivos locais alterados. Nao vou sobrescreve-los; resolva-os para receber a atualizacao." -ForegroundColor Yellow
      continue
    }
    Write-Host "Nova versao encontrada. Atualizando e reiniciando..." -ForegroundColor Cyan
    git pull --ff-only origin desenvolvimento
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Falha ao atualizar. O servidor atual continua rodando." -ForegroundColor Red
      continue
    }
    & taskkill.exe /PID $server.Id /T /F 2>$null | Out-Null
    Start-Sleep -Seconds 2
    $server = Start-DevServer
    $lastHead = Get-Head
  }
}
finally {
  if ($server -and -not $server.HasExited) { & taskkill.exe /PID $server.Id /T /F 2>$null | Out-Null }
}
