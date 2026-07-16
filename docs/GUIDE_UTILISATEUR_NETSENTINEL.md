# Guide utilisateur NetSentinel AI

## 1. Acces a l'application

Application web :

- `http://79.137.32.27:3000`

API backend :

- `http://79.137.32.27:8010/api/health`

Comptes de demonstration :

- Administrateur : `admin@uy1.local` / `admin123`
- Analyste : `analyst@uy1.local` / `analyst123`

## 2. Connexion

1. Ouvrir l'application dans le navigateur.
2. Aller sur `Login`.
3. Saisir l'email et le mot de passe.
4. Apres connexion, le tableau de bord principal s'affiche.

Les comptes sont stockes dans le navigateur pour la demonstration. Si la session pose probleme, vider le stockage local du navigateur ou utiliser un autre navigateur.

## 3. Tableau de bord SOC Overview

La page `SOC Overview` donne la vue generale :

- nombre total d'alertes ;
- anomalies detectees ;
- incidents ouverts ;
- temps moyen de detection ;
- hotes les plus risques ;
- principales adresses IP attaquantes ;
- courbe du trafic et des alertes.

C'est la page a ouvrir en premier pendant une demonstration.

## 4. Surveillance des evenements

Pages principales :

- `Telemetry Stream` : flux temps reel des evenements et metriques.
- `Elastic Logs` : exploration des journaux collectes depuis Elasticsearch.
- `Alerts` : alertes detectees par les regles et le moteur IA.
- `Incidents` : regroupement des alertes en incidents lisibles.

Dans `Alerts`, cliquer sur une alerte pour voir :

- la severite ;
- la source et la destination ;
- la tactique MITRE ;
- la description ;
- la recommandation ;
- le playbook de reaction.

Actions possibles selon l'alerte :

- reconnaitre l'alerte ;
- isoler un hote ;
- bloquer une IP ;
- creer un ticket.

## 5. Assets et reseau

La page `Assets/Hosts` affiche les machines connues :

- nom d'hote ;
- adresse IP ;
- systeme ;
- criticite ;
- score de risque ;
- statut de l'agent.

La page `Network Flows` permet de visualiser les flux reseau et les communications suspectes.

## 6. Detection IA

La page `AI Detection` presente le moteur de detection :

- seuils de detection ;
- heuristiques activees ;
- indicateurs de performance ;
- modeles utilises.

La page `Risk Forecast` affiche les previsions de risque. Elle sert a expliquer que NetSentinel ne se limite pas aux logs bruts : il transforme les donnees en indicateurs exploitables.

## 7. Etat de la plateforme

La page `Stack Health` permet de verifier les composants :

- Filebeat ;
- Packetbeat ;
- Elasticsearch ;
- moteur IA ;
- API NetSentinel.

Avant une soutenance, verifier que les services sont en etat `healthy` ou au moins que l'API, le frontend et le moteur IA repondent.

## 8. Gestion des agents

La page `Agents` sert a rattacher une nouvelle machine.

Flux normal :

1. creer un token d'enrolement ;
2. installer l'agent sur la machine cible avec le token ;
3. attendre que l'instance apparaisse en attente d'approbation ;
4. approuver l'instance ;
5. verifier que le statut devient actif.

Le secret admin peut etre demande pour les actions sensibles. Sur l'environnement de demonstration, il est configure cote backend.

## 9. Rapports, profil et parametres

- `Reports` : generer ou telecharger un rapport de supervision.
- `Profile` : modifier les informations du compte connecte.
- `Users` : gerer les utilisateurs, visible pour l'administrateur.
- `Settings` : ajuster les preferences d'affichage, d'actualisation et de sensibilite.
- `Guide` : consulter l'aide integree si elle est disponible dans le build.

## 10. Verification rapide avant demonstration

Verifier dans l'ordre :

1. `http://79.137.32.27:3000` ouvre l'interface.
2. `http://79.137.32.27:8010/api/health` retourne `status: ok`.
3. La page `SOC Overview` affiche des indicateurs.
4. La page `Alerts` contient des alertes.
5. La page `Stack Health` affiche les composants de la plateforme.

Si une page ne charge pas, tester d'abord l'API backend puis redemarrer les services sur le serveur.
