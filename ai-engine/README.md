# NetSentinel AI Engine

Service IA externe leger pour la soutenance.

Fonctions:
- lire `filebeat-*` et `packetbeat-*` dans Elasticsearch
- detecter quelques anomalies/intrusions simples mais defendables
- combiner heuristiques + `IsolationForest` + `RandomForest`
- attacher des references `MITRE ATT&CK` aux findings
- publier les findings vers le backend NetSentinel via `/api/ai/findings`

Lancement:

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 9000
```

Execution manuelle d'un cycle:

```bash
curl -X POST http://127.0.0.1:9000/run-once
```

Refresh explicite du dictionnaire MITRE officiel:

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
PYTHONPATH=. ../.venv/bin/python refresh_attack_dictionary.py
```
