$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PidFile = Join-Path $Root ".model-pilot\processes.json"

function Get-RecordedProcess($Record) {
  if (-not $Record -or -not $Record.pid -or -not $Record.startedAt -or -not $Record.commandMarker) {
    return $null
  }

  $Process = Get-Process -Id $Record.pid -ErrorAction SilentlyContinue
  if (-not $Process -or $Process.ProcessName -ne "node") { return $null }

  $ExpectedStart = [DateTime]::Parse($Record.startedAt).ToUniversalTime()
  if ([Math]::Abs(($Process.StartTime.ToUniversalTime() - $ExpectedStart).TotalSeconds) -gt 5) {
    return $null
  }

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

if (-not (Test-Path $PidFile)) {
  Write-Host "Model Pilot is not running."
  exit 0
}

$Processes = Get-Content $PidFile -Raw | ConvertFrom-Json
foreach ($Record in @($Processes.api, $Processes.web)) {
  $Process = Get-RecordedProcess $Record
  if ($Process) {
    & taskkill.exe /PID $Process.Id /T /F | Out-Null
  }
  elseif ($Record -and $Record.pid) {
    Write-Warning "Skipped PID $($Record.pid) because it no longer matches the recorded Model Pilot process."
  }
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
Write-Host "Model Pilot stopped." -ForegroundColor Green