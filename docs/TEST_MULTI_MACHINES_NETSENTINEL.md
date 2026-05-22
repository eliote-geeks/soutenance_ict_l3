# Test Multi-Machines NetSentinel

Objectif : verifier que plusieurs machines Windows/Ubuntu remontent leurs logs, leurs signaux agent et des anomalies detectables.

## 1. Preparer le backend

Variables minimales :

```bash
export NETSENTINEL_STORAGE_BACKEND=json
export NETSENTINEL_TELEMETRY_BACKEND=elastic
export ADMIN_API_SECRET='CHANGE_ME_STRONG_SECRET'
export NETSENTINEL_API_URL='http://IP_DU_SERVEUR:8010'
export AGENT_ELASTIC_API_KEY='API_KEY_ELASTIC_LIMITEE_AUX_BEATS'
```

Si le stockage applicatif doit aller dans PostgreSQL :

```bash
export NETSENTINEL_STORAGE_BACKEND=postgresql
export DATABASE_URL='postgresql://netsentinel:CHANGE_ME@127.0.0.1:5432/netsentinel'
```

## 2. Rafraichir le dictionnaire d'attaques

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
PYTHONPATH=. ../.venv/bin/python refresh_attack_dictionary.py
curl http://127.0.0.1:9000/attack-knowledge-base
```

La base combine MITRE ATT&CK officiel et les profils d'apprentissage NetSentinel : brute force SSH, DNS C2, scan de ports, privilege escalation, defense evasion, lateral movement, exfiltration et phishing.

## 3. Enroler chaque machine

Depuis le dashboard `Agents`, creer un token par machine.

Ubuntu/Debian :

```bash
export API_URL='http://IP_DU_SERVEUR:8010'
export TOKEN='TOKEN_D_ENROLEMENT'
curl -fsSL https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-linux.sh -o /tmp/install-linux.sh
curl -fsSL https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/ns_agent_runtime.py -o /tmp/ns_agent_runtime.py
sudo bash /tmp/install-linux.sh --api-url "$API_URL" --enrollment-token "$TOKEN"
```

Windows PowerShell admin :

```powershell
$ApiUrl = "http://IP_DU_SERVEUR:8010"
$Token = "TOKEN_D_ENROLEMENT"
iwr https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-windows.ps1 -OutFile $env:TEMP\install-windows.ps1
iwr https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/runtime-windows.ps1 -OutFile $env:TEMP\runtime-windows.ps1
powershell -ExecutionPolicy Bypass -File $env:TEMP\install-windows.ps1 -ApiUrl $ApiUrl -EnrollmentToken $Token
```

Approuver ensuite chaque machine dans `Agents`, puis relancer avec `--resume` ou `-Resume` si l'installateur est en attente.

## 4. Generer des signaux de test controles

Ubuntu :

```bash
for i in $(seq 1 12); do ssh invalid_user@127.0.0.1 true || true; done
for port in 21 22 25 53 80 110 143 443 445 3389 5432 8080 9200; do timeout 1 bash -c "</dev/tcp/127.0.0.1/$port" 2>/dev/null || true; done
dig @8.8.8.8 "missing-$RANDOM.example.invalid" || true
sudo systemctl restart netsentinel-agent-runtime
```

Windows PowerShell admin :

```powershell
1..12 | ForEach-Object { cmd /c "net use \\127.0.0.1\IPC$ wrong /user:baduser" 2>$null }
21,22,25,53,80,110,143,443,445,3389,5985,9200 | ForEach-Object { Test-NetConnection 127.0.0.1 -Port $_ -InformationLevel Quiet }
Restart-ScheduledTask -TaskName "NetSentinel Agent Runtime"
```

Ces commandes ne doivent etre lancees que dans un lab autorise.

## 5. Verifier la detection

```bash
curl http://127.0.0.1:8010/api/agent/instances
curl http://127.0.0.1:8010/api/logs
curl http://127.0.0.1:8010/api/alerts
curl -X POST http://127.0.0.1:9000/run-once
curl http://127.0.0.1:8010/api/ai/attack-knowledge-base
```

Dans l'interface, verifier :

- `Agents` : chaque machine passe `approved` puis `active` ;
- `Logs` : les journaux Filebeat/Winlogbeat apparaissent ;
- `Alerts` : les findings IA sont publies avec tactique et techniques MITRE ;
- `Model` : le dictionnaire d'attaques est charge et les seuils sont visibles ;
- `Incidents` : les alertes similaires sont regroupees.

## 6. Critere de reussite

Le test est valide si au moins deux machines differentes remontent des heartbeats, des logs, puis au moins une anomalie correlee par MITRE ATT&CK.
