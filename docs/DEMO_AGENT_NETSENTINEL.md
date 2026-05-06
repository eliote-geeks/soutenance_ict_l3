# Demonstration Agent NetSentinel

## Objectif de la demo

Montrer proprement le flux :

`create token -> install -> enroll -> approve -> active -> heartbeat visible`

## Pre requis

- backend NetSentinel lance ;
- frontend NetSentinel lance ;
- Elasticsearch accessible ;
- un compte admin connecte a l'interface ;
- une machine Linux ou Windows de demonstration.

## Etapes de demonstration

### 1. Creer un token depuis le dashboard

Dans la page `Agents` :

- ouvrir `Create token` ;
- choisir l'asset cible ;
- definir `site`, `role`, `environment` ;
- creer le token ;
- copier le `raw token`.

Resultat attendu :

- un token apparait dans l'interface ;
- le token est associe a un asset ;
- sa date d'expiration est visible.

### 2. Installer l'agent sur la machine

#### Linux

```bash
sudo bash install-linux.sh \
  --api-url http://IP_DU_BACKEND:8010 \
  --enrollment-token TOKEN_COPIE
```

#### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 `
  -ApiUrl "http://IP_DU_BACKEND:8010" `
  -EnrollmentToken "TOKEN_COPIE"
```

Resultat attendu :

- la machine contacte le backend ;
- une instance apparait avec le statut `pending_approval`.

### 3. Voir la machine dans la file d'attente

Dans le dashboard `Agents` :

- verifier que la machine apparait dans `Approval queue` ;
- verifier le `hostname`, l'IP, l'OS et la version agent.

### 4. Approuver la machine

Dans `Approval queue` :

- cliquer `Approve`.

Resultat attendu :

- le statut passe a `approved` puis `active` quand l'activation est appliquee ;
- l'asset apparait comme machine suivie ;
- l'instance remonte un heartbeat.

### 5. Montrer le heartbeat et l'etat

Dans `Agent instances` :

- verifier `status` ;
- verifier `service_state` ;
- verifier `last seen`.

Resultat attendu :

- `active`
- `running`
- un `last seen` recent

### 6. Montrer la desactivation

Depuis `Agent instances` :

- cliquer `Disable`.

Resultat attendu :

- le statut passe a `inactive` ;
- l'asset reste visible mais l'agent n'est plus considere actif.

## Ce qu'il faut dire pendant la soutenance

- l'agent n'est pas auto-active par simple installation ;
- il faut un token d'enrolement ;
- une validation admin est obligatoire ;
- l'activation est controlee par le backend ;
- la machine ne recoit qu'une credential agent dediee ;
- le dashboard permet de suivre et controler le cycle de vie.

## Points de verification avant passage

- la page `Agents` charge bien ;
- le secret admin frontend est correct ;
- `AGENT_ELASTIC_API_KEY` est configure cote backend ;
- la machine de demo a acces au backend ;
- Linux ou Windows testee au moins une fois avant la soutenance.
