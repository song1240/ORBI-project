[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RequiredNodeMajor = 20
$PnpmVersion = "10.26.1"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

Write-Host "Model Pilot Windows installer" -ForegroundColor Green
Write-Host "Project: $Root"

if ($env:OS -ne "Windows_NT") {
  throw "This installer must be run on Windows PowerShell 5.1+ or PowerShell 7+."
}

Write-Step "Checking Node.js"
$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
  throw "Node.js is not installed. Install Node.js 20 LTS or newer from https://nodejs.org and run this script again."
}

$NodeVersion = (& node --version).Trim().TrimStart("v")
$NodeMajor = [int]($NodeVersion.Split(".")[0])
if ($NodeMajor -lt $RequiredNodeMajor) {
  throw "Node.js $NodeVersion is too old. Model Pilot requires Node.js $RequiredNodeMajor or newer."
}
Write-Host "Node.js $NodeVersion"

Write-Step "Preparing pnpm"
$Pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$InstalledPnpmVersion = if ($Pnpm) { (& $Pnpm.Source --version).Trim() } else { "" }
if (-not $Pnpm -or $InstalledPnpmVersion -ne $PnpmVersion) {
  if ($InstalledPnpmVersion) {
    Write-Host "Replacing pnpm $InstalledPnpmVersion with required version $PnpmVersion."
  }
  $Corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
  if ($Corepack) {
    try {
      Invoke-Checked $Corepack.Source @("enable")
      Invoke-Checked $Corepack.Source @("prepare", "pnpm@$PnpmVersion", "--activate")
    }
    catch {
      Write-Warning "Corepack could not activate pnpm. Falling back to npm global installation."
      Invoke-Checked "npm.cmd" @("install", "--global", "pnpm@$PnpmVersion")
    }
  }
  else {
    Invoke-Checked "npm.cmd" @("install", "--global", "pnpm@$PnpmVersion")
  }
  $Pnpm = Get-Command pnpm.cmd -ErrorAction Stop
}
$InstalledPnpmVersion = (& $Pnpm.Source --version).Trim()
if ($InstalledPnpmVersion -ne $PnpmVersion) {
  throw "pnpm $InstalledPnpmVersion is active, but Model Pilot requires pnpm $PnpmVersion."
}
Write-Host "pnpm $InstalledPnpmVersion"

Set-Location $Root

Write-Step "Installing dependencies"
Invoke-Checked $Pnpm.Source @("install", "--frozen-lockfile")

$RuntimeDir = Join-Path $Root ".model-pilot"
$LogDir = Join-Path $RuntimeDir "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not $SkipBuild) {
  Write-Step "Checking source"
  Invoke-Checked $Pnpm.Source @("run", "typecheck")

  Write-Step "Building API server"
  Invoke-Checked $Pnpm.Source @("--filter", "@workspace/api-server", "run", "build")

  Write-Step "Building dashboard"
  $env:PORT = "3791"
  $env:BASE_PATH = "/"
  $env:LOCAL_WINDOWS = "1"
  $env:NODE_ENV = "production"
  Invoke-Checked $Pnpm.Source @("--filter", "@workspace/model-pilot", "run", "build")
}

Write-Host ""
Write-Host "Model Pilot is installed." -ForegroundColor Green
Write-Host "Start it with: .\scripts\start-windows.ps1"