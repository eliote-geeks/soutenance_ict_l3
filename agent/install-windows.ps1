param(
  [string]$ElasticUrl,
  [string]$Username,
  [string]$Password,
  [string]$ApiKey,
  [string]$ApiUrl,
  [string]$EnrollmentToken,
  [string]$Site = "default-site",
  [string]$Role = "workstation",
  [string]$Environment = "prod",
  [string]$ProfileId = "",
  [string]$AssetId = $env:COMPUTERNAME,
  [switch]$Resume,
  [int]$PollIntervalSeconds = 5,
  [int]$ApprovalTimeoutSeconds = 300
)

$ErrorActionPreference = "Stop"
$beatsRoot = "C:\Program Files\NetSentinelAgent"
$stateFile = Join-Path $beatsRoot "agent.json"
$hostnameValue = $env:COMPUTERNAME
$ipValue = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ipValue) { $ipValue = "127.0.0.1" }
$osValue = (Get-CimInstance Win32_OperatingSystem).Caption

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

function Write-Configs {
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

  $filebeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\filebeat.yml"
  $packetbeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\packetbeat.yml"
  $metricbeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\metricbeat.yml"
}

function Save-State {
  param(
    [string]$InstanceId,
    [string]$Status
  )
  $payload = @{
    instance_id = $InstanceId
    status = $Status
    api_url = $ApiUrl
    asset_id = $AssetId
    profile_id = $ProfileId
    hostname = $hostnameValue
    ip = $ipValue
    os = $osValue
  }
  $payload | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $stateFile
}

function Load-State {
  if (-not (Test-Path $stateFile)) {
    throw "State file not found: $stateFile"
  }
  return Get-Content -Raw -Path $stateFile | ConvertFrom-Json
}

function Invoke-AgentApi {
  param(
    [string]$Path,
    [hashtable]$Payload
  )
  return Invoke-RestMethod -Method Post -Uri "$ApiUrl$Path" -ContentType "application/json" -Body ($Payload | ConvertTo-Json -Depth 6)
}

function Apply-Activation {
  param(
    [pscustomobject]$Response,
    [string]$InstanceId
  )

  $activation = $Response.activation
  $asset = $activation.asset
  $elastic = $activation.elastic

  $script:ElasticUrl = $elastic.url
  $script:ApiKey = $elastic.api_key
  $script:Username = $elastic.username
  $script:Password = $elastic.password
  $script:Site = $asset.site
  $script:Role = $asset.role
  $script:Environment = $asset.environment
  $script:ProfileId = $asset.profile_id
  $script:AssetId = $asset.id

  Write-Configs

  $final = Invoke-AgentApi -Path "/api/agent/checkin" -Payload @{
    instance_id = $InstanceId
    hostname = $hostnameValue
    ip = $ipValue
    os = $osValue
    activation_applied = $true
  }
  Save-State -InstanceId $InstanceId -Status $final.instance.status
  Invoke-AgentApi -Path "/api/agent/heartbeat" -Payload @{
    instance_id = $InstanceId
    service_state = "configured"
  } | Out-Null

  Write-Host "Activation received. Configs written to $beatsRoot."
  Write-Host "Install Beat binaries and Windows services, then the agent will be fully active."
}

function Wait-ForApproval {
  param([string]$InstanceId)
  $deadline = (Get-Date).AddSeconds($ApprovalTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $response = Invoke-AgentApi -Path "/api/agent/checkin" -Payload @{
      instance_id = $InstanceId
      hostname = $hostnameValue
      ip = $ipValue
      os = $osValue
      activation_applied = $false
    }
    Save-State -InstanceId $InstanceId -Status $response.instance.status
    if ($response.instance.status -in @("approved", "active")) {
      Apply-Activation -Response $response -InstanceId $InstanceId
      return
    }
    Start-Sleep -Seconds $PollIntervalSeconds
  }
  Write-Host "Enrollment pending approval. Re-run with -Resume after admin approval."
}

if ($Resume) {
  $state = Load-State
  $ApiUrl = $state.api_url
  $AssetId = $state.asset_id
  $ProfileId = $state.profile_id
  Wait-ForApproval -InstanceId $state.instance_id
  return
}

if ($EnrollmentToken) {
  if (-not $ApiUrl) {
    throw "-ApiUrl is required with -EnrollmentToken"
  }
  $enroll = Invoke-AgentApi -Path "/api/agent/enroll" -Payload @{
    token = $EnrollmentToken
    hostname = $hostnameValue
    ip = $ipValue
    os = $osValue
    agent_version = "1.0.0"
  }
  Save-State -InstanceId $enroll.instance.id -Status $enroll.instance.status
  Write-Host "Enrollment submitted as instance $($enroll.instance.id). Waiting for admin approval..."
  Wait-ForApproval -InstanceId $enroll.instance.id
  return
}

if (-not $ElasticUrl) {
  throw "-ElasticUrl is required in direct mode"
}

Write-Configs
Write-Host "NetSentinel Windows bootstrap generated in $beatsRoot"
Write-Host "Copy Beat binaries, then install services with these configs."
