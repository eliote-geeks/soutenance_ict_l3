# Deploiement Et Guide Complet NetSentinel AI

## 1. Resume simple du projet

NetSentinel AI est une application de supervision securite reseau.

Le projet permet de :

- collecter des logs et des flux reseau ;
- stocker ces donnees dans Elasticsearch ;
- analyser les donnees avec un backend et un moteur IA ;
- afficher les alertes et incidents dans un frontend moderne ;
- rattacher des machines via un agent installable.

En une phrase :

`NetSentinel AI = collecte + analyse + detection + dashboard`

## 2. A quoi sert l'application

L'application sert a observer ce qui se passe sur un reseau ou un groupe de machines.

Elle permet de :

- voir les journaux de securite ;
- repérer des anomalies ;
- identifier des intrusions simples ;
- suivre les assets surveilles ;
- afficher des incidents plutot que de simples logs bruts ;
- montrer une architecture complete de cybersécurité en soutenance.

## 3. Blocs techniques

### Frontend

Chemin :

- `/home/paul/Bureau/Projects/netsentinel-ai/frontend`

Role :

- interface utilisateur ;
- affichage des pages SOC ;
- graphiques ;
- incidents ;
- hotes ;
- assets ;
- pipeline health.

Port local :

- `3000`

### Backend

Chemin :

- `/home/paul/Bureau/Projects/netsentinel-ai/backend/server.py`

Role :

- API principale ;
- lecture Elastic ;
- agrégation des donnees ;
- alertes ;
- incidents ;
- inventaire assets / profiles ;
- endpoints agent.

Port local :

- `8010`

### AI engine

Chemin :

- `/home/paul/Bureau/Projects/netsentinel-ai/ai-engine/app.py`

Role :

- moteur de detection ;
- heuristiques ;
- anomalies ML ;
- publication des findings.

Port local :

- `9000`

### Agent

Chemin :

- `/home/paul/Bureau/Projects/netsentinel-ai/agent`

Role :

- configurer une machine ;
- relier la machine a la plateforme ;
- pousser les metadonnees de l'asset ;
- gerer l'activation via enrolement.

## 4. Architecture globale

Flux :

1. la machine surveillee produit des logs et des flux ;
2. Filebeat, Packetbeat et Metricbeat collectent les donnees ;
3. Elasticsearch stocke les evenements ;
4. le backend lit Elastic et produit des vues metier ;
5. le moteur IA lit Elastic et detecte des anomalies ;
6. le frontend affiche le resultat.

Schema logique :

```text
Machines / Assets
   -> Beats / Agent
   -> Elasticsearch
   -> Backend NetSentinel
   -> AI Engine
   -> Frontend Dashboard
```

## 5. Ce que le backend expose

Exemples de routes utiles :

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

## 6. Ce que le moteur IA detecte

### Heuristiques

- brute force SSH ;
- scans de ports ;
- anomalies DNS ;
- comportements reseau suspects.

### Machine learning

- `IsolationForest`

Interet :

- detection d'outliers ;
- approche defendable en soutenance ;
- combinee aux regles simples.

## 7. Prerequis de deploiement

Il faut disposer de :

- Python 3 ;
- Node.js / npm ;
- Elasticsearch ;
- eventuellement Kibana ;
- acces reseau entre le backend, le moteur IA et Elastic ;
- systemd si deploiement serveur Linux.

## 8. Demarrage local

### 8.1 Backend

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/backend
../.venv/bin/pip install -r requirements.txt
../.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8010
```

Verification :

```bash
curl http://127.0.0.1:8010/api/health
```

### 8.2 AI engine

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/ai-engine
../.venv/bin/pip install -r requirements.txt
../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 9000
```

Verification :

```bash
curl http://127.0.0.1:9000/health
```

### 8.3 Frontend

```bash
cd /home/paul/Bureau/Projects/netsentinel-ai/frontend
npm install
npm start
```

Acces :

- `http://127.0.0.1:3000`

## 9. Variables d'environnement importantes

### Backend

- `ELASTICSEARCH_URL`
- `ELASTICSEARCH_USERNAME`
- `ELASTICSEARCH_PASSWORD`
- `ELASTICSEARCH_API_KEY`
- `ELASTICSEARCH_VERIFY_TLS`

### AI engine

- `ELASTICSEARCH_URL`
- `ELASTICSEARCH_USERNAME`
- `ELASTICSEARCH_PASSWORD`
- `ELASTICSEARCH_API_KEY`
- `ELASTICSEARCH_VERIFY_TLS`
- `NETSENTINEL_BACKEND_URL`

### CORS frontend/backend

Le backend accepte par defaut :

- `http://localhost:3000`
- `http://127.0.0.1:3000`

## 10. Ports habituels

- frontend : `3000`
- backend : `8010`
- ai-engine : `9000`
- elasticsearch : `9200` ou `9201`
- kibana : `5601`

## 11. Deploiement sur serveur Linux

### Etape 1 : recuperer le projet

```bash
git clone git@github.com:eliote-geeks/soutenance_ict_l3.git
cd soutenance_ict_l3
```

### Etape 2 : preparer l'environnement Python

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
pip install -r ai-engine/requirements.txt
```

### Etape 3 : builder le frontend

```bash
cd frontend
npm install
npm run build
```

Ensuite deux choix :

- servir le front en dev server ;
- ou mieux, servir `frontend/build` avec Nginx.

### Etape 4 : creer les services systemd

#### Backend

Exemple service :

```ini
[Unit]
Description=NetSentinel Backend
After=network.target

[Service]
WorkingDirectory=/opt/netsentinel/backend
Environment="ELASTICSEARCH_URL=http://127.0.0.1:9201"
ExecStart=/opt/netsentinel/.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8010
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

#### AI engine

```ini
[Unit]
Description=NetSentinel AI Engine
After=network.target

[Service]
WorkingDirectory=/opt/netsentinel/ai-engine
Environment="ELASTICSEARCH_URL=http://127.0.0.1:9201"
Environment="NETSENTINEL_BACKEND_URL=http://127.0.0.1:8010"
ExecStart=/opt/netsentinel/.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 9000
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

### Etape 5 : activer les services

```bash
sudo systemctl daemon-reload
sudo systemctl enable netsentinel-backend
sudo systemctl enable netsentinel-ai-engine
sudo systemctl start netsentinel-backend
sudo systemctl start netsentinel-ai-engine
```

### Etape 6 : verifier

```bash
curl http://127.0.0.1:8010/api/health
curl http://127.0.0.1:9000/health
```

## 12. Deploiement du frontend

### Option simple

Lancer le frontend React directement :

```bash
cd frontend
npm install
npm start
```

Inconvenient :

- mode dev ;
- plus lourd ;
- moins propre pour la prod.

### Option recommandee

Build statique + Nginx :

```bash
cd frontend
npm install
npm run build
```

Puis servir `frontend/build`.

Avantages :

- plus stable ;
- plus rapide ;
- plus propre pour une demonstration ou une mise en prod.

## 13. Agent et enrôlement

Le projet contient un vrai flux d'agent :

`install -> enroll -> approve -> active`

### Logique

- l'agent peut etre installe ;
- il ne collecte rien tant qu'il n'est pas approuve ;
- l'activation est controlee par le backend ;
- l'etat agent remonte ensuite dans l'application.

### Endpoints admin

- `POST /api/agent/enrollment-tokens`
- `GET /api/agent/enrollment-tokens`
- `POST /api/agent/enrollment-tokens/{token_id}/revoke`
- `GET /api/agent/instances`
- `POST /api/agent/instances/{instance_id}/approve`

### Endpoints agent

- `POST /api/agent/enroll`
- `POST /api/agent/checkin`
- `POST /api/agent/heartbeat`

### Scripts agent

- Linux : [install-linux.sh](/home/paul/Bureau/Projects/netsentinel-ai/agent/install-linux.sh)
- Windows : [install-windows.ps1](/home/paul/Bureau/Projects/netsentinel-ai/agent/install-windows.ps1)

## 14. A quoi faire attention

### 1. Elasticsearch

Si Elastic n'est pas accessible :

- le backend sera degrade ;
- le moteur IA aussi ;
- les dashboards afficheront peu ou pas de donnees.

### 2. Frontend

Si le frontend ne charge pas :

- verifier `npm install` ;
- verifier le port `3000` ;
- verifier que le backend est joignable.

### 3. AI engine

Si l'IA ne remonte rien :

- verifier `9000/health` ;
- verifier la connexion Elastic ;
- verifier que le backend accepte les findings.

### 4. Agent

Si l'agent est installe mais n'apparait pas actif :

- verifier le token d'enrolement ;
- verifier l'approbation admin ;
- verifier le check-in et le heartbeat.

## 15. Comment presenter le projet clairement

Presentation courte :

`NetSentinel AI est une plateforme de supervision securite qui centralise les logs et flux reseau dans Elasticsearch, applique des mecanismes de detection heuristique et d'intelligence artificielle, puis affiche les resultats dans un tableau de bord moderne.`

Ce qu'il faut mettre en avant :

- architecture modulaire ;
- collecte multi-source ;
- separation backend / IA / frontend ;
- detection hybride ;
- agent installable ;
- projet concret et defendable.

## 16. Ce qu'il faut dire si on te demande la valeur du projet

Tu peux dire :

- le projet permet de passer de donnees brutes a des decisions de securite ;
- il montre une chaine complete de cybersécurité ;
- il n'est pas limite a une theorie ou a un simple dashboard ;
- il inclut collecte, intelligence, API, interface et agent.

## 17. Emplacement local du projet

Le projet est present localement ici :

- [netsentinel-ai](/home/paul/Bureau/Projects/netsentinel-ai)

Repo GitHub :

- `git@github.com:eliote-geeks/soutenance_ict_l3.git`

## 18. Fichiers utiles

- [README.md](/home/paul/Bureau/Projects/netsentinel-ai/README.md)
- [backend/server.py](/home/paul/Bureau/Projects/netsentinel-ai/backend/server.py)
- [ai-engine/app.py](/home/paul/Bureau/Projects/netsentinel-ai/ai-engine/app.py)
- [agent/README.md](/home/paul/Bureau/Projects/netsentinel-ai/agent/README.md)
- [EXPLICATION_PROJET_NETSENTINEL.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/EXPLICATION_PROJET_NETSENTINEL.md)
- [PROCEDE_MISE_EN_PLACE_NETSENTINEL_SOUTENANCE.md](/home/paul/Bureau/Projects/netsentinel-ai/docs/PROCEDE_MISE_EN_PLACE_NETSENTINEL_SOUTENANCE.md)
