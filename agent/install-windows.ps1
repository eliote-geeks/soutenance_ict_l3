param(
  [string]$ElasticUrl,
  [string]$Username,
  [string]$Password,
  [string]$ApiKey,
  [string]$ElasticVerifyTls = "true",
  [string]$FilebeatIndex = "filebeat-*",
  [string]$PacketbeatIndex = "packetbeat-*",
  [string]$MetricbeatIndex = ".ds-metricbeat-*",
  [string]$ApiUrl,
  [string]$EnrollmentToken,
  [string]$Site = "default-site",
  [string]$Role = "workstation",
  [string]$Environment = "prod",
  [string]$ProfileId = "",
  [string]$AssetId = $env:COMPUTERNAME,
  [switch]$Resume,
  [switch]$Upgrade,
  [switch]$Uninstall,
  [int]$PollIntervalSeconds = 5,
  [int]$ApprovalTimeoutSeconds = 300,
  [string]$BeatsVersion = "8.17.3"
)

$ErrorActionPreference = "Stop"
$AgentName = "NetSentinel Agent"
$AgentVersion = "1.2.0"
$beatsRoot = "C:\Program Files\NetSentinelAgent"
$stateFile = Join-Path $beatsRoot "agent.json"
$signalLogPath = "C:\ProgramData\NetSentinelAgent\signals.ndjson"
$triageDir = "C:\ProgramData\NetSentinelAgent\triage"
$runtimeScriptPath = Join-Path $beatsRoot "runtime-windows.ps1"
$runtimeTaskName = "NetSentinelAgentRuntime"
$runtimeIntervalSeconds = 300
$allowBasicAuth = $env:NETSENTINEL_ALLOW_BASIC_AUTH -eq "true"
$downloadsRoot = Join-Path $env:TEMP "NetSentinelAgent"
$beatServices = @("filebeat", "packetbeat", "metricbeat", "winlogbeat")
$hostnameValue = $env:COMPUTERNAME
$ipValue = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "169.254*" -and $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ipValue) { $ipValue = "127.0.0.1" }
$osValue = (Get-CimInstance Win32_OperatingSystem).Caption

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Administrator {
  if (-not (Test-IsAdministrator)) {
    throw "$AgentName must be run from an elevated PowerShell session."
  }
}

function Assert-Url {
  param([string]$Name, [string]$Value)
  if (-not $Value -or $Value -notmatch '^https?://') {
    throw "$Name must start with http:// or https://"
  }
}

function Assert-ApiReachable {
  Assert-Url -Name "-ApiUrl" -Value $ApiUrl
  try {
    Invoke-RestMethod -Method Get -Uri "$ApiUrl/health" -TimeoutSec 10 | Out-Null
  } catch {
    throw "Unable to reach NetSentinel API at $ApiUrl/health: $($_.Exception.Message)"
  }
}

function Assert-ElasticCredentials {
  if ($ApiKey) {
    return
  }
  if ($Username -and $Password -and $allowBasicAuth) {
    return
  }
  throw "Elastic API key is required. Basic auth is blocked unless NETSENTINEL_ALLOW_BASIC_AUTH=true."
}

function Protect-Path {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return
  }
  if ((Get-Item $Path).PSIsContainer) {
    & icacls $Path /inheritance:r /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
  } else {
    & icacls $Path /inheritance:r /grant:r "Administrators:F" "SYSTEM:F" | Out-Null
  }
}

function Initialize-AgentDirectories {
  New-Item -ItemType Directory -Force -Path $beatsRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $downloadsRoot | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $signalLogPath) | Out-Null
  New-Item -ItemType Directory -Force -Path $triageDir | Out-Null
  Protect-Path -Path $beatsRoot
  Protect-Path -Path (Split-Path -Parent $signalLogPath)
}

function Stop-AgentService {
  param([string]$ServiceName)
  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($service) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Set-Service -Name $ServiceName -StartupType Disabled -ErrorAction SilentlyContinue
  }
}

function Stop-RuntimeTask {
  if (Get-ScheduledTask -TaskName $runtimeTaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $runtimeTaskName -ErrorAction SilentlyContinue
  }
}

function Uninstall-Agent {
  Assert-Administrator
  if (Get-ScheduledTask -TaskName $runtimeTaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $runtimeTaskName -Confirm:$false
  }
  foreach ($beat in $beatServices) {
    $serviceName = (Get-Culture).TextInfo.ToTitleCase($beat)
    Stop-AgentService -ServiceName $serviceName
  }
  Remove-Item -Force -ErrorAction SilentlyContinue "$beatsRoot\filebeat.yml", "$beatsRoot\packetbeat.yml", "$beatsRoot\metricbeat.yml", "$beatsRoot\winlogbeat.yml", $runtimeScriptPath
  if ($env:NETSENTINEL_KEEP_STATE -ne "true") {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $beatsRoot, (Split-Path -Parent $signalLogPath)
  }
  Write-Host "$AgentName removed. Set NETSENTINEL_KEEP_STATE=true to keep state during uninstall."
}

function Get-OutputBlock {
  $sslBlock = ""
  if ($ElasticVerifyTls -eq "false") {
    $sslBlock = "  ssl.verification_mode: none`n"
  }
  if ($ApiKey) {
    return @"
output.elasticsearch:
  hosts: ["$ElasticUrl"]
  api_key: "$ApiKey"
$sslBlock
"@
  }
  if ($Username -and $Password) {
    return @"
output.elasticsearch:
  hosts: ["$ElasticUrl"]
  username: "$Username"
  password: "$Password"
$sslBlock
"@
  }
  throw "Missing Elasticsearch credentials. Provide -ApiKey or -Username/-Password."
}

function Write-Configs {
  Initialize-AgentDirectories
  Assert-ElasticCredentials
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
    id: netsentinel-agent-signals
    enabled: true
    paths:
      - C:\ProgramData\NetSentinelAgent\*.ndjson
    parsers:
      - ndjson:
          target: ""
$commonFields
$(Get-OutputBlock)
"@

  $winlogbeatConfig = @"
winlogbeat.event_logs:
  - name: Security
    ignore_older: 72h
  - name: System
    ignore_older: 72h
  - name: Application
    ignore_older: 72h
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
    metricsets: [cpu, memory, network, process, process_summary]
    enabled: true
    period: 10s
$commonFields
$(Get-OutputBlock)
"@

  $filebeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\filebeat.yml"
  $winlogbeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\winlogbeat.yml"
  $packetbeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\packetbeat.yml"
  $metricbeatConfig | Set-Content -Encoding UTF8 -Path "$beatsRoot\metricbeat.yml"
  Protect-Path -Path $beatsRoot
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
    agent_name = $AgentName
    agent_version = $AgentVersion
    beats_version = $BeatsVersion
    runtime_heartbeat_interval_seconds = $runtimeIntervalSeconds
    elastic = @{
      verify_tls = $ElasticVerifyTls
      indices = @{
        filebeat = $FilebeatIndex
        packetbeat = $PacketbeatIndex
        metricbeat = $MetricbeatIndex
      }
    }
  }
  Initialize-AgentDirectories
  $payload | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $stateFile
  Protect-Path -Path $stateFile
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

function Download-BeatPackage {
  param([string]$BeatName)
  $zipName = "$BeatName-$BeatsVersion-windows-x86_64.zip"
  $zipPath = Join-Path $downloadsRoot $zipName
  $extractDir = Join-Path $downloadsRoot "$BeatName-$BeatsVersion"
  $url = "https://artifacts.elastic.co/downloads/beats/$BeatName/$zipName"

  if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading $BeatName $BeatsVersion..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath
  }

  if (-not (Test-Path $extractDir)) {
    Expand-Archive -Force -Path $zipPath -DestinationPath $extractDir
  }

  return Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
}

function Install-BeatService {
  param(
    [string]$BeatName,
    [string]$ConfigPath
  )
  $packageDir = Download-BeatPackage -BeatName $BeatName
  if (-not $packageDir) {
    throw "Unable to extract package for $BeatName."
  }

  $targetDir = Join-Path "C:\Program Files" $BeatName
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -Force -Recurse -Path (Join-Path $packageDir.FullName '*') -Destination $targetDir
  Copy-Item -Force -Path $ConfigPath -Destination (Join-Path $targetDir "$BeatName.yml")

  $serviceName = (Get-Culture).TextInfo.ToTitleCase($BeatName)
  $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if (-not $existingService) {
    $installerScript = Join-Path $targetDir "install-service-$BeatName.ps1"
    if (Test-Path $installerScript) {
      powershell -ExecutionPolicy Bypass -File $installerScript | Out-Null
    }
  }

  Start-Service -Name $serviceName -ErrorAction Stop
}

function Install-Beats {
  Install-BeatService -BeatName "filebeat" -ConfigPath "$beatsRoot\filebeat.yml"
  Install-BeatService -BeatName "winlogbeat" -ConfigPath "$beatsRoot\winlogbeat.yml"
  Install-BeatService -BeatName "packetbeat" -ConfigPath "$beatsRoot\packetbeat.yml"
  Install-BeatService -BeatName "metricbeat" -ConfigPath "$beatsRoot\metricbeat.yml"
}

function Install-AgentRuntime {
  Initialize-AgentDirectories
  if (-not (Test-Path (Join-Path $PSScriptRoot "runtime-windows.ps1"))) {
    throw "runtime-windows.ps1 is missing beside the installer."
  }
  Copy-Item -Force -Path (Join-Path $PSScriptRoot "runtime-windows.ps1") -Destination $runtimeScriptPath
  Protect-Path -Path $runtimeScriptPath
}

function Register-AgentRuntimeTask {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$runtimeScriptPath`" -StateFile `"$stateFile`" -SignalLogPath `"$signalLogPath`" -TriageDir `"$triageDir`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
  $trigger.Repetition = New-ScheduledTaskRepetitionSettingsSet -Interval (New-TimeSpan -Seconds $runtimeIntervalSeconds) -Duration ([TimeSpan]::MaxValue)
  Register-ScheduledTask -TaskName $runtimeTaskName -Action $action -Trigger $trigger -Description "NetSentinel local runtime" -Force | Out-Null
  Start-ScheduledTask -TaskName $runtimeTaskName
}

function Send-Heartbeat {
  param(
    [string]$InstanceId,
    [string]$ServiceState,
    [string]$LastError = ""
  )
  $payload = @{
    instance_id = $InstanceId
    service_state = $ServiceState
  }
  if ($LastError) {
    $payload.last_error = $LastError
  }
  Invoke-AgentApi -Path "/api/agent/heartbeat" -Payload $payload | Out-Null
}

function Apply-Activation {
  param(
    [pscustomobject]$Response,
    [string]$InstanceId
  )

  $activation = $Response.activation
  $asset = $activation.asset
  $elastic = $activation.elastic
  $runtime = $activation.runtime

  $script:ElasticUrl = $elastic.url
  $script:ApiKey = $elastic.api_key
  $script:Username = $elastic.username
  $script:Password = $elastic.password
  if ($elastic.auth_mode -eq "basic" -and $elastic.allow_basic_auth -eq $true) {
    $script:allowBasicAuth = $true
  }
  if ($null -ne $elastic.verify_tls) {
    $script:ElasticVerifyTls = "$($elastic.verify_tls)".ToLowerInvariant()
  }
  if ($elastic.indices) {
    if ($elastic.indices.filebeat) { $script:FilebeatIndex = $elastic.indices.filebeat }
    if ($elastic.indices.packetbeat) { $script:PacketbeatIndex = $elastic.indices.packetbeat }
    if ($elastic.indices.metricbeat) { $script:MetricbeatIndex = $elastic.indices.metricbeat }
  }
  $script:Site = $asset.site
  $script:Role = $asset.role
  $script:Environment = $asset.environment
  $script:ProfileId = $asset.profile_id
  $script:AssetId = $asset.id
  if ($runtime.heartbeat_interval_seconds) {
    $script:runtimeIntervalSeconds = [int]$runtime.heartbeat_interval_seconds
  }

  Assert-ElasticCredentials
  Write-Configs

  try {
    Install-Beats
    Install-AgentRuntime
    Register-AgentRuntimeTask
  } catch {
    Save-State -InstanceId $InstanceId -Status "approved"
    Send-Heartbeat -InstanceId $InstanceId -ServiceState "error" -LastError $_.Exception.Message
    throw "Beats installation failed: $($_.Exception.Message)"
  }

  $final = Invoke-AgentApi -Path "/api/agent/checkin" -Payload @{
    instance_id = $InstanceId
    hostname = $hostnameValue
    ip = $ipValue
    os = $osValue
    activation_applied = $true
    capabilities = @{
      platform = "windows"
      actions = @("block_ip", "unblock_ip", "terminate_process_by_name", "terminate_process_by_pid", "collect_triage")
      telemetry = @("failed_login_indicators", "privilege_indicators", "defense_evasion_indicators", "phishing_indicators", "suspicious_archive_hits", "internal_remote_service_hits", "external_destinations", "external_established_connections", "listening_ports")
    }
  }
  Save-State -InstanceId $InstanceId -Status $final.instance.status
  Send-Heartbeat -InstanceId $InstanceId -ServiceState "running"

  Write-Host "$AgentName $AgentVersion active on asset $AssetId."
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
    if (-not $response.success -and $response.message) {
      throw $response.message
    }
    if ($response.instance.status -in @("approved", "active")) {
      Apply-Activation -Response $response -InstanceId $InstanceId
      return
    }
    Start-Sleep -Seconds $PollIntervalSeconds
  }
  Write-Host "Enrollment pending approval. Re-run with -Resume after admin approval."
}

if ($Uninstall) {
  Uninstall-Agent
  return
}

Assert-Administrator

if ($Upgrade) {
  $state = Load-State
  $ApiUrl = $state.api_url
  $AssetId = $state.asset_id
  $ProfileId = $state.profile_id
  if ($state.beats_version) {
    $BeatsVersion = $state.beats_version
  }
  if ($state.runtime_heartbeat_interval_seconds) {
    $runtimeIntervalSeconds = [int]$state.runtime_heartbeat_interval_seconds
  }
  if ($state.elastic) {
    if ($state.elastic.verify_tls) { $ElasticVerifyTls = $state.elastic.verify_tls }
    if ($state.elastic.indices) {
      if ($state.elastic.indices.filebeat) { $FilebeatIndex = $state.elastic.indices.filebeat }
      if ($state.elastic.indices.packetbeat) { $PacketbeatIndex = $state.elastic.indices.packetbeat }
      if ($state.elastic.indices.metricbeat) { $MetricbeatIndex = $state.elastic.indices.metricbeat }
    }
  }
  Stop-RuntimeTask
  Assert-ApiReachable
  Wait-ForApproval -InstanceId $state.instance_id
  return
}

if ($Resume) {
  $state = Load-State
  $ApiUrl = $state.api_url
  $AssetId = $state.asset_id
  $ProfileId = $state.profile_id
  if ($state.beats_version) {
    $BeatsVersion = $state.beats_version
  }
  if ($state.runtime_heartbeat_interval_seconds) {
    $runtimeIntervalSeconds = [int]$state.runtime_heartbeat_interval_seconds
  }
  if ($state.elastic) {
    if ($state.elastic.verify_tls) { $ElasticVerifyTls = $state.elastic.verify_tls }
    if ($state.elastic.indices) {
      if ($state.elastic.indices.filebeat) { $FilebeatIndex = $state.elastic.indices.filebeat }
      if ($state.elastic.indices.packetbeat) { $PacketbeatIndex = $state.elastic.indices.packetbeat }
      if ($state.elastic.indices.metricbeat) { $MetricbeatIndex = $state.elastic.indices.metricbeat }
    }
  }
  Assert-ApiReachable
  Wait-ForApproval -InstanceId $state.instance_id
  return
}

if ($EnrollmentToken) {
  if (-not $ApiUrl) {
    throw "-ApiUrl is required with -EnrollmentToken"
  }
  Assert-ApiReachable
  $enroll = Invoke-AgentApi -Path "/api/agent/enroll" -Payload @{
    token = $EnrollmentToken
    hostname = $hostnameValue
    ip = $ipValue
    os = $osValue
    agent_version = $AgentVersion
  }
  Save-State -InstanceId $enroll.instance.id -Status $enroll.instance.status
  Write-Host "$AgentName $AgentVersion submitted as instance $($enroll.instance.id). Waiting for admin approval..."
  Wait-ForApproval -InstanceId $enroll.instance.id
  return
}

if (-not $ElasticUrl) {
  throw "-ElasticUrl is required in direct mode"
}
Assert-Url -Name "-ElasticUrl" -Value $ElasticUrl
Assert-ElasticCredentials

Write-Configs
try {
  Install-Beats
} catch {
  throw "Direct installation failed: $($_.Exception.Message)"
}
Write-Host "$AgentName $AgentVersion installed in direct mode."
