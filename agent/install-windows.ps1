param(
  [Parameter(Mandatory=$true)][string]$ElasticUrl,
  [string]$Username,
  [string]$Password,
  [string]$ApiKey,
  [string]$Site = "default-site",
  [string]$Role = "workstation",
  [string]$Environment = "prod",
  [string]$ProfileId = "",
  [string]$AssetId = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
$beatsRoot = "C:\Program Files\NetSentinelAgent"
New-Item -ItemType Directory -Force -Path $beatsRoot | Out-Null

function Get-OutputBlock {
  if ($ApiKey) {
    return @"
output.elasticsearch:
  hosts: ["$ElasticUrl"]
  api_key: "$ApiKey"
"@
  }
  return @"
output.elasticsearch:
  hosts: ["$ElasticUrl"]
  username: "$Username"
  password: "$Password"
"@
}

$commonFields = @"
fields:
  site: "$Site"
  role: "$Role"
  environment: "$Environment"
  profile_id: "$ProfileId"
  asset_id: "$AssetId"
fields_under_root: true
tags: ["netsentinel", "$Role", "$Environment", "windows"]
"@

$filebeatConfig = @"
filebeat.inputs:
  - type: filestream
    id: windows-events
    enabled: true
    paths:
      - C:\Windows\System32\winevt\Logs\*.evtx
$commonFields
$(Get-OutputBlock)
"@

$packetbeatConfig = @"
packetbeat.interfaces.device: 0
packetbeat.protocols:
  - type: dns
    ports: [53]
  - type: http
    ports: [80, 8080, 8000, 443]
  - type: tls
    ports: [443, 8443]
$commonFields
$(Get-OutputBlock)
"@

$metricbeatConfig = @"
metricbeat.modules:
  - module: system
    metricsets: [cpu, load, memory, network, process, process_summary]
    enabled: true
    period: 10s
$commonFields
$(Get-OutputBlock)
"@

$filebeatConfig | Set-Content -Path "$beatsRoot\filebeat.yml"
$packetbeatConfig | Set-Content -Path "$beatsRoot\packetbeat.yml"
$metricbeatConfig | Set-Content -Path "$beatsRoot\metricbeat.yml"

Write-Host "NetSentinel Windows bootstrap generated in $beatsRoot"
Write-Host "Copy Beat binaries, then install services with these configs."
