# NetSentinel Agent

Agent installable pour rattacher une machine a NetSentinel avec un flux controle:

`install -> enroll -> approve -> active`

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

Si l'approbation arrive plus tard, relancer simplement:

Linux:
```bash
sudo bash install-linux.sh --resume
```

Windows:
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
- stocke son etat dans `/etc/netsentinel-agent/agent.json`

Mode direct encore supporte:

```bash
sudo bash install-linux.sh \
  --elastic-url http://79.137.32.27:9201 \
  --username elastic \
  --password changeme \
  --site yaounde-lab \
  --role workstation \
  --environment lab \
  --profile-id profile_lab \
  --asset-id asset_lab_01
```

## Windows

Le script Windows supporte aussi `enroll` et `resume`, mais reste pour l'instant un bootstrap Beats:
- il ecrit les configs apres approbation
- il stocke son etat dans `C:\Program Files\NetSentinelAgent\agent.json`
- il faut encore copier les binaires Beats et installer les services Windows Elastic

Mode direct:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -ElasticUrl "http://79.137.32.27:9201" `
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

Agent:
- `POST /api/agent/enroll`
- `POST /api/agent/checkin`
- `POST /api/agent/heartbeat`

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
