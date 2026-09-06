[CmdletBinding()]
param(
  [switch]$NoBrowser,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDir = Join-Path $Root ".model-pilot"
$DataDir = Join-Path $RuntimeDir "data"
$LogDir = Join-Path $RuntimeDir "logs"
$PidFile = Join-Path $RuntimeDir "processes.json"
$DashboardUrl = "http://localhost:3791"
$ApiPort = 3792
$DashboardPort = 3791

function Test-Port([int]$Port) {
  $Client = [System.Net.Sockets.TcpClient]::new()
  try {
    $Result = $Client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $Result.AsyncWaitHandle.WaitOne(250)) { return $false }
    $Client.EndConnect($Result)
    return $true
  }
  catch { return $false }
  finally { $Client.Dispose() }
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds) {
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-Port $Port) { return $true }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $Deadline)
  return $false
}

function Stop-StartedProcess($Process) {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

function Quote-ProcessArgument([string]$Value) {
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Get-RecordedProcess($Record) {
  if (-not $Record -or -not $Record.pid -or -not $Record.startedAt -or -not $Record.commandMarker) {
    return $null
  }

  $Process = Get-Process -Id $Record.pid -ErrorAction SilentlyContinue
  if (-not $Process -or $Process.ProcessName -ne "node") { return $null }

  $ExpectedStart = [DateTime]::Parse($Record.startedAt).ToUniversalTime()
  $ActualStart = $Process.StartTime.ToUniversalTime()
  if ([Math]::Abs(($ActualStart - $ExpectedStart).TotalSeconds) -gt 5) { return $null }

  try {
    $Details = Get-CimInstance Win32_Process -Filter "ProcessId = $($Record.pid)"
    if (-not $Details -or -not $Details.CommandLine -or $Details.CommandLine -notlike "*$($Record.commandMarker)*") {
      return $null
    }
  }
  catch {
    return $null
  }

  return $Process
}

if ($env:OS -ne "Windows_NT") {
  throw "This launcher must be run on Windows."
}

New-Item -ItemType Directory -Force -Path $LogDir, $DataDir | Out-Null
Set-Location $Root

if (Test-Path $PidFile) {
  try {
    $Existing = Get-Content $PidFile -Raw | ConvertFrom-Json
    $ApiAlive = Get-RecordedProcess $Existing.api
    $WebAlive = Get-RecordedProcess $Existing.web
    if ($ApiAlive -and $WebAlive -and (Test-Port $ApiPort) -and (Test-Port $DashboardPort)) {
      Write-Host "Model Pilot is already running at $DashboardUrl" -ForegroundColor Green
      if (-not $NoBrowser) { Start-Process $DashboardUrl }
      exit 0
    }
  }
  catch {
    Write-Warning "Ignoring a stale process file."
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

foreach ($Port in @($DashboardPort, $ApiPort)) {
  if (Test-Port $Port) {
    throw "Port $Port is already in use. Stop the other application or change the Model Pilot port configuration."
  }
}

$Pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $Pnpm) {
  throw "pnpm is unavailable. Run .\scripts\install-windows.ps1 first."
}

$ApiEntry = Join-Path $Root "artifacts\api-server\dist\index.mjs"
$WebEntry = Join-Path $Root "artifacts\model-pilot\dist\public\index.html"
$ViteEntry = Join-Path $Root "artifacts\model-pilot\node_modules\vite\bin\vite.js"
$ViteConfig = Join-Path $Root "artifacts\model-pilot\vite.config.ts"
$Node = Get-Command node.exe -ErrorAction Stop
if ($Rebuild -or -not (Test-Path $ApiEntry) -or -not (Test-Path $WebEntry)) {
  & (Join-Path $PSScriptRoot "install-windows.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path $ViteEntry)) {
  throw "Vite is not installed. Run .\scripts\install-windows.ps1 first."
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ApiOut = Join-Path $LogDir "api-$Timestamp.log"
$ApiErr = Join-Path $LogDir "api-$Timestamp.error.log"
$WebOut = Join-Path $LogDir "web-$Timestamp.log"
$WebErr = Join-Path $LogDir "web-$Timestamp.error.log"

$ApiProcess = $null
$WebProcess = $null

try {
  Write-Host "Starting Model Pilot API on port $ApiPort..."
  $env:PORT = "$ApiPort"
  $env:LOCAL_WINDOWS = "1"
  $env:NODE_ENV = "production"
  $env:MODEL_PILOT_DATA_DIR = $DataDir
  $ApiProcess = Start-Process -FilePath $Node.Source `
    -ArgumentList @("--enable-source-maps", (Quote-ProcessArgument $ApiEntry)) `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $ApiOut -RedirectStandardError $ApiErr

  if (-not (Wait-Port $ApiPort 20)) {
    throw "The API did not open port $ApiPort. See $ApiErr"
  }

  Write-Host "Starting Model Pilot dashboard on port $DashboardPort..."
  $env:PORT = "$DashboardPort"
  $env:BASE_PATH = "/"
  $env:LOCAL_WINDOWS = "1"
  $env:NODE_ENV = "production"
  $WebProcess = Start-Process -FilePath $Node.Source `
    -ArgumentList @((Quote-ProcessArgument $ViteEntry), "preview", "--config", (Quote-ProcessArgument $ViteConfig)) `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $WebOut -RedirectStandardError $WebErr

  if (-not (Wait-Port $DashboardPort 20)) {
    throw "The dashboard did not open port $DashboardPort. See $WebErr"
  }

  $StartedAt = (Get-Date).ToUniversalTime().ToString("o")
  @{
    api = @{
      pid = $ApiProcess.Id
      startedAt = $ApiProcess.StartTime.ToUniversalTime().ToString("o")
      commandMarker = "api-server\dist\index.mjs"
    }
    web = @{
      pid = $WebProcess.Id
      startedAt = $WebProcess.StartTime.ToUniversalTime().ToString("o")
      commandMarker = "model-pilot\node_modules\vite\bin\vite.js"
    }
    startedAt = $StartedAt
  } | ConvertTo-Json -Depth 4 | Set-Content -Path $PidFile -Encoding UTF8

  Write-Host ""
  Write-Host "Model Pilot is running." -ForegroundColor Green
  Write-Host "Dashboard: $DashboardUrl"
  Write-Host "Logs: $LogDir"
  Write-Host "Stop: .\scripts\stop-windows.ps1"

  if (-not $NoBrowser) {
    Start-Process $DashboardUrl
  }
}
catch {
  Stop-StartedProcess $WebProcess
  Stop-StartedProcess $ApiProcess
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  throw
}