import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Minimize2, Maximize2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─── Knowledge base ──────────────────────────────────────────────────────── */
const KB = [
  /* ── Platform overview ── */
  {
    tags: ['netsentinel', 'plateforme', 'platform', "c'est quoi", 'what is', 'présentation', 'overview', 'soc', 'présente', 'explique'],
    answer: `**NetSentinel AI** est une plateforme SOC (Security Operations Center) complète qui centralise la détection de menaces, la gestion d'alertes et le monitoring d'assets.

Elle est composée de :
- **Backend FastAPI** (port 8010) — API REST qui interroge Elasticsearch
- **Frontend React** (port 3000) — interface que vous utilisez
- **Elasticsearch** — stocke tous les logs, alertes et métriques
- **Agents** (Beats) — déployés sur les machines surveillées
- **Moteur IA** (port 9000) — détection par One-Class SVM

Les données viennent de **Filebeat** (logs), **Packetbeat** (réseau) et **Metricbeat** (CPU/RAM).`,
  },

  /* ── Navigation / sidebar ── */
  {
    tags: ['navigation', 'menu', 'sidebar', 'barre', 'pages', 'liens', 'lien', 'icône', 'icon', 'aller', 'naviguer'],
    answer: `La barre latérale (sidebar) à gauche contient tous les liens :

- **SOC Overview** (/) — tableau de bord principal
- **Telemetry Stream** (/stream) — flux d'événements en temps réel
- **Elastic Logs** (/logs) — explorateur de logs
- **Alerts** (/alerts) — alertes de sécurité
- **Incidents** (/incidents) — incidents groupés
- **Assets / Hosts** (/hosts) — inventaire des machines
- **Agents** (/agents) — gestion des agents
- **AI Detection** (/model) — métriques du modèle IA
- **Stack Health** (/pipeline) — santé du stack
- **Reports** (/reports) — génération de rapports
- **User Guide** (/guide) — ce guide complet

Le bouton **←** en haut de la sidebar la réduit pour gagner de l'espace.`,
  },

  /* ── Top bar ── */
  {
    tags: ['topbar', 'top bar', 'barre haute', 'en-tête', 'header', 'barre du haut', 'recherche', 'search', 'scope', 'filtre'],
    answer: `La barre du haut (TopBar) contient plusieurs éléments :

- **Barre de recherche** — filtre global (KQL supporté, ex: \`severity:critical\`)
- **Sélecteur d'environnement** — Production / Development / Lab
- **Scope** — filtrer sur "All Assets", un profil ou un asset spécifique
- **Badge LIVE** (vert) — connexion API active / rouge = déconnecté
- **Compteur de refresh** — indique la dernière mise à jour (toutes les 30s)
- **Cloche 🔔** — notifications d'alertes critiques/high/medium en temps réel
- **Soleil/Lune** — bascule dark/light mode
- **Avatar** — menu utilisateur (profil, déconnexion)`,
  },

  /* ── Notifications ── */
  {
    tags: ['notification', 'cloche', 'bell', 'alerte notif', 'badge', 'non lu', 'unread', 'mark read'],
    answer: `L'icône **cloche 🔔** en haut à droite affiche les alertes Critical, High et Medium en temps réel.

**Fonctionnement :**
- Le badge rouge indique le nombre d'alertes non lues
- Cliquer une notification la marque comme lue et ouvre la page Alerts
- "Mark all read" marque tout d'un coup
- L'état "lu/non lu" est sauvegardé dans le localStorage

Les notifications se rechargent automatiquement toutes les **30 secondes** depuis Elasticsearch.`,
  },

  /* ── SOC Overview ── */
  {
    tags: ['overview', 'dashboard', 'tableau de bord', 'kpi', 'accueil', 'home', 'anomaly', 'anomalie', 'score'],
    answer: `La page **SOC Overview** (/) est le tableau de bord principal.

**KPI Cards (en haut) :**
- Total Alerts — nb d'alertes dans ES
- Anomaly Score — score 0-100 du modèle IA (>70 = suspect, >85 = critique)
- Mean Time to Detect — délai moyen de détection en minutes
- Risky Hosts — nb de machines à risque élevé

**Graphiques :**
- Répartition des alertes par sévérité (Critical/High/Medium/Low)
- Timeline du trafic réseau (Packetbeat)
- Top IP attaquantes avec option de copie

Utilisez le **sélecteur de scope** dans la TopBar pour filtrer tous les KPIs sur un asset précis.`,
  },

  /* ── Alerts ── */
  {
    tags: ['alert', 'alerte', 'alerts', 'alertes', 'critiqu', 'severity', 'sévérité', 'triage', 'acknowledge', 'block', 'isolate', 'playbook', 'bloquer', 'block ip', 'ip attaquante', 'attaquante', 'bloquer ip'],
    answer: `La page **Alerts** (/alerts) liste toutes les alertes de sécurité.

**Colonnes du tableau :**
- ID (ALT-XXXXXX), Sévérité, Titre, Statut, Source IP → Hostname, MITRE Tactic

**Actions sur une alerte (cliquer la ligne) :**
- **Acknowledge** — passe le statut en "Investigating"
- **Block IP** — envoie une commande block à l'agent sur le host concerné
- **Isolate Host** — isole la machine du réseau
- **Playbook** — étapes de remédiation spécifiques au type d'attaque

**Filtres disponibles :**
- Barre de recherche (IP, hostname, mot-clé)
- Boutons de sévérité (Critical / High / Medium / Low)
- Statut (Open / Investigating / Resolved)

⚠️ Block IP et Isolate Host nécessitent un **agent actif et approuvé** sur la machine cible.`,
  },

  /* ── Incidents ── */
  {
    tags: ['incident', 'incidents', 'campagne', 'investigation', 'timeline', 'mitre', 'kill chain'],
    answer: `La page **Incidents** (/incidents) regroupe les alertes corrélées en incidents d'investigation.

**Un incident contient :**
- Liste chronologique des alertes liées (timeline)
- Mapping ATT&CK — tactiques MITRE observées dans l'incident
- Machines affectées (liste des hosts touchés)
- Statut : Open / In Progress / Resolved

**Comment l'utiliser :**
1. Cliquer un incident dans la liste gauche
2. Voir le détail et la timeline à droite
3. Modifier le statut pour tracker l'avancement

Les incidents sont **auto-générés** à partir des alertes — un pattern d'attaque = un incident.`,
  },

  /* ── Stream ── */
  {
    tags: ['stream', 'flux', 'live', 'temps réel', 'événement', 'event', 'packetbeat', 'filebeat', 'feed', 'pause', 'resume'],
    answer: `La page **Telemetry Stream** (/stream) affiche les événements réseau en temps réel.

**Ce que vous voyez :**
- Graphique events/sec (fenêtre glissante 10 points)
- Graphique bytes/sec
- Compteur de tentatives de connexion échouées (Filebeat)
- **Live Event Feed** — scroll des derniers événements (source → dest, port, sévérité)

**Contrôles :**
- **Pause** — fige le feed pour inspecter un événement précis
- **Resume** — reprend le scroll en vidant le buffer
- Le compteur en bas à droite montre les events des 5 dernières secondes

Source : Packetbeat en priorité → Filebeat → données mock si aucun agent actif.`,
  },

  /* ── Logs ── */
  {
    tags: ['logs', 'log', 'elastic logs', 'explorateur', 'kql', 'query', 'requête', 'recherche log', 'filebeat index'],
    answer: `La page **Elastic Logs** (/logs) permet d'explorer les logs bruts dans Elasticsearch.

**Recherche :**
- Taper un mot-clé dans la barre → recherche dans message, host, IP, user
- Syntaxe KQL : \`severity:critical AND source.ip:10.0.0.1\`
- Wildcards : \`host.name:web-*\` trouve web-01, web-02…
- Sélecteur de plage de temps (1h, 24h, 7j, custom)

**Résultats :**
- Cliquer ▶ sur une ligne pour voir le JSON complet
- Badge coloré par niveau (INFO / WARN / ERROR)
- Source de l'index affiché (filebeat, packetbeat, agent)

Les logs viennent de l'index \`filebeat-*\` configuré dans \`backend/.env\`.`,
  },

  /* ── Hosts ── */
  {
    tags: ['host', 'hosts', 'asset', 'assets', 'machine', 'inventaire', 'risk score', 'risque', 'ajouter', 'add asset', 'metricbeat'],
    answer: `La page **Assets / Hosts** (/hosts) est l'inventaire de toutes les machines surveillées.

**Colonnes :** Hostname, IP, OS, Rôle, Risk Score (0-100), Statut agent, Dernière activité

**Risk Score** = combinaison de CPU, pression mémoire et nb d'alertes actives sur la machine.

**Ajouter un nouvel asset :**
1. Cliquer **"Add Asset"** (bouton haut droite)
2. Remplir hostname, IP, OS, rôle, site
3. Aller sur Agents pour créer un token lié à cet asset
4. Exécuter le script d'installation sur la machine
5. Approuver l'agent → le host devient actif

**Export CSV** — télécharge l'inventaire courant (utile pour audits).`,
  },

  /* ── Agents ── */
  {
    tags: ['agent', 'agents', 'enroll', 'enrollment', 'token', 'install', 'approuver', 'approve', 'pending', 'actif', 'active', 'script', 'install-linux'],
    answer: `La page **Agents** (/agents) gère les agents de monitoring déployés sur les machines.

**Cycle de vie d'un agent :**
1. **Créer un token** — Cliquer "New Token", choisir l'asset, définir l'expiry (24h recommandé)
2. **Entrer le secret admin** — Requis (ADMIN_API_SECRET dans backend/.env)
3. **Copier la commande** — \`sudo bash install-linux.sh --token <TOKEN> --api-url <URL>\`
4. **Exécuter sur la machine cible** — installe Filebeat, Metricbeat, Packetbeat
5. **Approuver** — l'agent passe de \`pending_approval\` → \`approved\` → \`active\`

**États possibles :** pending_approval / approved / active / offline / revoked

Une fois **active**, l'agent envoie des heartbeats toutes les 5 minutes.`,
  },

  /* ── AI Detection ── */
  {
    tags: ['ai', 'detection', 'modèle', 'model', 'ocsvm', 'svm', 'machine learning', 'ml', 'précision', 'recall', 'f1', 'feature', 'anomalie'],
    answer: `La page **AI Detection** (/model) affiche les métriques du moteur de détection.

**Métriques :**
- **Precision** — parmi les alertes levées, proportion de vraies menaces
- **Recall** — parmi les vraies menaces, proportion détectée
- **F1 Score** — moyenne harmonique Precision/Recall (meilleure mesure globale)
- **Anomaly Score** — score temps réel 0-100 (>70 = anomalie, >85 = haute confiance)

**Algorithme :** One-Class SVM entraîné sur le trafic normal — ne nécessite pas de données d'attaque labelisées.

**Feature Importance** — montre quelles caractéristiques réseau (taille packets, entropie, distribution ports) pèsent le plus dans les détections.

⚠️ Valeurs \`--\` = service IA non actif (port 9000). Démarrer \`ai-engine\` pour les remplir.`,
  },

  /* ── Pipeline / Stack Health ── */
  {
    tags: ['pipeline', 'stack', 'health', 'santé', 'elasticsearch', 'kibana', 'beat', 'beats', 'cluster', 'dégradé', 'down', 'rouge', 'vert'],
    answer: `La page **Stack Health** (/pipeline) surveille tous les composants du stack.

**Indicateurs :**
- **Elasticsearch** — vert/jaune/rouge, nb de nœuds, taille des index, vitesse d'ingestion
- **Filebeat / Packetbeat / Metricbeat** — statut par agent, nb d'events, dernier heartbeat
- **AI Engine** — disponibilité du service de détection (port 9000)
- **Ingestion Lag** — délai entre l'événement et son indexation
- **Queue Depth** — événements en attente (doit rester proche de 0)

**Interprétation :**
- Jaune ES = replica shard non assigné → normal sur cluster 1 nœud
- Rouge = ES inaccessible → vérifier réseau et espace disque
- Beat "No data" = agent non approuvé ou service arrêté`,
  },

  /* ── Reports ── */
  {
    tags: ['report', 'rapport', 'reports', 'rapports', 'export', 'télécharger', 'download', 'pdf', 'csv', 'executive', 'compliance'],
    answer: `La page **Reports** (/reports) génère des rapports depuis les données live d'Elasticsearch.

**Types de rapports :**
- **Executive Summary** — KPIs et posture de risque, pour le management
- **Technical Report** — liste complète des alertes avec IPs et tactiques, pour les analystes
- **Compliance Report** — mapping des détections aux contrôles ISO 27001 / NIST
- **Incident Report** — analyse détaillée d'un incident
- **Threat Intelligence** — liste IPs attaquantes, couverture MITRE, panorama des menaces

**Générer un rapport :**
1. Sélectionner le type (cliquer la carte)
2. Choisir la plage de dates
3. Cliquer **"Export Report"** → téléchargement immédiat en .txt

Les rapports générés pendant la session restent disponibles en bas de page pour re-téléchargement.`,
  },

  /* ── User Guide ── */
  {
    tags: ['guide', 'documentation', 'doc', 'aide', 'help', 'user guide', 'manuel'],
    answer: `Le **User Guide** (/guide) est la documentation complète de la plateforme.

Il couvre **12 sections** avec animations scroll-reveal :
Getting Started, SOC Overview, Alerts, Incidents, Telemetry Stream, Elastic Logs, Assets/Hosts, Agents, AI Detection, Stack Health, Reports, **Configuration**.

**Fonctionnalités :**
- **Recherche** en temps réel dans tout le guide
- **Accordéons** — cliquer une section pour la développer
- **NavPills** — navigation rapide entre sections (barre sticky)
- **Boutons "Open page"** — ouvrir directement la page depuis le guide

Chaque page de l'app possède aussi un bouton **?** (bas droite) qui ouvre un panneau d'aide contextuel.`,
  },

  /* ── Configuration ── */
  {
    tags: ['config', 'configuration', '.env', 'env', 'configurer', 'paramètre', 'setting', 'elasticsearch url', 'password', 'mot de passe', 'api key', 'secret', 'cors', 'redémarrer', 'restart', 'changer', 'modifier', 'elasticsearch password', 'changer mot de passe', 'changer elasticsearch'],
    answer: `La configuration se trouve dans **\`backend/.env\`**.

**Clés principales :**
\`\`\`
ELASTICSEARCH_URL=http://IP:9201
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=<mot_de_passe>
ELASTICSEARCH_API_KEY=          ← alternative au user/pass
ELASTICSEARCH_VERIFY_TLS=false  ← true si cert TLS valide
ADMIN_API_SECRET=<secret>       ← pour approuver les agents
CORS_ORIGINS=http://localhost:3000
NETSENTINEL_API_URL=http://127.0.0.1:8010
AI_SERVICE_URL=http://127.0.0.1:9000
NETSENTINEL_STORAGE_BACKEND=elastic  ← ou json (mode offline)
\`\`\`

**Après toute modification :** redémarrer le backend :
\`\`\`bash
fuser -k 8010/tcp
cd backend && ../.venv/bin/python3 -m uvicorn server:app --host 0.0.0.0 --port 8010
\`\`\`

Section **Configuration** du User Guide (/guide) pour le détail complet.`,
  },

  /* ── Theme ── */
  {
    tags: ['thème', 'theme', 'dark', 'light', 'mode sombre', 'nuit', 'jour', 'couleur'],
    answer: `Le **mode dark/light** se bascule avec l'icône **🌙/☀️** dans la TopBar (haut droite).

Le choix est sauvegardé automatiquement dans le localStorage — il persiste après rechargement de la page.`,
  },

  /* ── Login / Auth ── */
  {
    tags: ['login', 'connexion', 'authentification', 'mot de passe login', 'utilisateur', 'user', 'compte', 'register', 'inscription', 'déconnexion', 'logout', 'connecter', 'se connecter', 'comment se connecter', 'identifiant', 'email', 'password login'],
    answer: `**Connexion** : rendez-vous sur \`http://localhost:3000/login\`.

- Entrez votre email et mot de passe
- La session est maintenue via un token JWT stocké dans sessionStorage

**Déconnexion** : cliquer sur votre avatar (haut droite) → **Sign out**

**Inscription** : \`/register\` — créer un nouveau compte

**Mot de passe oublié** : \`/forgot\` — formulaire de récupération

L'accès admin (gestion agents, tokens) nécessite en plus le **secret admin** défini dans \`backend/.env\` sous \`ADMIN_API_SECRET\`.`,
  },

  /* ── Scope selector ── */
  {
    tags: ['scope', 'filtre global', 'profile', 'profil', 'all assets', 'tous les assets', 'filtrer'],
    answer: `Le **sélecteur de scope** (TopBar) filtre l'ensemble des dashboards :

- **All Assets** — données agrégées de tous les hosts
- **Profile** — filtre sur un groupe de machines (ex: serveurs web)
- **Asset** — filtre sur une machine précise

Ce filtre s'applique sur : SOC Overview, Alerts, Hosts, Stream et la plupart des KPIs.

Changer le scope met à jour toutes les pages en temps réel.`,
  },

  /* ── Elasticsearch ── */
  {
    tags: ['elasticsearch', 'elastic', 'es', 'index', 'cluster', 'connexion elastic', 'index pattern'],
    answer: `**Elasticsearch** est le moteur de stockage central de NetSentinel.

**Index utilisés :**
- \`filebeat-*\` — logs système et applicatifs
- \`packetbeat-*\` — flux réseau
- \`.ds-metricbeat-*\` — métriques CPU/RAM/disk
- \`ai-alerts-*\` — alertes générées par le moteur IA
- \`netsentinel-agent-enrollment-tokens\` — tokens d'enrollment
- \`netsentinel-agent-instances\` — instances d'agents

**Changer de cluster :** modifier \`ELASTICSEARCH_URL\`, \`ELASTICSEARCH_USERNAME\` et \`ELASTICSEARCH_PASSWORD\` dans \`backend/.env\`, puis redémarrer le backend.

La santé du cluster est visible sur la page **Stack Health** (/pipeline).`,
  },

  /* ── Boutons d'action ── */
  {
    tags: ['bouton', 'button', 'actions', 'que fait', 'à quoi sert', 'clique', 'cliquer', 'add', 'new', 'create', 'delete', 'supprimer'],
    answer: `**Récapitulatif des boutons principaux :**

**Alerts (/alerts)**
- "Acknowledge" → passe l'alerte en "Investigating"
- "Block IP" → bloque l'IP source via l'agent
- "Isolate Host" → coupe la machine du réseau
- Filtre sévérité → affiche seulement les alertes du niveau sélectionné

**Agents (/agents)**
- "New Token" → crée un token d'enrollment (nécessite le secret admin)
- "Approve" → active un agent en attente
- "Revoke" → révoque un agent actif

**Hosts (/hosts)**
- "Add Asset" → ajoute manuellement une machine à l'inventaire
- "Export CSV" → télécharge l'inventaire

**Reports (/reports)**
- "Export Report" → génère et télécharge le rapport
- ⬇ (liste session) → re-télécharger un rapport déjà généré

**TopBar**
- 🔔 "Mark all read" → marque toutes les notifs comme lues
- ← (sidebar) → réduire/agrandir la barre latérale`,
  },

  /* ── Données réelles vs mock ── */
  {
    tags: ['données', 'data', 'réelles', 'real', 'mock', 'fausses', 'fake', 'elasticsearch vide', 'sans données'],
    answer: `NetSentinel affiche des **données réelles** depuis Elasticsearch quand les agents sont actifs.

**Hiérarchie de fallback :**
- Si Elasticsearch répond et a des données → **données réelles**
- Si ES est vide → **données mock** (générées côté serveur pour la démonstration)
- Si le backend est inaccessible → la topbar passe en rouge (WifiOff)

**Pour avoir de vraies données :**
1. S'assurer que le cluster Elasticsearch est accessible (URL dans .env)
2. Déployer au moins un agent sur une machine (cf. page Agents)
3. Approuver l'agent → les Beats commencent à indexer

Les pages **Stack Health** et **AI Detection** affichent \`--\` pour les valeurs non disponibles.`,
  },
];

/* ─── Response engine ─────────────────────────────────────────────────────── */
function findAnswer(question) {
  const q = question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const scored = KB.map(entry => {
    const score = entry.tags.reduce((acc, tag) => {
      const t = tag.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (q.includes(t)) return acc + (t.length > 4 ? 3 : 1);
      return acc;
    }, 0);
    return { entry, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  return scored[0].entry.answer;
}

const FALLBACK = `Je n'ai pas trouvé de réponse précise à votre question.

Voici ce que je peux vous expliquer :
- **Pages** — SOC Overview, Alerts, Incidents, Stream, Logs, Hosts, Agents, AI Detection, Stack Health, Reports
- **Boutons** — actions sur les alertes, enrollment agents, export rapports
- **Configuration** — fichier backend/.env, connexion Elasticsearch
- **Agents** — cycle d'enrollment, installation, approbation
- **Notifications** — cloche, badges, mark as read

Essayez une question plus précise comme *"comment ajouter un agent ?"* ou *"à quoi sert le score d'anomalie ?"*`;

/* ─── Markdown renderer ───────────────────────────────────────────────────── */
function RenderMessage({ text }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Code block fence
        if (line.trim().startsWith('```')) return null;

        // Bullet
        if (line.startsWith('- ')) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
              <span>{renderInline(content)}</span>
            </div>
          );
        }

        // Numbered
        const numMatch = line.match(/^(\d+)\.\s(.+)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2">
              <span className="flex-shrink-0 font-mono opacity-60">{numMatch[1]}.</span>
              <span>{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="px-1 py-0.5 rounded text-[11px] bg-black/20 font-mono">{part.slice(1, -1)}</code>;
    return part;
  });
}

/* ─── Quick suggestions ───────────────────────────────────────────────────── */
const SUGGESTIONS = [
  "C'est quoi NetSentinel ?",
  "Comment ajouter un agent ?",
  "À quoi sert le score d'anomalie ?",
  "Comment générer un rapport ?",
  "Comment configurer Elasticsearch ?",
  "À quoi sert la cloche ?",
];

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'bot',
      text: `Bonjour ! Je suis l'assistant **NetSentinel AI**.\n\nJe connais toute la plateforme : pages, boutons, alertes, agents, configuration Elasticsearch…\n\nQue souhaitez-vous savoir ?`,
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized]);

  const reply = (question) => {
    const userMsg = { id: Date.now(), role: 'user', text: question, ts: new Date() };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const raw = findAnswer(question) || FALLBACK;
      setMessages(p => [...p, { id: Date.now() + 1, role: 'bot', text: raw, ts: new Date() }]);
      setTyping(false);
    }, 400 + Math.random() * 300);
  };

  const submit = () => { if (input.trim()) reply(input.trim()); };

  const showSuggestions = messages.length <= 1;

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-lg hover:shadow-primary/40 hover:scale-110 transition-all duration-200 flex items-center justify-center group"
          aria-label="Ouvrir l'assistant"
        >
          <Bot className="w-6 h-6 text-primary-foreground" />
          <span className="absolute right-16 bottom-1 bg-popover text-popover-foreground text-xs px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border">
            Assistant NetSentinel
          </span>
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 w-[380px] bg-card border border-border shadow-2xl rounded-2xl flex flex-col transition-all duration-300 overflow-hidden",
          minimized ? "h-14" : "h-[560px]"
        )}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border-b border-border flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-none">Assistant NetSentinel</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                Base de connaissance locale
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setMinimized(m => !m)}>
                {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className={cn("flex gap-2", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    {msg.role === 'bot' && (
                      <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[82%] px-3.5 py-2.5 rounded-2xl",
                      msg.role === 'user'
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted/60 border border-border/50 text-foreground rounded-bl-sm"
                    )}>
                      <RenderMessage text={msg.text} />
                      <p className="text-[10px] mt-1.5 opacity-40 text-right">
                        {msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {typing && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-muted/60 border border-border/50 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1 items-center">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick suggestions */}
                {showSuggestions && !typing && (
                  <div className="pt-1 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground px-1">Suggestions :</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => reply(s)}
                          className="px-2.5 py-1 rounded-full text-xs border border-border/60 bg-muted/30 hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-muted-foreground transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-3 pb-3 pt-2 border-t border-border flex-shrink-0">
                <div className="flex gap-2 items-center">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    placeholder="Posez votre question…"
                    className="flex-1 bg-muted/40 border border-border/60 rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-muted/60 transition-colors"
                  />
                  <Button
                    size="icon"
                    onClick={submit}
                    disabled={!input.trim() || typing}
                    className="w-9 h-9 rounded-xl flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
