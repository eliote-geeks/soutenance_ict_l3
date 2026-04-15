REPUBLIQUE DU CAMEROUN  
Paix - Travail - Patrie  

UNIVERSITE DE YAOUNDE I  
Faculte des Sciences  
Departement d'Informatique  

REPUBLIC OF CAMEROON  
Peace - Work - Fatherland  

UNIVERSITY OF YAOUNDE I  
Faculty of Sciences  
Department of Computer Science  
P.O. Box 812 Yaounde  


# TITRE : ETAT D'AVANCEMENT DES TRAVAUX

## THEME

Detection des intrusions et des anomalies dans un reseau informatique a l'aide de l'intelligence artificielle et de l'Elastic Stack.

## NOMS ET PRENOMS

- PAUL
- ANNIE
- CHELSY

## ENCADREUR ACADEMIQUE

- A completer

## ETAT D'AVANCEMENT DES TRAVAUX

| Num | Taches realisees | Difficultes rencontrees |
|---|---|---|
| 1 | Analyse du theme et definition de l'architecture generale du projet NetSentinel AI. Separation de la solution en quatre couches : collecte, stockage Elastic, moteur IA, backend API et frontend web. | La principale difficulte initiale a ete de definir une architecture realiste, defendable en soutenance et suffisamment modulaire pour evoluer. |
| 2 | Mise en place de la collecte des donnees a l'aide de Filebeat, Packetbeat et Metricbeat. Identification des journaux et flux utiles pour la detection : logs systeme, auth SSH, fail2ban, DNS, HTTP, activite machine. | Les sources de donnees n'etaient pas homogenes et certaines configurations de collecte ont du etre ajustees pour obtenir des evenements reellement exploitables. |
| 3 | Mise en place d'Elasticsearch comme socle central de stockage et d'indexation. Verification de la remontee des index `filebeat-*`, `packetbeat-*`, `metricbeat-*` et `ai-alerts-*`. | L'un des problemes rencontres a ete la charge serveur ainsi que l'equilibrage entre les services deja presents et les composants utiles au projet. |
| 4 | Conception et developpement du backend NetSentinel avec FastAPI pour agreger les donnees Elastic, exposer les endpoints de supervision, construire les incidents et produire les objets utiles au frontend. | Le backend a necessite une phase importante de normalisation des donnees car les champs Elastic ne sont pas toujours directement exploitables dans une interface web. |
| 5 | Conception du moteur IA externe. Mise en place d'une logique hybride combinant heuristiques et apprentissage automatique non supervise avec IsolationForest pour detecter les comportements anormaux. | Le reglage des seuils et la reduction des faux positifs ont constitue une difficulte importante, en particulier avec des volumes variables d'evenements. |
| 6 | Ajout de recommandations et playbooks associes aux alertes afin que la plateforme ne se limite pas a la detection mais aide aussi a la remediations. | Il a fallu trouver un compromis entre recommandations pertinentes, simplicite d'affichage et coherence avec les incidents reellement observes. |
| 7 | Conception du frontend NetSentinel AI avec React. Realisation des pages : Overview, Stream, Logs, Alerts, Incidents, Hosts, Network, Model, Predictions et Pipeline. | Plusieurs ajustements d'ergonomie ont ete necessaires, notamment sur l'affichage des logs, la robustesse des appels API et la lisibilite des pages. |
| 8 | Mise en place d'un filtrage global par machine et par profil a l'aide du modele `profiles / assets / profile_assets`, pour permettre la supervision multi-appareils et la gestion de groupes d'hotes. | La difficulte majeure a ete de relier proprement l'inventaire metier et les evenements techniques issus d'Elastic, sans melanger les contextes d'affichage. |
| 9 | Creation d'un agent d'installation Linux et Windows pour preparer l'enrolement futur des machines distantes et automatiser la configuration des Beats. | L'agent est fonctionnel en premiere version, mais la partie securisation de l'enrolement et du controle d'acces reste a finaliser. |
| 10 | Deploiement de l'application sur serveur et premiers travaux d'optimisation des ressources en desactivant certains services non essentiels et en arretrant temporairement les composants non utilises. | Le serveur heberge plusieurs applications en parallele, ce qui impose une gestion prudente des ressources pour ne pas degrader les autres services. |

## CALENDRIER POUR LA SUITE DES TRAVAUX

| Num | Activites | Delais |
|---|---|---|
| 1 | Finaliser la structuration du rapport et des captures de demonstration pour la soutenance. | Court terme |
| 2 | Completer l'inventaire des hotes et des profils dans la plateforme. | Court terme |
| 3 | Renforcer l'agent d'installation avec un veritable mecanisme d'enrolement securise. | Court terme |
| 4 | Transformer le frontend de supervision en deploiement plus leger et plus stable. | Moyen terme |
| 5 | Ajouter de nouveaux jeux de tests et scenarios de demonstration d'attaques reseau. | Moyen terme |
| 6 | Finaliser les recommandations de remediation et les explications du modele IA pour la presentation orale. | Moyen terme |

## OBSERVATION GENERALE

L'etat actuel du projet est deja avance. Les briques principales sont en place : collecte, stockage, analyse IA, backend de supervision et interface web. Les travaux restants concernent surtout l'industrialisation, la securisation de l'enrolement des agents, l'affinage des detections et la finalisation du dossier de soutenance.

## SIGNATURES

Signature des etudiants :  
- Paul  
- Annie  
- Chelsy  

Signature de l'encadreur academique :  
- A completer
