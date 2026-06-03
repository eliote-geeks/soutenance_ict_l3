#!/usr/bin/env bash
set -euo pipefail

ELASTIC_URL=""
USERNAME=""
PASSWORD=""
API_KEY=""
ELASTIC_VERIFY_TLS="true"
ALLOW_BASIC_AUTH="${NETSENTINEL_ALLOW_BASIC_AUTH:-false}"
FILEBEAT_INDEX="filebeat-*"
PACKETBEAT_INDEX="packetbeat-*"
METRICBEAT_INDEX=".ds-metricbeat-*"
API_URL=""
ENROLLMENT_TOKEN=""
SITE="default-site"
ROLE="workstation"
ENVIRONMENT="prod"
PROFILE_ID=""
ASSET_ID=""
RESUME_ONLY="false"
UNINSTALL_ONLY="false"
UPGRADE_ONLY="false"
POLL_INTERVAL_SECONDS=5
APPROVAL_TIMEOUT_SECONDS=300
AGENT_NAME="NetSentinel Agent"
AGENT_VERSION="1.2.0"

STATE_DIR="/etc/netsentinel-agent"
STATE_FILE="$STATE_DIR/agent.json"
RUNTIME_INSTALL_DIR="/opt/netsentinel-agent"
RUNTIME_SCRIPT_PATH="$RUNTIME_INSTALL_DIR/ns_agent_runtime.py"
RUNTIME_SERVICE_PATH="/etc/systemd/system/netsentinel-agent-runtime.service"
SIGNAL_LOG_DIR="/var/log/netsentinel-agent"
SIGNAL_LOG_PATH="$SIGNAL_LOG_DIR/signals.ndjson"
TRIAGE_DIR="$SIGNAL_LOG_DIR/triage"
BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARE_DIR="/usr/share/netsentinel-agent"
RUNTIME_SOURCE_PATH="$BUNDLE_DIR/ns_agent_runtime.py"
if [[ ! -f "$RUNTIME_SOURCE_PATH" ]]; then
  RUNTIME_SOURCE_PATH="$SHARE_DIR/ns_agent_runtime.py"
fi
RUNTIME_HEARTBEAT_INTERVAL_SECONDS=300
BEAT_SERVICES=(filebeat packetbeat metricbeat)

umask 077

while [[ $# -gt 0 ]]; do
  case "$1" in
    --elastic-url) ELASTIC_URL="$2"; shift 2 ;;
    --username) USERNAME="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --elastic-verify-tls) ELASTIC_VERIFY_TLS="$2"; shift 2 ;;
    --filebeat-index) FILEBEAT_INDEX="$2"; shift 2 ;;
    --packetbeat-index) PACKETBEAT_INDEX="$2"; shift 2 ;;
    --metricbeat-index) METRICBEAT_INDEX="$2"; shift 2 ;;
    --api-url) API_URL="${2%/}"; shift 2 ;;
    --enrollment-token) ENROLLMENT_TOKEN="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --profile-id) PROFILE_ID="$2"; shift 2 ;;
    --asset-id) ASSET_ID="$2"; shift 2 ;;
    --resume) RESUME_ONLY="true"; shift 1 ;;
    --upgrade) UPGRADE_ONLY="true"; shift 1 ;;
    --uninstall) UNINSTALL_ONLY="true"; shift 1 ;;
    --poll-interval) POLL_INTERVAL_SECONDS="$2"; shift 2 ;;
    --approval-timeout) APPROVAL_TIMEOUT_SECONDS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

HOSTNAME_VALUE="$(hostname)"
IP_VALUE="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "$IP_VALUE" ]]; then
  IP_VALUE="127.0.0.1"
fi

OS_VALUE="Linux"
if [[ -r /etc/os-release ]]; then
  OS_VALUE="$(. /etc/os-release && echo "${PRETTY_NAME:-${NAME:-Linux}}")"
fi

ASSET_ID="${ASSET_ID:-$HOSTNAME_VALUE}"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "$AGENT_NAME must be run as root." >&2
    exit 1
  fi
}

require_command() {
  local command="$1"
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
}

validate_url() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "$name is required." >&2
    exit 1
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "$name must start with http:// or https://." >&2
    exit 1
  fi
}

check_http_reachable() {
  local name="$1"
  local url="$2"
  if ! curl -fsS --connect-timeout 5 --max-time 10 "$url" >/dev/null; then
    echo "Unable to reach $name at $url" >&2
    exit 1
  fi
}

validate_elastic_credentials() {
  if [[ -n "$API_KEY" ]]; then
    return
  fi
  if [[ -n "$USERNAME" && -n "$PASSWORD" && "$ALLOW_BASIC_AUTH" == "true" ]]; then
    return
  fi
  echo "Elastic API key is required. Basic auth is blocked unless NETSENTINEL_ALLOW_BASIC_AUTH=true." >&2
  exit 1
}

preflight_common() {
  require_root
  require_command curl
  require_command python3
  require_command systemctl
  require_command apt-get
  if [[ ! -d /run/systemd/system ]]; then
    echo "systemd is required for the NetSentinel runtime service." >&2
    exit 1
  fi
}

preflight_api_mode() {
  validate_url "--api-url" "$API_URL"
  check_http_reachable "NetSentinel API" "$API_URL/health"
}

preflight_direct_mode() {
  validate_url "--elastic-url" "$ELASTIC_URL"
  validate_elastic_credentials
}

secure_paths() {
  mkdir -p "$STATE_DIR" "$RUNTIME_INSTALL_DIR" "$SIGNAL_LOG_DIR" "$TRIAGE_DIR"
  chmod 700 "$STATE_DIR" "$RUNTIME_INSTALL_DIR" "$SIGNAL_LOG_DIR" "$TRIAGE_DIR"
}

stop_service_if_exists() {
  local service="$1"
  if systemctl list-unit-files "$service.service" >/dev/null 2>&1; then
    systemctl disable --now "$service.service" >/dev/null 2>&1 || true
  fi
}

uninstall_agent() {
  require_root
  stop_service_if_exists netsentinel-agent-runtime
  for service in "${BEAT_SERVICES[@]}"; do
    stop_service_if_exists "$service"
  done
  rm -f "$RUNTIME_SERVICE_PATH"
  systemctl daemon-reload || true
  rm -rf "$RUNTIME_INSTALL_DIR"
  rm -f /etc/filebeat/filebeat.yml /etc/packetbeat/packetbeat.yml /etc/metricbeat/metricbeat.yml
  if [[ "${NETSENTINEL_KEEP_STATE:-false}" != "true" ]]; then
    rm -rf "$STATE_DIR" "$SIGNAL_LOG_DIR"
  fi
  echo "$AGENT_NAME removed. Set NETSENTINEL_KEEP_STATE=true to keep state during uninstall."
}

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

install_beats() {
  apt-get update
  apt-get install -y curl gnupg apt-transport-https python3
  rm -f /usr/share/keyrings/elastic-keyring.gpg
  curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | gpg --dearmor -o /usr/share/keyrings/elastic-keyring.gpg
  chmod 0644 /usr/share/keyrings/elastic-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/elastic-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" > /etc/apt/sources.list.d/elastic-8.x.list
  apt-get update
  apt-get install -y filebeat packetbeat metricbeat
}

write_ssl_block() {
  if [[ "${ELASTIC_VERIFY_TLS,,}" == "false" ]]; then
    cat <<'EOF'
  ssl.verification_mode: none
EOF
  fi
}

write_output_block() {
  if [[ -n "$API_KEY" ]]; then
    cat <<EOF
output.elasticsearch:
  hosts: ["$ELASTIC_URL"]
  api_key: "$API_KEY"
$(write_ssl_block)
EOF
  else
    cat <<EOF
output.elasticsearch:
  hosts: ["$ELASTIC_URL"]
  username: "$USERNAME"
  password: "$PASSWORD"
$(write_ssl_block)
EOF
  fi
}

write_configs() {
  secure_paths
  validate_elastic_credentials
  COMMON_FIELDS=$(cat <<EOF
fields:
  site: "$SITE"
  role: "$ROLE"
  environment: "$ENVIRONMENT"
  profile_id: "$PROFILE_ID"
  asset_id: "$ASSET_ID"
fields_under_root: true
tags: ["netsentinel", "$ROLE", "$ENVIRONMENT", "linux"]
EOF
)

  cat >/etc/filebeat/filebeat.yml <<EOF
filebeat.inputs:
  - type: filestream
    id: system-logs
    enabled: true
    paths:
      - /var/log/*.log
      - /var/log/auth.log
      - /var/log/syslog
      - /var/log/fail2ban.log
  - type: filestream
    id: netsentinel-agent-signals
    enabled: true
    paths:
      - $SIGNAL_LOG_DIR/*.ndjson
    parsers:
      - ndjson:
          target: ""
$COMMON_FIELDS
$(write_output_block)
EOF

  cat >/etc/packetbeat/packetbeat.yml <<EOF
packetbeat.interfaces.device: any
packetbeat.protocols:
  - type: dns
    ports: [53]
  - type: http
    ports: [80, 8080, 8000]
  - type: tls
    ports: [443, 8443]
  - type: mysql
    ports: [3306]
  - type: pgsql
    ports: [5432]
  - type: redis
    ports: [6379]
$COMMON_FIELDS
$(write_output_block)
EOF

  cat >/etc/metricbeat/metricbeat.yml <<EOF
metricbeat.modules:
  - module: system
    metricsets: [cpu, memory, network, process, process_summary, filesystem, fsstat]
    enabled: true
    period: 10s
$COMMON_FIELDS
$(write_output_block)
EOF
  chmod 600 /etc/filebeat/filebeat.yml /etc/packetbeat/packetbeat.yml /etc/metricbeat/metricbeat.yml
}

enable_beats() {
  systemctl enable --now filebeat
  systemctl enable --now packetbeat
  systemctl enable --now metricbeat
}

install_runtime_assets() {
  secure_paths
  if [[ ! -f "$RUNTIME_SOURCE_PATH" ]]; then
    echo "Runtime source not found: $RUNTIME_SOURCE_PATH" >&2
    exit 1
  fi
  install -m 0755 "$RUNTIME_SOURCE_PATH" "$RUNTIME_SCRIPT_PATH"
}

install_runtime_service() {
  cat >"$RUNTIME_SERVICE_PATH" <<EOF
[Unit]
Description=NetSentinel Agent Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $RUNTIME_SCRIPT_PATH --state-file $STATE_FILE --signal-log $SIGNAL_LOG_PATH --triage-dir $TRIAGE_DIR
Restart=always
RestartSec=20
User=root

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now netsentinel-agent-runtime.service
}

save_state() {
  local instance_id="$1"
  local status="$2"
  python3 - "$STATE_FILE" "$instance_id" "$status" "$API_URL" "$ASSET_ID" "$PROFILE_ID" "$HOSTNAME_VALUE" "$IP_VALUE" "$OS_VALUE" "$RUNTIME_HEARTBEAT_INTERVAL_SECONDS" "$ELASTIC_VERIFY_TLS" "$FILEBEAT_INDEX" "$PACKETBEAT_INDEX" "$METRICBEAT_INDEX" <<'PY'
import json
import sys

(
    path,
    instance_id,
    status,
    api_url,
    asset_id,
    profile_id,
    hostname,
    ip_value,
    os_value,
    runtime_interval,
    elastic_verify_tls,
    filebeat_index,
    packetbeat_index,
    metricbeat_index,
) = sys.argv[1:]
payload = {
    "instance_id": instance_id,
    "status": status,
    "api_url": api_url,
    "asset_id": asset_id,
    "profile_id": profile_id,
    "hostname": hostname,
    "ip": ip_value,
    "os": os_value,
    "runtime_heartbeat_interval_seconds": int(runtime_interval or 300),
    "elastic": {
        "verify_tls": elastic_verify_tls,
        "indices": {
            "filebeat": filebeat_index,
            "packetbeat": packetbeat_index,
            "metricbeat": metricbeat_index,
        },
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
PY
  chmod 600 "$STATE_FILE"
}

load_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "State file not found: $STATE_FILE" >&2
    exit 1
  fi
  eval "$(python3 - "$STATE_FILE" <<'PY'
import json
import shlex
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

for key in ("instance_id", "status", "api_url", "asset_id", "profile_id", "hostname", "ip", "os", "runtime_heartbeat_interval_seconds"):
    value = payload.get(key, "")
    shell_key = key.upper()
    print(f"{shell_key}={shlex.quote(str(value))}")
elastic = payload.get("elastic") or {}
indices = elastic.get("indices") or {}
extra = {
    "ELASTIC_VERIFY_TLS": elastic.get("verify_tls", ""),
    "FILEBEAT_INDEX": indices.get("filebeat", ""),
    "PACKETBEAT_INDEX": indices.get("packetbeat", ""),
    "METRICBEAT_INDEX": indices.get("metricbeat", ""),
}
for key, value in extra.items():
    if value != "":
        print(f"{key}={shlex.quote(str(value))}")
PY
)"
}

json_post() {
  local url="$1"
  local payload="$2"
  curl -fsS \
    -H "Content-Type: application/json" \
    -X POST \
    "$url" \
    --data "$payload"
}

parse_checkin_response() {
  local response="$1"
  eval "$(python3 -c '
import json
import shlex
import sys

data = json.loads(sys.argv[1])
instance = data.get("instance") or {}
activation = data.get("activation") or {}
asset = activation.get("asset") or {}
elastic = activation.get("elastic") or {}
runtime = activation.get("runtime") or {}

fields = {
    "CHECKIN_STATUS": instance.get("status", ""),
    "CHECKIN_INSTANCE_ID": instance.get("id", ""),
    "ACTIVATION_ELASTIC_URL": elastic.get("url", ""),
    "ACTIVATION_API_KEY": elastic.get("api_key", ""),
    "ACTIVATION_USERNAME": elastic.get("username", ""),
    "ACTIVATION_PASSWORD": elastic.get("password", ""),
    "ACTIVATION_AUTH_MODE": elastic.get("auth_mode", ""),
    "ACTIVATION_ALLOW_BASIC_AUTH": str(elastic.get("allow_basic_auth", False)).lower(),
    "ACTIVATION_ELASTIC_VERIFY_TLS": str(elastic.get("verify_tls", True)).lower(),
    "ACTIVATION_FILEBEAT_INDEX": (elastic.get("indices") or {}).get("filebeat", ""),
    "ACTIVATION_PACKETBEAT_INDEX": (elastic.get("indices") or {}).get("packetbeat", ""),
    "ACTIVATION_METRICBEAT_INDEX": (elastic.get("indices") or {}).get("metricbeat", ""),
    "ACTIVATION_SITE": asset.get("site", ""),
    "ACTIVATION_ROLE": asset.get("role", ""),
    "ACTIVATION_ENVIRONMENT": asset.get("environment", ""),
    "ACTIVATION_PROFILE_ID": asset.get("profile_id", ""),
    "ACTIVATION_ASSET_ID": asset.get("id", ""),
    "ACTIVATION_HOSTNAME": asset.get("hostname", ""),
    "ACTIVATION_IP": asset.get("ip", ""),
    "ACTIVATION_OS": asset.get("os", ""),
    "RUNTIME_HEARTBEAT_INTERVAL_SECONDS": runtime.get("heartbeat_interval_seconds", 300),
}
for key, value in fields.items():
    print(f"{key}={shlex.quote(str(value or ""))}")
' "$response")"
}

apply_activation() {
  ELASTIC_URL="$ACTIVATION_ELASTIC_URL"
  API_KEY="$ACTIVATION_API_KEY"
  USERNAME="$ACTIVATION_USERNAME"
  PASSWORD="$ACTIVATION_PASSWORD"
  if [[ "$ACTIVATION_AUTH_MODE" == "basic" && "$ACTIVATION_ALLOW_BASIC_AUTH" == "true" ]]; then
    ALLOW_BASIC_AUTH="true"
  fi
  ELASTIC_VERIFY_TLS="${ACTIVATION_ELASTIC_VERIFY_TLS:-$ELASTIC_VERIFY_TLS}"
  FILEBEAT_INDEX="${ACTIVATION_FILEBEAT_INDEX:-$FILEBEAT_INDEX}"
  PACKETBEAT_INDEX="${ACTIVATION_PACKETBEAT_INDEX:-$PACKETBEAT_INDEX}"
  METRICBEAT_INDEX="${ACTIVATION_METRICBEAT_INDEX:-$METRICBEAT_INDEX}"
  SITE="${ACTIVATION_SITE:-$SITE}"
  ROLE="${ACTIVATION_ROLE:-$ROLE}"
  ENVIRONMENT="${ACTIVATION_ENVIRONMENT:-$ENVIRONMENT}"
  PROFILE_ID="${ACTIVATION_PROFILE_ID:-$PROFILE_ID}"
  ASSET_ID="${ACTIVATION_ASSET_ID:-$ASSET_ID}"
  HOSTNAME_VALUE="${ACTIVATION_HOSTNAME:-$HOSTNAME_VALUE}"
  IP_VALUE="${ACTIVATION_IP:-$IP_VALUE}"
  OS_VALUE="${ACTIVATION_OS:-$OS_VALUE}"
  RUNTIME_HEARTBEAT_INTERVAL_SECONDS="${RUNTIME_HEARTBEAT_INTERVAL_SECONDS:-300}"

  if [[ -z "$ELASTIC_URL" ]]; then
    echo "Activation payload missing elastic URL." >&2
    exit 1
  fi
  validate_elastic_credentials
  write_configs
  enable_beats
  install_runtime_assets

  local finalize_payload
  finalize_payload=$(cat <<EOF
{"instance_id":"$INSTANCE_ID","hostname":"$HOSTNAME_VALUE","ip":"$IP_VALUE","os":"$OS_VALUE","activation_applied":true,"capabilities":{"platform":"linux","actions":["block_ip","unblock_ip","terminate_process_by_name","terminate_process_by_pid","collect_triage"],"telemetry":["failed_login_indicators","privilege_indicators","defense_evasion_indicators","phishing_indicators","suspicious_archive_hits","internal_remote_service_hits","external_destinations","external_established_connections","listening_ports"]}}
EOF
)
  local finalize_response
  finalize_response="$(json_post "$API_URL/api/agent/checkin" "$finalize_payload")"
  parse_checkin_response "$finalize_response"
  save_state "$INSTANCE_ID" "${CHECKIN_STATUS:-active}"
  install_runtime_service
  json_post "$API_URL/api/agent/heartbeat" "{\"instance_id\":\"$INSTANCE_ID\",\"service_state\":\"running\"}" >/dev/null || true
  echo "$AGENT_NAME $AGENT_VERSION active for asset '$ASSET_ID' on '$HOSTNAME_VALUE'"
}

wait_for_approval() {
  local deadline=$(( $(date +%s) + APPROVAL_TIMEOUT_SECONDS ))
  while [[ $(date +%s) -lt $deadline ]]; do
    local payload response
    payload=$(cat <<EOF
{"instance_id":"$INSTANCE_ID","hostname":"$HOSTNAME_VALUE","ip":"$IP_VALUE","os":"$OS_VALUE","activation_applied":false}
EOF
)
    response="$(json_post "$API_URL/api/agent/checkin" "$payload")"
    parse_checkin_response "$response"
    save_state "$INSTANCE_ID" "${CHECKIN_STATUS:-pending_approval}"
    if [[ "${CHECKIN_STATUS:-}" == "approved" || "${CHECKIN_STATUS:-}" == "active" ]]; then
      apply_activation
      return 0
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done
  echo "$AGENT_NAME is pending approval. Re-run this script with --resume after admin approval." >&2
}

resume_enrollment() {
  load_state
  if [[ -z "${INSTANCE_ID:-}" || -z "${API_URL:-}" ]]; then
    echo "Saved state is incomplete." >&2
    exit 1
  fi
  wait_for_approval
}

upgrade_agent() {
  load_state
  if [[ -z "${INSTANCE_ID:-}" || -z "${API_URL:-}" ]]; then
    echo "Saved state is incomplete." >&2
    exit 1
  fi
  preflight_api_mode
  stop_service_if_exists netsentinel-agent-runtime
  install_beats
  wait_for_approval
}

enroll_agent() {
  if [[ -z "$API_URL" || -z "$ENROLLMENT_TOKEN" ]]; then
    echo "--api-url and --enrollment-token are required for enrollment mode." >&2
    exit 1
  fi
  local payload response
  payload=$(cat <<EOF
{"token":"$ENROLLMENT_TOKEN","hostname":"$HOSTNAME_VALUE","ip":"$IP_VALUE","os":"$OS_VALUE","agent_version":"$AGENT_VERSION"}
EOF
)
  response="$(json_post "$API_URL/api/agent/enroll" "$payload")"
  INSTANCE_ID="$(python3 -c 'import json,sys; data=json.loads(sys.argv[1]); print((data.get("instance") or {}).get("id", ""))' "$response")"
  if [[ -z "$INSTANCE_ID" ]]; then
    echo "Enrollment failed: missing instance id." >&2
    exit 1
  fi
  save_state "$INSTANCE_ID" "pending_approval"
  echo "Enrollment request submitted as instance '$INSTANCE_ID'. Waiting for approval..."
  wait_for_approval
}

direct_install() {
  if [[ -z "$ELASTIC_URL" ]]; then
    echo "--elastic-url is required in direct mode." >&2
    exit 1
  fi
  write_configs
  enable_beats
  echo "$AGENT_NAME $AGENT_VERSION installed directly for asset '$ASSET_ID' on '$HOSTNAME_VALUE'"
}

if [[ "$UNINSTALL_ONLY" == "true" ]]; then
  uninstall_agent
elif [[ "$UPGRADE_ONLY" == "true" ]]; then
  preflight_common
  upgrade_agent
elif [[ "$RESUME_ONLY" == "true" ]]; then
  preflight_common
  resume_enrollment
elif [[ -n "$ENROLLMENT_TOKEN" ]]; then
  preflight_common
  preflight_api_mode
  install_beats
  enroll_agent
else
  preflight_common
  preflight_direct_mode
  install_beats
  direct_install
fi
