# Guide de test - Ajout et enrolement d'un agent NetSentinel

## 1. Objectif

Ce guide explique comment ajouter une machine dans NetSentinel, creer un token d'enrolement, installer/enroler l'agent, approuver l'instance et verifier que les donnees remontent.

Flux a demontrer :

```text
Creer token -> installer agent -> enroll -> approuver -> activation -> heartbeat -> verification dashboard
```

## 2. Pre requis

- Frontend NetSentinel : `http://79.137.32.27:3000`
- Backend API : `http://79.137.32.27:8010`
- Secret admin backend : `1234`
- Un compte admin interface : `admin@uy1.local` / `admin123`
- Une machine Linux ou Windows a rattacher au projet

Verifier l'etat de l'API :

```bash
curl http://79.137.32.27:3000/api/health
```

Le resultat attendu contient :

```json
{"status":"ok"}
```

## 3. Methode interface web

1. Ouvrir `http://79.137.32.27:3000`.
2. Se connecter avec `admin@uy1.local` / `admin123`.
3. Aller dans `Assets / Hosts` et verifier que l'asset cible existe.
4. Aller dans `Agents`.
5. Quand la session administrateur est demandee, saisir `1234`.
6. Cliquer sur la creation de token.
7. Choisir l'asset cible.
8. Renseigner :
   - `site` : `yaounde-lab`
   - `role` : `workstation`
   - `environment` : `lab`
   - expiration : `30` minutes
   - usage unique : active
9. Copier le token brut affiche.

Resultat attendu :

- le token apparait dans la liste ;
- il est associe a un asset ;
- son statut est actif tant qu'il n'est pas utilise.

## 4. Installer et enroler l'agent

Les scripts d'installation peuvent etre telecharges directement depuis le serveur NetSentinel. C'est la methode recommandee pour la soutenance, car elle utilise exactement la version de l'agent exposee par le backend deploye.

### Linux

Sur la machine a surveiller :

```bash
TOKEN="COLLER_LE_TOKEN_ICI"
API_URL="http://79.137.32.27:3000"
TMP_DIR="$(mktemp -d)"

curl -fsSL "$API_URL/api/agent/installers/source/install-linux.sh" -o "$TMP_DIR/install-linux.sh"
curl -fsSL "$API_URL/api/agent/installers/source/ns_agent_runtime.py" -o "$TMP_DIR/ns_agent_runtime.py"

sudo bash "$TMP_DIR/install-linux.sh" \
  --api-url "$API_URL" \
  --enrollment-token "$TOKEN"
```

### Windows

Dans PowerShell administrateur :

```powershell
$Token = "COLLER_LE_TOKEN_ICI"
$ApiUrl = "http://79.137.32.27:3000"
$Dir = Join-Path $env:TEMP "netsentinel-agent"

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Invoke-WebRequest "$ApiUrl/api/agent/installers/source/install-windows.ps1" -OutFile "$Dir\install-windows.ps1"
Invoke-WebRequest "$ApiUrl/api/agent/installers/source/runtime-windows.ps1" -OutFile "$Dir\runtime-windows.ps1"

powershell -ExecutionPolicy Bypass -File "$Dir\install-windows.ps1" `
  -ApiUrl $ApiUrl `
  -EnrollmentToken $Token
```

Resultat attendu :

- l'agent contacte le backend ;
- l'instance apparait avec le statut `pending_approval`.

## 5. Approuver l'agent

Dans l'interface :

1. Aller dans `Agents`.
2. Ouvrir la file d'attente.
3. Verifier le `hostname`, l'IP, l'OS et la version agent.
4. Cliquer sur `Approve`.

Resultat attendu :

- le statut passe a `approved` ;
- apres reprise de l'agent, il passe a `active`.

Si l'agent reste en attente d'activation, relancer :

Linux :

```bash
sudo bash install-linux.sh --resume
```

Windows :

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Resume
```

## 6. Verification dans NetSentinel

Verifier dans l'interface :

- `Agents` : statut `active`, `service_state` a `running`, `last seen` recent ;
- `Assets / Hosts` : l'asset affiche un statut agent actif ;
- `Stack Health` : backend, moteur IA et collecteurs visibles ;
- `Elastic Logs` : les logs continuent de remonter ;
- `Alerts` : les alertes IA et reseau restent visibles.

Verification API :

```bash
curl http://79.137.32.27:3000/api/agent/instances \
  -H 'X-Admin-Secret: 1234'
```

## 6.1 Telechargement manuel des scripts

Pour telecharger seulement les scripts sans lancer l'installation :

```bash
mkdir -p netsentinel-agent-installers
cd netsentinel-agent-installers

curl -fsSL http://79.137.32.27:3000/api/agent/installers/source/install-linux.sh -o install-linux.sh
curl -fsSL http://79.137.32.27:3000/api/agent/installers/source/ns_agent_runtime.py -o ns_agent_runtime.py
curl -fsSL http://79.137.32.27:3000/api/agent/installers/source/install-windows.ps1 -o install-windows.ps1
curl -fsSL http://79.137.32.27:3000/api/agent/installers/source/runtime-windows.ps1 -o runtime-windows.ps1

chmod +x install-linux.sh ns_agent_runtime.py
```

Verification non destructive :

```bash
bash -n install-linux.sh
python3 -m py_compile ns_agent_runtime.py
curl http://79.137.32.27:3000/api/health
```

## 7. Test API rapide sans installer un vrai agent

Ce test sert a valider le backend pendant la soutenance si aucune machine de test n'est disponible.

### 7.1 Creer un token

```bash
curl -X POST http://79.137.32.27:3000/api/agent/enrollment-tokens \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: 1234' \
  -d '{
    "asset_id": "asset_demo_agent",
    "profile_id": "profile_lab",
    "site": "yaounde-lab",
    "role": "workstation",
    "environment": "lab",
    "expires_in_minutes": 30,
    "single_use": true
  }'
```

Copier la valeur `raw_token`.

### 7.2 Enroler une instance simulee

```bash
curl -X POST http://79.137.32.27:3000/api/agent/enroll \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "RAW_TOKEN_ICI",
    "hostname": "demo-agent-01",
    "ip": "10.10.50.20",
    "os": "Ubuntu 24.04",
    "agent_version": "1.2.0"
  }'
```

Copier l'`instance.id` retourne.

### 7.3 Approuver l'instance

```bash
curl -X POST http://79.137.32.27:3000/api/agent/instances/INSTANCE_ID/approve \
  -H 'X-Admin-Secret: 1234'
```

### 7.4 Confirmer l'activation

```bash
curl -X POST http://79.137.32.27:3000/api/agent/checkin \
  -H 'Content-Type: application/json' \
  -d '{
    "instance_id": "INSTANCE_ID",
    "activation_applied": true,
    "capabilities": {
      "filebeat": true,
      "packetbeat": true,
      "metricbeat": true
    }
  }'
```

### 7.5 Envoyer un heartbeat

```bash
curl -X POST http://79.137.32.27:3000/api/agent/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{
    "instance_id": "INSTANCE_ID",
    "service_state": "running",
    "signals": {
      "failed_login_indicators": 2,
      "listening_ports": [22, 80, 443],
      "external_established_connections": 3
    }
  }'
```

Resultat attendu :

- `success: true`
- statut `active`
- `service_state: running`
- `last_seen_at` recent

## 8. Tests a cocher

- Le secret admin `1234` ouvre la session admin.
- La creation de token fonctionne.
- L'enrolement retourne `pending_approval`.
- L'approbation retourne une configuration d'activation.
- Le checkin avec `activation_applied: true` passe l'agent en `active`.
- Le heartbeat met a jour `service_state` et `last_seen_at`.
- L'agent apparait dans `Agents`.
- L'asset apparait dans `Assets / Hosts`.
- Les endpoints `/api/health`, `/api/overview`, `/api/alerts`, `/api/pipeline` repondent.
- Le frontend est en mode reel : `REACT_APP_USE_MOCK=false`.

## 9. Nettoyage apres test

Pour desactiver une instance de test :

```bash
curl -X POST http://79.137.32.27:3000/api/agent/instances/INSTANCE_ID/disable \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: 1234' \
  -d '{"reason":"Fin du test de soutenance"}'
```

Le statut attendu devient `inactive`.

## 10. Test complet realise

Un test complet de la commande d'installation a ete realise dans un environnement Docker jetable afin de ne pas casser l'agent deja installe sur la machine principale.

### Methode 1 - Installation par script

Commande testee :

```bash
TOKEN="TOKEN_DE_TEST"
API_URL="http://79.137.32.27:3000"
TMP_DIR="$(mktemp -d)"

curl -fsSL "$API_URL/api/agent/installers/source/install-linux.sh" -o "$TMP_DIR/install-linux.sh"
curl -fsSL "$API_URL/api/agent/installers/source/ns_agent_runtime.py" -o "$TMP_DIR/ns_agent_runtime.py"

sudo bash "$TMP_DIR/install-linux.sh" \
  --api-url "$API_URL" \
  --enrollment-token "$TOKEN"
```

Resultats obtenus :

- les scripts ont ete telecharges depuis le serveur NetSentinel ;
- la syntaxe Bash du script Linux est valide ;
- le runtime Python compile correctement ;
- le token d'enrolement est accepte ;
- l'agent apparait en `pending_approval` ;
- apres approbation, l'agent passe en `active` ;
- le heartbeat est envoye au backend.

### Methode 2 - Suppression et nettoyage

Deux suppressions ont ete verifiees.

Suppression locale par script :

```bash
sudo bash install-linux.sh --uninstall
```

Resultat attendu :

- suppression du runtime local ;
- suppression de l'etat local de l'agent ;
- arret des services geres par le script.

Nettoyage cote backend :

```bash
curl -X POST http://79.137.32.27:3000/api/agent/instances/INSTANCE_ID/disable \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Secret: 1234' \
  -d '{"reason":"Nettoyage test installation"}'
```

Resultat obtenu :

- l'instance de test passe en `inactive` ;
- son `service_state` passe a `disabled` ;
- le conteneur de test est supprime ;
- aucun conteneur de test ne reste actif.

## 11. Conclusion des tests

Les tests valident que :

- l'application fournit bien les scripts d'installation depuis le backend ;
- la commande d'installation Linux est correcte ;
- l'enrolement fonctionne ;
- l'approbation admin fonctionne avec le secret `1234` ;
- l'activation et le heartbeat fonctionnent ;
- la suppression locale et le nettoyage backend fonctionnent.

Pendant le test, l'agent reel deja present sur le PC principal n'a pas ete supprime. Seul l'agent de test cree dans le conteneur Docker a ete installe puis nettoye.
