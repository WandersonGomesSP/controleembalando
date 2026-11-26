$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-Git {
  param([string[]]$GitArgs)
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & git @GitArgs 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  return [pscustomobject]@{
    ExitCode = $exitCode
    Text = (($output | ForEach-Object { "$_" }) -join [Environment]::NewLine).Trim()
  }
}

function Get-Head {
  $r = Invoke-Git @('rev-parse', 'HEAD')
  if ($r.ExitCode -ne 0) { throw "Nao foi possivel ler o commit local: $($r.Text)" }
  return $r.Text
}

function Start-DevServer {
  Write-Host ""
  Write-Host "Iniciando o sistema local..." -ForegroundColor Green
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow
  Start-Sleep -Seconds 8
  Write-Host "Servidor iniciado. O navegador nao sera aberto automaticamente." -ForegroundColor Gray
  return $p
}

function Stop-DevServer {
  param($Process)

  if (-not $Process) { return }
  try {
    $Process.Refresh()
    if ($Process.HasExited) { return }

    # Execute taskkill as a separate process so a non-zero exit code
    # cannot be promoted to a terminating PowerShell error.
    $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $killer = Start-Process -FilePath $taskkill -ArgumentList @('/PID', [string]$Process.Id, '/T', '/F') -WindowStyle Hidden -PassThru -Wait -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    $Process.Refresh()
    if (-not $Process.HasExited -and $killer -and $killer.ExitCode -ne 0) {
      Write-Host "Aviso: o processo antigo ja encerrou ou o Windows nao permitiu finalizar todos os subprocessos. O monitor continuara." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "Aviso: nao foi necessario finalizar o processo anterior. O monitor continuara." -ForegroundColor Yellow
  }
}

function Update-Repository {
  param([switch]$Announce)

  # Nao usa git stash: em configuracoes locais do Expo (app.json/eas.json)
  # o indice pode estar marcado como desatualizado e o stash falha.
  # O pull --ff-only nunca descarta alteracoes locais; se houver conflito,
  # o Git recusa a atualizacao e o servidor local continua funcionando.
  $status = Invoke-Git @('status', '--short')
  if ($status.ExitCode -ne 0) {
    Write-Host "Nao consegui verificar os arquivos locais: $($status.Text)" -ForegroundColor Red
    return $false
  }

  if (-not [string]::IsNullOrWhiteSpace($status.Text)) {
    Write-Host "Existem arquivos locais modificados. Vou atualizar somente se o Git conseguir fazer fast-forward sem sobrescreve-los." -ForegroundColor Yellow
  }

  Write-Host "Baixando a atualizacao do GitHub..." -ForegroundColor Cyan
  $pull = Invoke-Git @('pull', '--ff-only', 'origin', 'desenvolvimento')
  if ($pull.ExitCode -ne 0) {
    Write-Host "Nao foi possivel aplicar a atualizacao sem mexer nos arquivos locais." -ForegroundColor Yellow
    Write-Host "Nenhuma alteracao local foi apagada. O sistema sera iniciado com os arquivos que ja estao nesta pasta." -ForegroundColor Yellow
    Write-Host $pull.Text
    return $false
  }

  if ($Announce) {
    Write-Host "Atualizacao concluida. Reiniciando o servidor local..." -ForegroundColor Green
  }
  return $true
}

$branchResult = Invoke-Git @('branch', '--show-current')
if ($branchResult.ExitCode -ne 0 -or $branchResult.Text -ne 'desenvolvimento') {
  Write-Host "Esta pasta precisa estar na branch desenvolvimento. Branch atual: $($branchResult.Text)" -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}

Write-Host "Buscando atualizacoes do GitHub..." -ForegroundColor Cyan
$fetch = Invoke-Git @('fetch', 'origin', 'desenvolvimento')
if ($fetch.ExitCode -ne 0) {
  Write-Host "Nao foi possivel consultar o GitHub. O sistema sera iniciado com a versao local." -ForegroundColor Yellow
  Write-Host $fetch.Text
} else {
  if (-not (Update-Repository)) {
    Write-Host "A atualizacao ficou pendente. O sistema sera iniciado com a versao local." -ForegroundColor Yellow
  }
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

    $fetch = Invoke-Git @('fetch', 'origin', 'desenvolvimento')
    if ($fetch.ExitCode -ne 0) { continue }

    $remote = Invoke-Git @('rev-parse', 'origin/desenvolvimento')
    if ($remote.ExitCode -ne 0 -or $remote.Text -eq $lastHead) { continue }

    # Debounce: so atualiza quando o commit remoto ficar estavel por mais de 5 segundos.
    $candidato = $remote.Text
    $ultimoCommitDetectado = $candidato
    $segundosEstavel = 0
    Write-Host ""
    Write-Host "Atualizacao encontrada. Aguardando 5 segundos sem novos arquivos..." -ForegroundColor Yellow

    while ($segundosEstavel -lt 6) {
      Start-Sleep -Seconds 1
      $verificacao = Invoke-Git @('fetch', 'origin', 'desenvolvimento')
      if ($verificacao.ExitCode -ne 0) { continue }
      $headVerificado = Invoke-Git @('rev-parse', 'origin/desenvolvimento')
      if ($headVerificado.ExitCode -ne 0) { continue }

      if ($headVerificado.Text -ne $ultimoCommitDetectado) {
        $ultimoCommitDetectado = $headVerificado.Text
        $segundosEstavel = 0
        Write-Host "Chegou outra alteracao. Reiniciando a contagem dos 5 segundos..." -ForegroundColor Yellow
      } else {
        $segundosEstavel++
      }
    }

    Write-Host "Atualizacao estavel. Aplicando agora..." -ForegroundColor Cyan
    try { [Console]::Beep(1000, 200); [Console]::Beep(1400, 200) } catch { }

    if (Update-Repository -Announce) {
      # Reinicia apenas o servidor local; mantem esta mesma janela aberta.
      if ($server -and -not $server.HasExited) {
        Stop-DevServer -Process $server
        Start-Sleep -Seconds 2
      }
      $server = Start-DevServer
      $lastHead = Get-Head
      Write-Host "Monitoramento continuo ativo. Esta janela permanecera aberta." -ForegroundColor Green
    } else {
      $lastHead = $ultimoCommitDetectado
    }
  }
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-DevServer -Process $server
  }
}