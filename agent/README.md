# NetSentinel Agent

Agent installable pour rattacher une machine a NetSentinel avec un flux controle:

`install -> enroll -> approve -> active`

Version courante :

- `1.2.0`

Le principe:
- l'agent peut etre distribue publiquement
- il ne collecte rien tant qu'il n'est pas approuve
- l'activation se fait cote NetSentinel via un token d'enrolement puis une approbation admin

## Flux

1. l'admin cree un token:

```bash
curl -X POST http://79.137.32.27:8010/api/agent/enrollment-tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: netsentinel-admin-dev-secret' \
  -d '{
    "asset_id": "asset_lab_01",
    "profile_id": "profile_lab",
    "site": "yaounde-lab",
    "role": "workstation",
    "environment": "lab",
    "expires_in_minutes": 30,
    "single_use": true
  }'
```

2. l'utilisateur installe l'agent et l'enrole:

Commande Ubuntu one-shot depuis GitHub:
```bash
TOKEN="NSTMETOKEN"; API_URL="http://79.137.32.27:8010"; TMP_DIR="$(mktemp -d)" && \
curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-linux.sh" -o "$TMP_DIR/install-linux.sh" && \
curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/ns_agent_runtime.py" -o "$TMP_DIR/ns_agent_runtime.py" && \
sudo bash "$TMP_DIR/install-linux.sh" --api-url "$API_URL" --enrollment-token "$TOKEN"
```

Commande Windows one-shot depuis GitHub, a lancer dans PowerShell Administrateur:
```powershell
$Token = "NSTMETOKEN"; $ApiUrl = "http://79.137.32.27:8010"; $Dir = Join-Path $env:TEMP "netsentinel-agent"; New-Item -ItemType Directory -Force -Path $Dir | Out-Null; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-windows.ps1" -OutFile "$Dir\install-windows.ps1"; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/runtime-windows.ps1" -OutFile "$Dir\runtime-windows.ps1"; powershell -ExecutionPolicy Bypass -File "$Dir\install-windows.ps1" -ApiUrl $ApiUrl -EnrollmentToken $Token
```

Remplacer `NSTMETOKEN` par le token brut retourne par l'API.

Linux:
```bash
sudo bash install-linux.sh \
  --api-url http://79.137.32.27:8010 \
  --enrollment-token NSTMETOKEN
```

Windows:
```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -ApiUrl "http://79.137.32.27:8010" `
  -EnrollmentToken "NSTMETOKEN"
```

3. l'instance apparait en `pending_approval`

```bash
curl http://79.137.32.27:8010/api/agent/instances \
  -H 'X-Admin-Secret: netsentinel-admin-dev-secret'
```

4. l'admin approuve l'instance:

```bash
curl -X POST http://79.137.32.27:8010/api/agent/instances/agent_xxxxx/approve \
  -H 'X-Admin-Secret: netsentinel-admin-dev-secret'
```

5. l'agent applique la configuration recue, ecrit les configs Beats, puis passe en `active`

6. apres activation, un runtime local tourne en continu :
- il remonte des signaux utiles aux heuristiques
- il ecrit des snapshots NDJSON pour Filebeat
- il recoit d'eventuelles actions locales approuvees par l'admin

Si l'approbation arrive plus tard, relancer simplement:

Ubuntu one-shot:
```bash
TMP_DIR="$(mktemp -d)" && curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-linux.sh" -o "$TMP_DIR/install-linux.sh" && curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/ns_agent_runtime.py" -o "$TMP_DIR/ns_agent_runtime.py" && sudo bash "$TMP_DIR/install-linux.sh" --resume
```

Windows one-shot:
```powershell
$Dir = Join-Path $env:TEMP "netsentinel-agent"; New-Item -ItemType Directory -Force -Path $Dir | Out-Null; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-windows.ps1" -OutFile "$Dir\install-windows.ps1"; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/runtime-windows.ps1" -OutFile "$Dir\runtime-windows.ps1"; powershell -ExecutionPolicy Bypass -File "$Dir\install-windows.ps1" -Resume
```

Linux local:
```bash
sudo bash install-linux.sh --resume
```

Windows local:
```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Resume
```

## Ce que l'activation fournit

- URL Elasticsearch
- credentials Elasticsearch limites au flux agent
- `site`
- `role`
- `environment`
- `profile_id`
- `asset_id`

## Linux

Le script Linux:
- installe `Filebeat`, `Packetbeat`, `Metricbeat`
- ecrit les fichiers de config
- active les services quand l'instance est approuvee
- lance aussi un runtime local `ns_agent_runtime.py`
- stocke son etat dans `/etc/netsentinel-agent/agent.json`
- supporte `--resume`, `--upgrade` et `--uninstall`
- verrouille les fichiers de configuration et d'etat en lecture root uniquement

Mode direct encore supporte:

```bash
sudo bash install-linux.sh \
  --elastic-url http://79.137.32.27:9200 \
  --username elastic \
  --password changeme \
  --site yaounde-lab \
  --role workstation \
  --environment lab \
  --profile-id profile_lab \
  --asset-id asset_lab_01
```

## Windows

Le script Windows est maintenant one-click :
- il telecharge automatiquement `Filebeat`, `Winlogbeat`, `Packetbeat` et `Metricbeat` ;
- `Winlogbeat` collecte les journaux Windows `Security`, `System` et `Application` ;
- il ecrit les configs apres approbation ;
- il installe les services Windows `Filebeat`, `Winlogbeat`, `Packetbeat`, `Metricbeat` ;
- il enregistre une tache planifiee de runtime local ;
- il stocke son etat dans `C:\Program Files\NetSentinelAgent\agent.json` ;
- il remonte un heartbeat avec etat `running` ou `error`.
- il supporte `-Resume`, `-Upgrade` et `-Uninstall`.

Mode direct:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -ElasticUrl "http://79.137.32.27:9200" `
  -Username "elastic" `
  -Password "changeme" `
  -Site "yaounde-lab" `
  -Role "workstation" `
  -Environment "lab" `
  -ProfileId "profile_lab" `
  -AssetId "asset_lab_01"
```

## Endpoints backend

Admin:
- `POST /api/agent/enrollment-tokens`
- `GET /api/agent/enrollment-tokens`
- `POST /api/agent/enrollment-tokens/{token_id}/revoke`
- `GET /api/agent/instances`
- `POST /api/agent/instances/{instance_id}/approve`
- `POST /api/agent/instances/{instance_id}/reject`
- `POST /api/agent/instances/{instance_id}/disable`

Agent:
- `POST /api/agent/enroll`
- `POST /api/agent/checkin`
- `POST /api/agent/heartbeat`

Actions locales:
- `POST /api/agent/instances/{instance_id}/actions`

Actions supportees:
- `block_ip`
- `unblock_ip`
- `terminate_process_by_name`
- `terminate_process_by_pid`
- `collect_triage`

## Signaux locaux remontes

Le runtime local remonte maintenant notamment :
- `failed_login_indicators`
- `privilege_indicators`
- `defense_evasion_indicators`
- `phishing_indicators`
- `suspicious_archive_hits`
- `internal_remote_service_hits`
- `external_destinations`
- `external_established_connections`
- `listening_ports`
- `suspicious_processes`

Ces signaux sont :
- envoyes au backend via `heartbeat`
- ecrits localement en `NDJSON`
- collectes par `Filebeat`
- reutilisables par les heuristiques IA et le `RandomForest`

## Etat cote application

Les assets exposes par `/api/assets` incluent maintenant:
- `agentStatus`
- `agentLastSeenAt`
- `agentInstanceId`

Ce qui permet a l'interface NetSentinel d'afficher si une machine est:
- `inactive`
- `pending_approval`
- `approved`
- `active`
- `rejected`

## Packaging

Scripts disponibles :

- Linux `.deb` :
  - [build-deb.sh](/home/paul/Bureau/Projects/netsentinel-ai/packaging/linux/build-deb.sh)
- Windows bundle / installateur :
  - [build-installer.ps1](/home/paul/Bureau/Projects/netsentinel-ai/packaging/windows/build-installer.ps1)
  - [NetSentinelAgent.iss](/home/paul/Bureau/Projects/netsentinel-ai/packaging/windows/NetSentinelAgent.iss)

## Securite

L'agent doit recevoir une credential dediee.

Recommandation :

- definir `AGENT_ELASTIC_API_KEY` cote backend ;
- ne pas reutiliser un mot de passe Elastic global ;
- n'autoriser le fallback username/password que si `ALLOW_AGENT_BASIC_AUTH=true` est explicitement active.
- cote agent, le fallback username/password est bloque sauf si `NETSENTINEL_ALLOW_BASIC_AUTH=true`.
- les actions locales refusent les IP loopback/multicast/non specifiees et les processus systeme/proteges.
