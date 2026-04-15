# Procede De Mise En Place De L'Application NetSentinel AI

## Theme De Soutenance

Detection des intrusions et des anomalies dans un reseau informatique a l'aide de l'intelligence artificielle et de l'Elastic Stack.

## Titre Du Projet

NetSentinel AI est une plateforme de supervision de securite qui collecte des journaux systeme et reseau, les centralise dans Elasticsearch, applique des mecanismes de detection heuristique et d'apprentissage automatique, puis restitue les resultats dans une application web de surveillance.

## Objectif General

L'objectif du projet est de concevoir et mettre en place une plateforme capable de :

- collecter des donnees de securite depuis plusieurs machines ;
- centraliser ces donnees dans un moteur de recherche et d'analyse ;
- detecter en temps reel les intrusions et comportements anormaux ;
- proposer des recommandations de remediations ;
- offrir une interface web claire pour la supervision.

## Objectifs Specifiques

- installer et configurer Elastic Stack pour la centralisation des donnees ;
- deployer Packetbeat, Filebeat et Metricbeat pour la collecte ;
- construire un moteur IA separe pour l'analyse des anomalies ;
- developper un backend API pour agreger les resultats ;
- developper un frontend ergonomique pour l'observation des alertes et incidents ;
- permettre la gestion par machine, par profil et par groupe d'appareils.

## Vue D'Ensemble De L'Architecture

L'application est organisee en quatre couches :

1. Couche de collecte
- Filebeat collecte les logs systeme, d'authentification, d'applications et de fail2ban.
- Packetbeat observe les flux reseau et certains protocoles.
- Metricbeat remonte les metriques d'hotes et d'etat de la machine.

2. Couche de stockage et d'indexation
- Elasticsearch recoit les donnees brutes et les indexe.
- Kibana permet l'inspection et l'analyse parallele des donnees.

3. Couche d'analyse intelligente
- un moteur IA externe lit les index Elastic ;
- il applique des regles heuristiques ;
- il applique aussi un modele d'anomalie non supervise ;
- il renvoie des findings securite au backend NetSentinel.

4. Couche applicative
- un backend FastAPI expose une API de supervision ;
- un frontend React affiche les dashboards, alertes, incidents, topologie et etat de pipeline.

## Outils Et Technologies Utilises

- Ubuntu Linux
- Elasticsearch
- Kibana
- Filebeat
- Packetbeat
- Metricbeat
- Python
- FastAPI
- React
- CRACO
- TailwindCSS
- scikit-learn
- IsolationForest
- systemd
- SSH

## Repartition Du Travail Par Membre

Le projet peut etre presente comme une realisation collaborative en trois grandes parties :

- Paul : architecture, collecte, backend et integration Elastic
- Annie : moteur IA, logique de detection et recommandations
- Chelsy : interface utilisateur, visualisation et experience de supervision

---

# Partie 1 - Travail De Paul

## 1. Definition De L'Architecture Technique

Le premier travail a consiste a definir une architecture modulaire afin d'eviter un systeme monolithique difficile a maintenir. Le choix a ete de separer :

- la collecte des donnees ;
- l'analyse IA ;
- l'API de supervision ;
- l'interface web.

Cette separation offre plusieurs avantages :

- meilleure lisibilite technique ;
- possibilite de faire evoluer l'IA independamment du front ;
- meilleure defense en soutenance car chaque couche a un role clair.

## 2. Mise En Place D'Elastic Stack

La plateforme Elastic constitue le socle de centralisation.

Les composants utilises sont :

- Elasticsearch pour le stockage et la recherche ;
- Kibana pour les dashboards et l'inspection ;
- Filebeat pour les logs ;
- Packetbeat pour le trafic reseau ;
- Metricbeat pour les metriques systeme.

Le serveur central recupere les donnees issues des beats et les stocke dans les index appropries, notamment :

- `filebeat-*`
- `packetbeat-*`
- `metricbeat-*`
- `ai-alerts-*`

## 3. Choix Des Donnees A Collecter

Les donnees ciblees pour la detection ont ete les suivantes :

- journaux systeme ;
- journaux d'authentification SSH ;
- journaux de fail2ban ;
- evenements des conteneurs ;
- flux DNS ;
- flux HTTP ;
- informations de destination IP/port ;
- metriques CPU, memoire, activite hote.

Le but est de combiner des signaux systeme et reseau afin de rendre la detection plus fiable.

## 4. Mise En Place Du Backend NetSentinel

Le backend a ete developpe avec FastAPI dans :

- `backend/server.py`

Son role est de :

- se connecter a Elasticsearch ;
- lire les donnees brutes ;
- normaliser ces donnees ;
- regrouper les alertes ;
- produire des incidents lisibles ;
- exposer les endpoints au frontend ;
- centraliser la logique metier.

## 5. Construction De L'API

Le backend expose plusieurs routes principales :

- `/api/overview`
- `/api/stream`
- `/api/logs`
- `/api/alerts`
- `/api/incidents`
- `/api/hosts`
- `/api/model`
- `/api/predictions`
- `/api/pipeline`

Ces routes permettent d'alimenter les pages du frontend sans exposer directement Elasticsearch au navigateur.

## 6. Mise En Place Du Scope Global

Pour que l'application soit exploitable a plus grande echelle, il a fallu ajouter une logique de filtrage global par machine et par profil.

Des notions metier ont donc ete introduites :

- `profiles`
- `assets`
- `profile_assets`

Le but est de permettre :

- la visualisation globale de tout le parc ;
- la visualisation des donnees d'un profil ;
- la visualisation d'une seule machine.

Le backend applique ensuite ces filtres sur les logs, alertes, incidents, metriques et predictions.

## 7. Ajout D'Un Agent D'Installation

Dans l'optique d'un deploiement multi-machines, un agent d'installation a ete prepare dans :

- `agent/install-linux.sh`
- `agent/install-windows.ps1`

Cet agent a pour role de :

- preparer la machine ;
- configurer les beats ;
- injecter les champs d'identification ;
- connecter la machine a la plateforme centrale.

Les metadonnees transportees sont par exemple :

- `asset_id`
- `profile_id`
- `site`
- `role`
- `environment`

---

# Partie 2 - Travail D'Annie

## 1. Conception Du Moteur D'Analyse IA

Le moteur IA a ete separe du backend principal pour garder une architecture propre.

Il a ete developpe dans :

- `ai-engine/app.py`

Ce moteur lit directement les evenements Elastic et calcule des observations de securite sur des fenetres temporelles courtes.

## 2. Approche Hybride De Detection

Le moteur IA utilise une approche hybride composee de deux familles de mecanismes :

1. heuristiques explicites ;
2. apprentissage automatique non supervise.

Cette approche est importante pour la soutenance car elle permet de montrer a la fois :

- des detections explicables ;
- des detections intelligentes sur des comportements inattendus.

## 3. Detections Heuristiques Mises En Place

Plusieurs cas d'usage ont ete implementes :

- brute force SSH ;
- anomalie DNS ;
- scan de ports ;

### Brute Force SSH

Le moteur compte les echecs d'authentification observes dans les logs. Si le nombre depasse un seuil sur une fenetre donnee, une alerte de type brute force est generee.

### Anomalie DNS

Le moteur observe le nombre d'erreurs ou d'evenements DNS anormaux. Un volume eleve dans une courte periode peut correspondre a :

- une panne de resolution ;
- un comportement de malware ;
- du tunneling ;
- un comportement de commande et controle.

### Scan De Ports

Le moteur mesure le nombre de ports distincts cibles par une meme source. Une source qui touche trop de ports en peu de temps est signalee comme suspecte.

## 4. Couche D'Apprentissage Automatique

Pour aller au-dela des regles fixes, un modele `IsolationForest` a ete integre.

Le principe est le suivant :

- agregation des evenements par IP et par fenetre temporelle ;
- construction d'un vecteur de caracteristiques ;
- apprentissage de la normalite a partir de l'historique ;
- signalement des comportements eloignes de cette normalite.

Exemples de caracteristiques utilisees :

- nombre total d'evenements ;
- nombre de ports distincts ;
- nombre d'erreurs DNS ;
- nombre d'echecs SSH ;
- intensite d'activite.

## 5. Systeme De Deduplication

Pour eviter de spammer l'application avec les memes alertes, une logique de deduplication persistante a ete ajoutee.

Cette logique permet :

- de ne pas republier la meme finding toutes les quelques secondes ;
- de garder une meilleure lisibilite des alertes ;
- de rendre les incidents plus coherents.

## 6. Enrichissement Des Findings

Chaque finding IA peut contenir :

- un type d'alerte ;
- un niveau de severite ;
- une confiance ;
- une recommendation ;
- un playbook ;
- une signature ;
- une source (`heuristic` ou `ml`).

Cette phase donne une valeur pratique au projet car la plateforme ne se contente pas de detecter, elle aide aussi a repondre.

## 7. Recommandations Et Remediation

Une partie importante du travail a consiste a prevoir des solutions associees aux intrusions observees.

Exemples :

### Brute force SSH

- bloquer l'IP source ;
- desactiver le mot de passe SSH ;
- imposer les cles SSH ;
- verifier les comptes cibles.

### Scan de ports

- fermer les ports inutiles ;
- bloquer l'adresse source ;
- auditer les services exposes ;
- verifier les regles firewall.

### Anomalie DNS

- verifier les processus d'origine ;
- examiner les domaines resolus ;
- isoler la machine si necessaire ;
- effectuer une analyse plus poussee.

---

# Partie 3 - Travail De Chelsy

## 1. Conception De L'Interface Utilisateur

L'interface a ete concue comme un dashboard de supervision de securite moderne.

Le frontend se trouve dans :

- `frontend/src`

L'application React a ete structuree en pages, composants partages et contexte global.

## 2. Mise En Place De La Navigation

Les principales pages ont ete integrees dans la navigation laterale :

- SOC Overview
- Telemetry Stream
- Elastic Logs
- Alerts
- Incidents
- Assets/Hosts
- Network Flows
- AI Detection
- Risk Forecast
- Stack Health

Cette organisation permet a l'utilisateur de parcourir logiquement tout le cycle de supervision.

## 3. Dashboard General

La page `Overview` centralise les indicateurs majeurs :

- total des alertes ;
- anomalies detectees ;
- incidents ouverts ;
- temps moyen de detection ;
- trafic reseau ;
- hotes les plus risques ;
- score global d'anomalie.

Le but de cette page est de donner un etat rapide et exploitable de la situation.

## 4. Page Elastic Logs

La page `Logs` permet d'explorer les evenements collectes par Filebeat.

Elle contient :

- une barre de recherche ;
- des filtres de temps ;
- des filtres par niveau ;
- un detail repliable par ligne ;
- les champs associes a chaque evenement.

Cette page est utile pour l'investigation et la correlation manuelle.

## 5. Page Alerts

La page `Alerts` affiche les findings issus du moteur IA et des regles.

Chaque alerte expose :

- la severite ;
- le statut ;
- la source de detection ;
- le niveau de confiance ;
- la signature ;
- la recommandation ;
- le playbook.

Cette page sert de point d'entree pour la reponse aux incidents.

## 6. Page Incidents

La page `Incidents` regroupe plusieurs alertes connexes pour reduire le bruit.

Elle affiche notamment :

- la famille d'incident ;
- le nombre d'alertes ;
- le type de portee (`campaign` ou `single-source`) ;
- la source principale ;
- la timeline des evenements.

Cela permet de mieux comprendre les campagnes d'attaque au lieu de traiter chaque alerte isolement.

## 7. Page Hosts

La page `Hosts` presente les machines surveillees :

- nom de la machine ;
- criticite ;
- score de risque ;
- etat ;
- agent installe ou non.

Cette page devient centrale lorsque la plateforme gere plusieurs appareils.

## 8. Page AI Detection

La page `Model` explique la logique de detection :

- seuils heuristiques ;
- fenetre de deduplication ;
- configuration ML ;
- importance des caracteristiques ;
- detecteurs actifs.

Cette page est importante dans la soutenance car elle permet de justifier la methode d'analyse.

## 9. Ergonomie Et Personnalisation

Le frontend a aussi ete personnalise pour obtenir une interface plus nette :

- branding NetSentinel AI ;
- changement de typographie ;
- correction de l'affichage de certaines pages ;
- structuration plus lisible des listes et details.

---

# Procede Global De Mise En Place

## Etape 1 - Preparation Du Serveur

- installation d'un serveur Ubuntu ;
- activation des acces SSH ;
- verification de Python, Node.js et npm ;
- creation des repertoires du projet ;
- verification des ports utiles.

## Etape 2 - Deploiement D'Elastic Stack

- installation ou verification d'Elasticsearch ;
- installation ou verification de Kibana ;
- preparation des identifiants de connexion ;
- verification de l'accessibilite des index.

## Etape 3 - Collecte Des Journaux Et Flux

- installation de Filebeat ;
- installation de Packetbeat ;
- installation de Metricbeat ;
- ajout des chemins de logs utiles ;
- configuration de la sortie vers Elasticsearch.

## Etape 4 - Mise En Place Du Backend

- installation d'un environnement Python ;
- installation des dependances backend ;
- configuration du fichier `.env` ;
- lancement du backend FastAPI ;
- verification des endpoints de sante.

## Etape 5 - Mise En Place Du Moteur IA

- installation des dependances IA ;
- configuration des variables d'environnement ;
- test du moteur ;
- verification des findings publies.

## Etape 6 - Mise En Place Du Frontend

- installation des dependances Node ;
- configuration des variables React ;
- lancement du frontend ;
- verification des pages et des flux API.

## Etape 7 - Integration Complete

- verification de l'arrivee des logs ;
- verification des evenements reseau ;
- verification des findings IA ;
- verification des alertes ;
- verification des incidents ;
- verification de l'affichage dans toutes les pages.

---

# Resultats Attendus

Une fois la plateforme en place, il devient possible de :

- suivre des journaux de securite en temps reel ;
- visualiser les anomalies et intrusions ;
- observer les machines les plus exposees ;
- comprendre les campagnes d'attaque ;
- expliquer les mecanismes IA ;
- proposer des mesures de remediations ;
- filtrer les donnees par machine ou par profil.

---

# Difficultes Rencontrees

Plusieurs difficultes peuvent etre citees dans le rapport :

- surcharge memoire du serveur a cause de plusieurs services simultanes ;
- necessite d'alleger certains composants pour eviter la saturation ;
- construction d'une architecture propre entre Elastic, IA, backend et frontend ;
- fiabilisation de l'affichage et des appels API ;
- reduction des faux positifs ;
- besoin d'une vraie gestion d'inventaire des machines.

---

# Perspectives D'Amelioration

- mise en place d'un enrôlement securise des agents ;
- creation d'un vrai package `netsentinel-agent` ;
- deploiement frontend en mode statique production ;
- ajout de dashboards Kibana dedies ;
- ajout d'autres algorithmes IA ;
- ajout d'un systeme d'organisations et de gestion multi-client ;
- prise en charge complete de plusieurs hotes Windows et Linux.

---

# Conclusion

NetSentinel AI constitue une plateforme complete de demonstration autour du theme de la detection des intrusions et anomalies reseau par intelligence artificielle. Le projet associe collecte, centralisation, analyse, enrichissement et visualisation. La division des taches entre Paul, Annie et Chelsy permet de presenter clairement la complementarite entre architecture systeme, intelligence artificielle et interface utilisateur.

Le projet est defendable en soutenance parce qu'il montre :

- une architecture technique reelle ;
- une logique de detection hybride ;
- une application web exploitable ;
- une reflexion sur la remediations ;
- une possibilite d'evolution vers un systeme plus industriel.
