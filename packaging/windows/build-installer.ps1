param(
  [string]$Version = (Get-Content -Raw "$PSScriptRoot\..\..\agent\VERSION").Trim(),
  [string]$OutputDir = "$PSScriptRoot\..\..\dist\windows",
  [string]$IsccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$bundleDir = Join-Path $OutputDir "NetSentinelAgent-$Version"

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Copy-Item -Force "$root\agent\install-windows.ps1" "$bundleDir\install-windows.ps1"
Copy-Item -Force "$root\agent\runtime-windows.ps1" "$bundleDir\runtime-windows.ps1"
Copy-Item -Force "$root\agent\README.md" "$bundleDir\README.md"
Copy-Item -Force "$root\agent\VERSION" "$bundleDir\VERSION"
Copy-Item -Force "$PSScriptRoot\NetSentinelAgent.iss" "$bundleDir\NetSentinelAgent.iss"

Compress-Archive -Force -Path "$bundleDir\*" -DestinationPath (Join-Path $OutputDir "NetSentinelAgent-$Version.zip")

if (Test-Path $IsccPath) {
  & $IsccPath "/DAppVersion=$Version" "$PSScriptRoot\NetSentinelAgent.iss"
  Write-Host "Built Windows installer with Inno Setup."
} else {
  Write-Host "Inno Setup not found. ZIP bundle created at $OutputDir."
}
