# NetSentinel Agent

Bootstrap multi-OS pour enrôler une machine dans NetSentinel sans configuration manuelle complète.

Fonctions:
- installe `Filebeat`, `Packetbeat`, `Metricbeat`
- injecte les métadonnées d'inventaire:
  - `site`
  - `role`
  - `environment`
  - `profile_id`
  - `asset_id`
- pointe les agents vers Elasticsearch central

Linux:
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

Windows:
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

Les données sont ensuite distinguées dans l'app grâce à:
- `host.name`
- `host.ip`
- `site`
- `role`
- `environment`
- `profile_id`
- `asset_id`
