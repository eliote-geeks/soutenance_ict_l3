# NetSentinel AI

NetSentinel AI est une plateforme de supervision securite orientee soutenance.  
Le projet sert a collecter des journaux et des flux reseau, a les centraliser dans Elasticsearch, a detecter des anomalies avec un moteur IA, puis a restituer le tout dans une interface web moderne.

Ce n'est pas juste un tableau de logs.  
Le but est de transformer des evenements techniques bruts en informations utiles :

- alertes ;
- incidents ;
- vues par machine ;
- indicateurs de risque ;
- etat de la stack ;
- recommandations de remediation.

## A quoi sert le projet

NetSentinel AI sert a :

- surveiller un reseau ou un petit parc de machines ;
- centraliser les logs systeme et reseau ;
- detecter des comportements suspects ;
- regrouper les alertes en incidents exploitables ;
- visualiser rapidement l'etat de la securite ;
- montrer une architecture defendable en soutenance.

Cas d'usage typiques :

- tentative de brute force SSH ;
- port scan ;
- activite DNS anormale ;
- comportement reseau inhabituel ;
- supervision d'hotes Linux de laboratoire ;
- presentation d'une chaine complete collecte -> analyse -> visualisation.

## Architecture du projet

Le projet est organise en 4 blocs principaux.

### 1. Frontend

Chemin :

- [frontend](/home/paul/Bureau/Projects/netsentinel-ai/frontend)

Role :

- afficher les dashboards ;
- consulter les logs ;
- voir les alertes ;
- analyser les incidents ;
- afficher les hotes et les actifs ;
- exposer les pages `SOC Overview`, `Telemetry`, `Alerts`, `Incidents`, `Hosts`, `AI Detection`, `Pipeline`.

Technos principales :

- React ;
- CRACO ;
- Tailwind ;
- composants Radix ;
- Recharts ;
- page admin `Agents` pour l'enrolement, l'approbation, le rejet et la desactivation.

Port local habituel :

- `3000`

### 2. Backend API

Chemin :

- [backend/server.py](/home/paul/Bureau/Projects/netsentinel-ai/backend/server.py)

Role :

- se connecter a Elasticsearch ;
- lire et normaliser les donnees ;
- construire les routes API du frontend ;
- regrouper les alertes en incidents ;
- exposer l'etat des assets ;
- gerer l'enrolement et l'activation des agents.

Port local habituel :

- `8010`

Endpoints utiles :

- `/api/overview`
- `/api/logs`
- `/api/alerts`
- `/api/incidents`
- `/api/hosts`
- `/api/assets`
- `/api/model`
- `/api/predictions`
- `/api/pipeline`
- `/api/health`

### 3. AI Engine

Chemin :

- [ai-engine/app.py](/home/paul/Bureau/Projects/netsentinel-ai/ai-engine/app.py)

Role :

- relire les index Elastic ;
- appliquer des heuristiques explicables ;
- appliquer une detection d'anomalies non supervisee ;
- renvoyer les findings au backend NetSentinel.

Approche :

- heuristiques ;
- `IsolationForest` ;
- `RandomForest` ;
- scoring et publication de findings.

Port local habituel :

- `9000`

Endpoint utile :

- `/health`

### 4. Agent installable

Chemin :

- [agent](/home/paul/Bureau/Projects/netsentinel-ai/agent)

Role :

- installer/configurer les Beats sur une machine ;
- enregistrer l'asset dans NetSentinel ;
- suivre le flux `install -> enroll -> approve -> active` ;
- permettre un deploiement controle sur plusieurs machines.

Scripts disponibles :

- [install-linux.sh](/home/paul/Bureau/Projects/netsentinel-ai/agent/install-linux.sh)
- [install-windows.ps1](/home/paul/Bureau/Projects/netsentinel-ai/agent/install-windows.ps1)
- [build-deb.sh](/home/paul/Bureau/Projects/netsentinel-ai/packaging/linux/build-deb.sh)
- [build-installer.ps1](/home/paul/Bureau/Projects/netsentinel-ai/packaging/windows/build-installer.ps1)

Installation one-shot depuis GitHub :

Ubuntu :

```bash
TOKEN="NSTMETOKEN"; API_URL="http://79.137.32.27:8010"; TMP_DIR="$(mktemp -d)" && curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-linux.sh" -o "$TMP_DIR/install-linux.sh" && curl -fsSL "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/ns_agent_runtime.py" -o "$TMP_DIR/ns_agent_runtime.py" && sudo bash "$TMP_DIR/install-linux.sh" --api-url "$API_URL" --enrollment-token "$TOKEN"
```

Windows PowerShell Administrateur :

```powershell
$Token = "NSTMETOKEN"; $ApiUrl = "http://79.137.32.27:8010"; $Dir = Join-Path $env:TEMP "netsentinel-agent"; New-Item -ItemType Directory -Force -Path $Dir | Out-Null; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/install-windows.ps1" -OutFile "$Dir\install-windows.ps1"; Invoke-WebRequest "https://raw.githubusercontent.com/eliote-geeks/soutenance_ict_l3/main/agent/runtime-windows.ps1" -OutFile "$Dir\runtime-windows.ps1"; powershell -ExecutionPolicy Bypass -File "$Dir\install-windows.ps1" -ApiUrl $ApiUrl -EnrollmentToken $Token
```

Remplacer `NSTMETOKEN` par le token brut cree depuis la page Agents ou l'API.

## Fonctionnement global

Le flux logique du projet est :

1. une machine produit des logs et des flux ;
2. Filebeat / Packetbeat / Metricbeat collectent les donnees ;
3. Elasticsearch stocke et indexe les evenements ;
4. le backend lit Elastic et construit des vues metier ;
5. le moteur IA lit aussi Elastic et detecte des anomalies ;
6. le frontend affiche alertes, incidents, hotes et indicateurs.

En resume :

`Collecte -> Stockage -> Analyse -> Visualisation`

## Detection IA

Le moteur IA n'est pas un chatbot.  
C'est un service d'analyse securite.

Il combine deux approches.

### Heuristiques

Exemples :

- trop d'echecs SSH dans une fenetre courte ;
- trop de ports cibles ;
- anomalies DNS ;
- signaux simples mais explicables.

Avantage :

- facile a defendre en soutenance ;
- logique claire ;
- resultat interpretable.

### Machine Learning non supervise

Modele utilise :

- `IsolationForest`

But :

- detecter des comportements anormaux sans etiquetage manuel complet ;
- completer les heuristiques par une detection d'outliers.

## Structure du projet

```text
netsentinel-ai/
├── agent/
├── ai-engine/
├── backend/
├── docs/
├── frontend/
├── tests/
└── .venv/
```

## Lancement local

Le projet peut tourner completement en local si tu as :

- Python ;
- Node.js ;
- une instance Elasticsearch accessible ;
- idealement Kibana pour debug ;
- la racine `.venv` deja presente dans le projet.

### 1. Backend

Installer les dependances si besoin :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/backend
../.venv/bin/pip install -r requirements.txt
```

Lancer :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/backend
../.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8010
```

Verification :

```bash
curl http://127.0.0.1:8010/api/health
```

### 2. AI Engine

Installer les dependances si besoin :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
../.venv/bin/pip install -r requirements.txt
```

Lancer :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 9000
```

Verification :

```bash
curl http://127.0.0.1:9000/health
```

### 3. Frontend

Installer les dependances :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/frontend
npm install
```

Lancer :

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/frontend
npm start
```

Acces :

- `http://127.0.0.1:3000`

### 4. Ports utilises

- frontend : `3000`
- backend : `8010`
- ai-engine : `9000`
- elasticsearch : souvent `9200` ou `9201`
- kibana : souvent `5601`

## Variables importantes

Backend et AI engine utilisent notamment :

- `NETSENTINEL_STORAGE_BACKEND` : `elastic`, `json` ou `demo`
- `STORAGE_JSON_PATH` : chemin du fichier de stockage si `NETSENTINEL_STORAGE_BACKEND=json`
- `NETSENTINEL_TELEMETRY_BACKEND` : `elastic`, `json` ou `demo`
- `TELEMETRY_JSON_PATH` : chemin du fichier de telemetrie si `NETSENTINEL_TELEMETRY_BACKEND=json`
- `ELASTICSEARCH_URL`
- `ELASTICSEARCH_USERNAME`
- `ELASTICSEARCH_PASSWORD`
- `ELASTICSEARCH_API_KEY`
- `ELASTICSEARCH_VERIFY_TLS`

Le stockage applicatif du backend est maintenant configurable par environnement :

- `elastic` : profils, assets, agents et findings sont stockes dans Elasticsearch ;
- `json` : profils, assets, agents et findings sont stockes localement dans un fichier JSON ;
- `demo` : lecture des donnees de demonstration, sans persistance.

La telemetrie securite est aussi configurable par environnement :

- `elastic` : lit les index Beats (`filebeat-*`, `packetbeat-*`, `metricbeat-*`) ;
- `json` : lit un fichier JSON contenant `logs`, `packet_events`, `metric_hosts`, `ai_alerts`, et optionnellement `traffic` ;
- `demo` : laisse l'application retomber sur les jeux de donnees de demonstration.

Pour PostgreSQL ou une autre base, l'interface est maintenant isolee dans `backend/ns_telemetry.py`.

AI engine :

- `NETSENTINEL_BACKEND_URL`

Backend :

- `NETSENTINEL_API_URL`

Agent / admin :

- secret admin pour les endpoints d'enrolement
- `AGENT_ELASTIC_API_KEY`
- `ALLOW_AGENT_BASIC_AUTH`

## Deploiement

Le principe de deploiement le plus simple est :

1. backend FastAPI en service systemd ;
2. ai-engine FastAPI en service systemd ;
3. frontend React servi soit :
   - en dev server ;
   - soit mieux avec un `build` statique + Nginx ;
4. Elasticsearch et Kibana accessibles au backend et au moteur IA ;
5. Beats ou agents configures sur les machines a surveiller.

Pour un guide detaille, voir :

- [GUIDE_DEPLOIEMENT_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/GUIDE_DEPLOIEMENT_NETSENTINEL.md)

## Flux agent

Le flux d'agent mis en place est :

`install -> enroll -> approve -> active`

Principes :

- l'agent peut etre distribue ;
- il ne collecte rien tant qu'il n'est pas approuve ;
- l'activation est controlee cote serveur ;
- l'etat agent est visible dans l'application ;
- l'admin peut approuver, rejeter ou desactiver un agent depuis le dashboard.

Documentation :

- [agent/README.md](/home/paul/Bureau/Projects/netsentinel-ai/agent/README.md)

## Ce qu'il faut expliquer en soutenance

Les points forts a presenter sont :

- architecture modulaire ;
- centralisation Elastic ;
- separation backend / IA / frontend ;
- detection hybride heuristique + ML ;
- visualisation orientee SOC ;
- agent de collecte installable ;
- capacite a filtrer par machine / asset / profil ;
- projet defendable et concret.

## Etat local actuel

Le projet existe bien localement ici :

- [netsentinel-ai](/home/paul/Bureau/Projects/netsentinel-ai)

Et il est aussi pousse sur GitHub :

- `git@github.com:eliote-geeks/soutenance_ict_l3.git`

## Documentation supplementaire

Le dossier `docs/` est reserve a la documentation NetSentinel.  
Les anciens documents sans lien direct avec le projet ont ete retires.

- [GUIDE_DEPLOIEMENT_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/GUIDE_DEPLOIEMENT_NETSENTINEL.md)
- [PRESENTATION_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/PRESENTATION_NETSENTINEL.md)
- [GUIDE_SOUTENANCE_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/GUIDE_SOUTENANCE_NETSENTINEL.md)
- [DEMO_AGENT_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/DEMO_AGENT_NETSENTINEL.md)
- [RAPPORT_AVANCEMENT_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/RAPPORT_AVANCEMENT_NETSENTINEL.md)
