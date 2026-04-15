# Explication Du Projet NetSentinel AI

## Presentation Generale

NetSentinel AI est une plateforme de supervision de securite reseau concue comme un mini centre d'operations de securite. Son objectif est de collecter des donnees techniques reelles, de les centraliser, de les analyser avec des regles et de l'intelligence artificielle, puis de les afficher dans une interface simple a comprendre.

Le projet ne se limite pas a afficher des logs. Il essaie de transformer des evenements techniques bruts en informations de securite exploitables :

- alertes ;
- incidents ;
- vues par machine ;
- indicateurs de risque ;
- recommandations ;
- etat du pipeline de collecte et d'analyse.

En pratique, NetSentinel sert a observer ce qui se passe sur un reseau ou sur un groupe de machines, a detecter des comportements suspects, puis a aider l'utilisateur a comprendre rapidement la situation.

## Probleme Traite

Dans beaucoup d'environnements, les journaux systeme, les flux reseau et les metriques techniques sont disperses et difficiles a interpreter. Un administrateur ou un etudiant en cybersécurité peut vite se retrouver face a :

- beaucoup de logs non structures ;
- peu de correlation entre les evenements ;
- peu d'outils simples pour regrouper les anomalies ;
- et peu de visibilite globale sur les machines surveillees.

NetSentinel AI repond a ce probleme en centralisant les informations, en detectant des signaux faibles et en produisant une lecture plus metier de la situation securite.

## Objectif Principal

L'objectif principal du projet est de mettre en place une plateforme capable de :

- collecter des donnees de securite depuis une ou plusieurs machines ;
- stocker ces donnees dans Elasticsearch ;
- detecter des anomalies et intrusions de facon defendable ;
- regrouper les alertes en incidents plus lisibles ;
- afficher le tout dans une interface de supervision moderne.

## Architecture Globale

Le projet est organise en quatre couches.

### 1. Couche De Collecte

Cette couche est chargee de recuperer les donnees sur les machines surveillees.

Les composants utilises sont :

- `Filebeat` pour les logs systeme, d'authentification et applicatifs ;
- `Packetbeat` pour les flux reseau et certains protocoles ;
- `Metricbeat` pour l'etat des hôtes, l'activite CPU, memoire et systeme.

Le but est de remonter a la fois :

- ce que la machine dit ;
- ce que le reseau montre ;
- et comment la machine se comporte.

### 2. Couche De Stockage

Toutes les donnees collectees sont envoyees vers Elasticsearch.

Elasticsearch sert ici de base centrale temps reel. Les evenements y sont indexes dans des familles comme :

- `filebeat-*`
- `packetbeat-*`
- `metricbeat-*`
- `ai-alerts-*`

Kibana peut etre utilise en parallele pour inspecter les donnees brutes, mais l'application NetSentinel construit sa propre logique de lecture par-dessus Elasticsearch.

### 3. Couche D'Analyse

Deux blocs d'analyse interviennent :

- le backend NetSentinel ;
- le moteur IA separe.

Le backend lit les donnees Elastic et les transforme en objets utiles pour le front.

Le moteur IA lit aussi les donnees Elastic, detecte des anomalies, puis renvoie ses findings au backend.

### 4. Couche De Visualisation

Le frontend React affiche les resultats sous forme de pages de supervision :

- vue globale SOC ;
- logs ;
- alertes ;
- incidents ;
- hôtes ;
- flux reseau ;
- vue du modele IA ;
- previsions ;
- etat de la stack.

## Fonctionnement Detaille

Le fonctionnement general est le suivant :

1. les machines surveillees produisent des logs, des flux et des metriques ;
2. les Beats envoient ces donnees vers Elasticsearch ;
3. le moteur IA relit ces donnees sur une fenetre recente ;
4. il detecte des cas suspects ;
5. le backend agrege les resultats et fabrique des vues metier ;
6. le frontend affiche l'etat du reseau et les incidents detectes.

Le projet suit donc la chaine :

`Collecte -> Stockage -> Analyse -> Restitution`

## Le Backend NetSentinel

Le backend principal se trouve dans :

- `backend/server.py`

Il a plusieurs responsabilites :

- se connecter a Elasticsearch ;
- lire les evenements bruts ;
- normaliser les donnees ;
- produire les routes d'API ;
- regrouper les alertes en incidents ;
- calculer des indicateurs ;
- gerer l'inventaire logique des machines et profils.

Exemples de routes exposees :

- `/api/overview`
- `/api/logs`
- `/api/alerts`
- `/api/incidents`
- `/api/hosts`
- `/api/model`
- `/api/predictions`
- `/api/pipeline`

Le backend joue donc le role de couche metier entre Elasticsearch et l'interface web.

## Le Moteur IA

Le moteur IA est separe du backend principal et se trouve dans :

- `ai-engine/app.py`

Ce choix d'architecture est important car il rend le systeme plus propre :

- le backend gere la logique applicative ;
- le moteur IA gere la logique de detection.

### Approche De Detection

Le moteur IA utilise une approche hybride.

#### A. Detection Heuristique

Cette couche applique des regles explicables sur les evenements.

Exemples :

- trop d'echecs SSH sur une fenetre courte ;
- trop d'erreurs ou requetes DNS anormales ;
- trop de ports distincts cibles en peu de temps.

Cela permet de detecter :

- brute force SSH ;
- anomalie DNS ;
- port scan.

#### B. Detection ML Non Supervisee

Le moteur ajoute aussi une couche d'apprentissage automatique avec `IsolationForest`.

Il construit des variables a partir des donnees recentes, par exemple :

- nombre d'evenements ;
- nombre de ports distincts ;
- nombre d'echecs SSH ;
- activite DNS ;
- activite par IP.

Ensuite, le modele cherche les comportements anormaux par rapport a un historique recent. Cela permet de completer les regles explicites par une detection d'outliers.

### Sortie Du Moteur IA

Le moteur renvoie des findings au backend avec des informations comme :

- la famille d'anomalie ;
- la source ;
- le niveau de confiance ;
- la severite ;
- la signature ;
- la recommandation.

## Les Pages Principales Du Frontend

Le frontend contient plusieurs pages, chacune avec un role precis.

### SOC Overview

Vue globale du systeme :

- indicateurs de securite ;
- activite recente ;
- volumes d'alertes ;
- resume des machines et du risque.

### Elastic Logs

Permet de consulter les logs centralises :

- horodatage ;
- niveau ;
- source ;
- message ;
- recherche et filtre.

### Alerts

Affiche les detections produites ou agregees :

- type de detection ;
- source heuristique ou ML ;
- niveau de confiance ;
- signature ;
- severite ;
- recommandation.

### Incidents

Regroupe plusieurs alertes en incidents plus lisibles.

Le but est d'eviter un incident par evenement. L'application peut produire :

- une campagne d'anomalies DNS ;
- une anomalie ML sur une source ;
- un regroupement d'activite suspecte par fenetre ou famille.

### Assets / Hosts

Montre les machines surveillees :

- nom ;
- IP ;
- OS ;
- role ;
- etat ;
- score de risque.

### Network Flows

Donne une lecture des relations reseau et de la topologie logique.

### AI Detection / Model

Explique ce que fait le moteur IA :

- detecteurs heuristiques ;
- seuils ;
- fenetre de deduplication ;
- parametres ML ;
- type de modele utilise.

### Risk Forecast

Affiche des indicateurs ou projections de risque derives des donnees courantes.

### Stack Health

Permet de verifier si les briques techniques fonctionnent :

- collecte ;
- API ;
- IA ;
- Elasticsearch ;
- pipeline global.

## Gestion Des Machines Et Du Scope

Le projet a ete pense pour ne pas melanger toutes les machines dans une seule vue plate.

Pour cela, il introduit des notions comme :

- `profiles`
- `assets`
- `profile_assets`

L'idee est de permettre un filtrage global par :

- machine unique ;
- profil ;
- groupe logique.

Ainsi, lorsqu'on change le scope actif dans l'application, toutes les pages peuvent se recalculer sur ce perimetre :

- logs ;
- alertes ;
- incidents ;
- flux ;
- predictions ;
- etat du modele.

## Agent D'Installation

Le projet prevoit aussi un bootstrap d'agent dans :

- `agent/install-linux.sh`
- `agent/install-windows.ps1`

Cet agent doit servir a enroll une machine distante dans la plateforme.

Son role est de :

- installer et configurer les Beats ;
- pointer vers l'Elastic central ;
- injecter des metadonnees ;
- rattacher la machine a un `asset_id` et a un `profile_id`.

L'objectif est de rendre le deploiement multi-machines plus propre et plus industrialisable.

## Technologies Utilisees

Les principales technologies utilisees dans le projet sont :

- Python
- FastAPI
- React
- CRACO
- TailwindCSS
- Elasticsearch
- Kibana
- Filebeat
- Packetbeat
- Metricbeat
- scikit-learn
- IsolationForest
- systemd
- SSH

## Interet Du Projet

NetSentinel AI est interessant parce qu'il va au-dela d'un simple tableau de bord statique.

Il met ensemble :

- de vraies donnees techniques ;
- une logique de detection defendable ;
- une architecture separee et claire ;
- une lecture operationnelle de la securite.

Il permet de montrer concrètement :

- comment collecter des donnees de securite ;
- comment les centraliser ;
- comment detecter des anomalies ;
- comment transformer des evenements bruts en informations utiles.

## Resume Final

NetSentinel AI est une plateforme de supervision de securite qui combine Elastic Stack, backend applicatif, moteur IA hybride et interface web de type SOC.

Le projet collecte des logs, des flux reseau et des metriques, les centralise dans Elasticsearch, applique des mecanismes de detection heuristique et d'apprentissage automatique, puis restitue les resultats dans des vues claires sous forme de logs, alertes, incidents, risques et etat du pipeline.

En une phrase, NetSentinel AI est un projet de detection d'intrusions et d'anomalies qui cherche a rendre la securite reseau plus visible, plus lisible et plus exploitable.
