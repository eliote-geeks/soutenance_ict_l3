param(
  [string]$StateFile = "C:\Program Files\NetSentinelAgent\agent.json",
  [string]$SignalLogPath = "C:\ProgramData\NetSentinelAgent\signals.ndjson",
  [string]$TriageDir = "C:\ProgramData\NetSentinelAgent\triage"
)

$ErrorActionPreference = "Stop"
$ProtectedProcessNames = @("system", "smss", "csrss", "wininit", "services", "lsass", "svchost", "winlogon", "explorer", "powershell", "pwsh", "filebeat", "packetbeat", "metricbeat", "winlogbeat")

function Get-UtcNow {
  return ([DateTime]::UtcNow.ToString("o"))
}

function Load-State {
  if (-not (Test-Path $StateFile)) {
    throw "State file not found: $StateFile"
  }
  return Get-Content -Raw -Path $StateFile | ConvertFrom-Json
}

function Invoke-AgentApi {
  param(
    [string]$ApiUrl,
    [hashtable]$Payload
  )
  return Invoke-RestMethod -Method Post -Uri $ApiUrl -ContentType "application/json" -Body ($Payload | ConvertTo-Json -Depth 8)
}

function Append-Ndjson {
  param([hashtable]$Payload)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SignalLogPath) | Out-Null
  ($Payload | ConvertTo-Json -Depth 8 -Compress) + "`n" | Out-File -FilePath $SignalLogPath -Append -Encoding utf8
}

function Test-SafeIp {
  param([string]$Ip)
  $parsed = $null
  if (-not [System.Net.IPAddress]::TryParse($Ip, [ref]$parsed)) {
    return $false
  }
  if ([System.Net.IPAddress]::IsLoopback($parsed)) {
    return $false
  }
  $bytes = $parsed.GetAddressBytes()
  if ($bytes.Length -eq 4 -and ($bytes[0] -eq 0 -or $bytes[0] -ge 224)) {
    return $false
  }
  return $true
}

function Test-SafeProcessName {
  param([string]$Name)
  if (-not $Name -or $Name -notmatch '^[A-Za-z0-9_.-]{1,64}$') {
    return $false
  }
  return -not ($ProtectedProcessNames -contains $Name.ToLower())
}

function Test-SafePid {
  param([int]$Pid)
  if ($Pid -le 4) {
    return $false
  }
  $process = Get-Process -Id $Pid -ErrorAction SilentlyContinue
  if (-not $process) {
    return $false
  }
  return -not ($ProtectedProcessNames -contains $process.ProcessName.ToLower())
}

function Get-SignalSnapshot {
  $failedLogins = 0
  $privilegeIndicators = 0
  try {
    $failedLogins = @(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-2)} -ErrorAction SilentlyContinue).Count
    $privilegeIndicators = @(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4672; StartTime=(Get-Date).AddHours(-2)} -ErrorAction SilentlyContinue).Count
  } catch {}

  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  $suspicious = @()
  $archiveHits = 0
  $evasionIndicators = 0
  foreach ($proc in $processes) {
    $text = "$($proc.Name) $($proc.CommandLine)".ToLower()
    if ($text -match 'nmap|rclone|7z|rar|powershell|cmd.exe /c') {
      $suspicious += $text.Substring(0, [Math]::Min($text.Length, 120))
    }
    if ($text -match '7z|rar|zip|rclone|scp') {
      $archiveHits += 1
    }
    if ($text -match 'wevtutil cl|vssadmin|defender|netsh advfirewall') {
      $evasionIndicators += 1
    }
  }

  $remoteHits = 0
  $externalDestinations = New-Object System.Collections.Generic.HashSet[string]
  $connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue
  foreach ($conn in $connections) {
    if ($conn.RemoteAddress -match '^(10\.|192\.168\.|172\.)' -and $conn.RemotePort -in 22,135,139,445,3389,5985,5986) {
      $remoteHits += 1
    } elseif ($conn.RemoteAddress -and $conn.RemoteAddress -notmatch '^(10\.|127\.|192\.168\.|172\.)') {
      [void]$externalDestinations.Add($conn.RemoteAddress)
    }
  }

  $ipValue = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
  if (-not $ipValue) { $ipValue = "127.0.0.1" }

  return @{
    collected_at = Get-UtcNow
    telemetry_version = "1.2"
    platform = "windows"
    hostname = $env:COMPUTERNAME
    source_ip = $ipValue
    failed_login_indicators = $failedLogins
    privilege_indicators = $privilegeIndicators
    defense_evasion_indicators = $evasionIndicators
    phishing_indicators = 0
    suspicious_archive_hits = $archiveHits
    internal_remote_service_hits = $remoteHits
    external_destinations = $externalDestinations.Count
    external_established_connections = @($connections | Where-Object { $_.RemoteAddress -notmatch '^(10\.|127\.|192\.168\.|172\.)' }).Count
    listening_ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue).Count
    suspicious_processes = @($suspicious | Select-Object -First 12)
    notes = @()
  }
}

function Write-SignalEvent {
  param([hashtable]$Signals)
  Append-Ndjson -Payload @{
    '@timestamp' = $Signals.collected_at
    message = "NetSentinel agent telemetry failed=$($Signals.failed_login_indicators) privilege=$($Signals.privilege_indicators) evasion=$($Signals.defense_evasion_indicators) lateral=$($Signals.internal_remote_service_hits) exfil=$($Signals.external_destinations)"
    log = @{ level = "info" }
    event = @{ dataset = "netsentinel.agent" }
    host = @{ name = $Signals.hostname }
    source = @{ ip = $Signals.source_ip }
    netsentinel = @{ agent = @{ signals = $Signals } }
  }
}

function Collect-Triage {
  New-Item -ItemType Directory -Force -Path $TriageDir | Out-Null
  $target = Join-Path $TriageDir ("triage-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + ".json")
  $payload = @{
    collected_at = Get-UtcNow
    computer = $env:COMPUTERNAME
    processes = @(Get-Process | Select-Object -First 80 Name,Id,CPU)
    services = @(Get-Service | Select-Object -First 80 Name,Status,DisplayName)
    connections = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Select-Object -First 80 LocalAddress,LocalPort,RemoteAddress,RemotePort,State)
  }
  $payload | ConvertTo-Json -Depth 6 | Out-File -FilePath $target -Encoding utf8
  return $target
}

function Invoke-LocalAction {
  param([pscustomobject]$Action)
  $result = @{
    action_id = $Action.id
    finished_at = Get-UtcNow
    success = $false
    output = ""
    error = ""
  }
  try {
    switch ($Action.type) {
      "block_ip" {
        $ip = $Action.parameters.ip
        if (-not (Test-SafeIp -Ip $ip)) {
          throw "Refusing unsafe or invalid IP value."
        }
        netsh advfirewall firewall add rule name="NetSentinel-$ip" dir=in action=block remoteip=$ip | Out-Null
        $result.success = $true
        $result.output = "Blocked $ip locally."
      }
      "unblock_ip" {
        $ip = $Action.parameters.ip
        if (-not (Test-SafeIp -Ip $ip)) {
          throw "Refusing unsafe or invalid IP value."
        }
        netsh advfirewall firewall delete rule name="NetSentinel-$ip" | Out-Null
        $result.success = $true
        $result.output = "Unblocked $ip locally."
      }
      "terminate_process_by_name" {
        $name = [string]$Action.parameters.name
        if (-not (Test-SafeProcessName -Name $name)) {
          throw "Refusing unsafe or invalid process name."
        }
        Stop-Process -Name $name -Force -ErrorAction Stop
        $result.success = $true
        $result.output = "Stopped process name $name."
      }
      "terminate_process_by_pid" {
        $pidValue = [int]$Action.parameters.pid
        if (-not (Test-SafePid -Pid $pidValue)) {
          throw "Refusing unsafe or invalid process id."
        }
        Stop-Process -Id $pidValue -Force -ErrorAction Stop
        $result.success = $true
        $result.output = "Stopped PID $pidValue."
      }
      "collect_triage" {
        $artifact = Collect-Triage
        $result.success = $true
        $result.output = $artifact
      }
      default {
        $result.error = "Unsupported action $($Action.type)."
      }
    }
  } catch {
    $result.error = $_.Exception.Message
  }
  return $result
}

$state = Load-State
$instanceId = $state.instance_id
$apiBase = ($state.api_url).TrimEnd('/')
$signals = Get-SignalSnapshot
Write-SignalEvent -Signals $signals
$heartbeat = Invoke-AgentApi -ApiUrl "$apiBase/api/agent/heartbeat" -Payload @{
  instance_id = $instanceId
  service_state = "running"
  signals = $signals
}

$pending = @($heartbeat.pending_actions)
if ($pending.Count -gt 0) {
  $results = @()
  foreach ($item in $pending) {
    $results += Invoke-LocalAction -Action $item
  }
  Append-Ndjson -Payload @{
    '@timestamp' = Get-UtcNow
    message = "NetSentinel agent applied $($results.Count) local action(s)."
    log = @{ level = "info" }
    event = @{ dataset = "netsentinel.agent.actions" }
    host = @{ name = $signals.hostname }
    source = @{ ip = $signals.source_ip }
    netsentinel = @{ agent = @{ action_results = $results } }
  }
  Invoke-AgentApi -ApiUrl "$apiBase/api/agent/heartbeat" -Payload @{
    instance_id = $instanceId
    service_state = "running"
    action_results = $results
  } | Out-Null
}
