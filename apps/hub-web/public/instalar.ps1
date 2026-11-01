# Absolute ZRO · instala a central de apps no Windows, numa linha (ela instala e atualiza todos os outros apps).
#
#   irm https://absolutezro.com/instalar.ps1 | iex
#
# O que este script faz, nesta ordem (o arquivo baixado já sai pronto para abrir: Unblock-File, em silêncio):
#   1. lê a versão mais nova e o SHA-256 do instalador em /baixar/hub/versao;
#   2. baixa o instalador de /baixar/hub/windows e confere o SHA-256 (não bateu = não instala nada);
#   3. fecha o Absolute ZRO, se estiver aberto;
#   4. roda o instalador em silêncio (só para este usuário, sem senha de administrador) e abre o app.
# Tudo fica dentro de um bloco só, que roda no fim: um download cortado no meio não roda pela metade.
# Sem "exit": com "| iex" ele fecharia a janela do PowerShell.

& {
  $ErrorActionPreference = 'Stop'
  # A barra de progresso do Invoke-WebRequest deixa o download muito mais lento no Windows PowerShell 5.
  $ProgressPreference = 'SilentlyContinue'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {}

  $site = if ($env:ZRO_SITE) { $env:ZRO_SITE.TrimEnd('/') } else { 'https://absolutezro.com' }
  $tmp = $null

  function Passo([string]$n, [string]$texto) {
    Write-Host ''
    Write-Host "$n " -NoNewline -ForegroundColor White
    Write-Host $texto
  }
  function Nota([string]$texto) { Write-Host "  $texto" -ForegroundColor DarkGray }
  function Falha([string]$texto, [string]$dica = '') {
    $e = New-Object Exception $texto
    $e.Data['dica'] = $dica
    throw $e
  }

  try {
    Write-Host 'Absolute ZRO · instalação pelo PowerShell' -ForegroundColor White

    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
      Falha 'Este instalador é para Windows.' "No Mac, abra o Terminal e rode: curl -fsSL $site/instalar.sh | bash"
    }

    # 1. Versão mais nova e o SHA-256 do instalador
    Passo '1/4' 'Procurando a versão mais nova...'
    try {
      $versao = Invoke-RestMethod -Uri "$site/baixar/hub/versao" -UseBasicParsing -TimeoutSec 30
    } catch {
      Falha 'Não consegui falar com o site.' 'Confira a internet e rode o comando de novo.'
    }
    $build = $versao.build
    $sha = [string]$versao.sha256Windows
    if (-not $build) { Falha 'O site não respondeu com uma versão.' 'Tente de novo em alguns minutos.' }
    if ($sha -notmatch '^[0-9a-fA-F]{64}$') {
      Falha 'O site ainda não publicou a conferência (SHA-256) desta versão.' 'Tente de novo em alguns minutos.'
    }
    $sha = $sha.ToLowerInvariant()
    Nota "build $build"

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('absolutezro-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $setup = Join-Path $tmp 'AbsoluteZRO-setup.exe'

    # 2. Baixa e confere
    Passo '2/4' 'Baixando o Absolute ZRO... (pode levar alguns minutos)'
    try {
      Invoke-WebRequest -Uri "$site/baixar/hub/windows?build=$build" -OutFile $setup -UseBasicParsing
    } catch {
      Falha 'O download não terminou.' 'Confira a internet e rode o comando de novo.'
    }
    try { Unblock-File -LiteralPath $setup -ErrorAction SilentlyContinue } catch {}
    $got = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($got -ne $sha) {
      Falha 'O arquivo baixado não bate com a conferência do site (SHA-256). Nada foi instalado.' 'Pode ser uma versão nova sendo publicada agora: espere uns minutos e rode de novo.'
    }
    Nota ('conferido (SHA-256 ' + $sha.Substring(0, 12) + '...)')

    # 3. Fecha o app aberto (pelo jeito normal)
    $abertos = @(Get-Process -Name 'Absolute ZRO' -ErrorAction SilentlyContinue)
    if ($abertos.Count -gt 0) {
      Passo '3/4' 'Fechando o Absolute ZRO aberto...'
      foreach ($p in $abertos) { try { [void]$p.CloseMainWindow() } catch {} }
      $limite = (Get-Date).AddSeconds(60)
      while ((Get-Process -Name 'Absolute ZRO' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite) { Start-Sleep -Milliseconds 500 }
      if (Get-Process -Name 'Absolute ZRO' -ErrorAction SilentlyContinue) {
        Falha 'O Absolute ZRO não fechou.' 'Feche o app (Arquivo > Sair) e rode o comando de novo.'
      }
    } else {
      Passo '3/4' 'O Absolute ZRO não está aberto. Seguindo.'
    }

    # 4. Instala em silêncio (/S) e abre o app (--force-run).
    # Espera só o instalador (Start-Process -Wait esperaria também o app que ele abre).
    Passo '4/4' 'Instalando...'
    $proc = Start-Process -FilePath $setup -ArgumentList '/S', '--force-run' -PassThru
    $null = $proc.Handle
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) {
      Falha "O instalador terminou com erro (código $($proc.ExitCode))." "Rode o comando de novo. Se continuar, baixe pelo site: $site/baixar/hub/windows"
    }

    Write-Host ''
    Write-Host "Pronto: Absolute ZRO instalado (build $build)." -ForegroundColor Green
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Name 'Absolute ZRO' -ErrorAction SilentlyContinue)) {
      $exe = Join-Path $env:LOCALAPPDATA 'Programs\absolute-zro-desktop\Absolute ZRO.exe'
      if (Test-Path -LiteralPath $exe) { Start-Process -FilePath $exe } else { Nota 'Abra o Absolute ZRO pelo menu Iniciar.' }
    }
    Nota 'Entre com a sua conta: seus apps aparecem lá, prontos para instalar. Daqui em diante a Absolute ZRO se atualiza sozinha.'
  } catch {
    Write-Host ''
    Write-Host ('Erro: ' + $_.Exception.Message) -ForegroundColor Red
    $dica = $_.Exception.Data['dica']
    if ($dica) { Write-Host "  $dica" }
  } finally {
    if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
