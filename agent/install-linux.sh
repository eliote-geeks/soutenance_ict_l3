#!/usr/bin/env bash
set -euo pipefail

ELASTIC_URL=""
USERNAME=""
PASSWORD=""
API_KEY=""
API_URL=""
ENROLLMENT_TOKEN=""
SITE="default-site"
ROLE="workstation"
ENVIRONMENT="prod"
PROFILE_ID=""
ASSET_ID=""
RESUME_ONLY="false"
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --elastic-url) ELASTIC_URL="$2"; shift 2 ;;
    --username) USERNAME="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --api-url) API_URL="${2%/}"; shift 2 ;;
    --enrollment-token) ENROLLMENT_TOKEN="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --profile-id) PROFILE_ID="$2"; shift 2 ;;
    --asset-id) ASSET_ID="$2"; shift 2 ;;
    --resume) RESUME_ONLY="true"; shift 1 ;;
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

mkdir -p "$STATE_DIR"

install_beats() {
  apt-get update
  apt-get install -y curl gnupg apt-transport-https python3
  curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | gpg --dearmor -o /usr/share/keyrings/elastic-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/elastic-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" > /etc/apt/sources.list.d/elastic-8.x.list
  apt-get update
  apt-get install -y filebeat packetbeat metricbeat
}

write_output_block() {
  if [[ -n "$API_KEY" ]]; then
    cat <<EOF
output.elasticsearch:
  hosts: ["$ELASTIC_URL"]
  api_key: "$API_KEY"
EOF
  else
    cat <<EOF
output.elasticsearch:
  hosts: ["$ELASTIC_URL"]
  username: "$USERNAME"
  password: "$PASSWORD"
EOF
  fi
}

write_configs() {
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
    ports: [80, 8080, 8000, 443]
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
}

enable_beats() {
  systemctl enable --now filebeat
  systemctl enable --now packetbeat
  systemctl enable --now metricbeat
}

install_runtime_assets() {
  mkdir -p "$RUNTIME_INSTALL_DIR" "$SIGNAL_LOG_DIR" "$TRIAGE_DIR"
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
  python3 - "$STATE_FILE" "$instance_id" "$status" "$API_URL" "$ASSET_ID" "$PROFILE_ID" "$HOSTNAME_VALUE" "$IP_VALUE" "$OS_VALUE" "$RUNTIME_HEARTBEAT_INTERVAL_SECONDS" <<'PY'
import json
import sys

path, instance_id, status, api_url, asset_id, profile_id, hostname, ip_value, os_value, runtime_interval = sys.argv[1:]
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
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
PY
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
    print(f"{key}={shlex.quote(str(value or ''))}")
' "$response")"
}

apply_activation() {
  ELASTIC_URL="$ACTIVATION_ELASTIC_URL"
  API_KEY="$ACTIVATION_API_KEY"
  USERNAME="$ACTIVATION_USERNAME"
  PASSWORD="$ACTIVATION_PASSWORD"
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

install_beats

if [[ "$RESUME_ONLY" == "true" ]]; then
  resume_enrollment
elif [[ -n "$ENROLLMENT_TOKEN" ]]; then
  enroll_agent
else
  direct_install
fi
