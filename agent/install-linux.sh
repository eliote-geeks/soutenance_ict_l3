#!/usr/bin/env bash
set -euo pipefail

ELASTIC_URL=""
USERNAME=""
PASSWORD=""
API_KEY=""
SITE="default-site"
ROLE="workstation"
ENVIRONMENT="prod"
PROFILE_ID=""
ASSET_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --elastic-url) ELASTIC_URL="$2"; shift 2 ;;
    --username) USERNAME="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --api-key) API_KEY="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --profile-id) PROFILE_ID="$2"; shift 2 ;;
    --asset-id) ASSET_ID="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ELASTIC_URL" ]]; then
  echo "--elastic-url is required" >&2
  exit 1
fi

HOSTNAME_VALUE="$(hostname)"
ASSET_ID="${ASSET_ID:-$HOSTNAME_VALUE}"

apt-get update
apt-get install -y curl gnupg apt-transport-https
curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | gpg --dearmor -o /usr/share/keyrings/elastic-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/elastic-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" > /etc/apt/sources.list.d/elastic-8.x.list
apt-get update
apt-get install -y filebeat packetbeat metricbeat

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

COMMON_FIELDS=$(cat <<EOF
fields:
  site: "$SITE"
  role: "$ROLE"
  environment: "$ENVIRONMENT"
  profile_id: "$PROFILE_ID"
  asset_id: "$ASSET_ID"
fields_under_root: true
tags: ["netsentinel", "$ROLE", "$ENVIRONMENT"]
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

systemctl enable --now filebeat
systemctl enable --now packetbeat
systemctl enable --now metricbeat

echo "NetSentinel agent installed for asset '$ASSET_ID' on '$HOSTNAME_VALUE'"
