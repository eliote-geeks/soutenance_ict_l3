import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, ChevronRight, Search, Bell, Shield, Activity,
  AlertTriangle, Cpu, BarChart2, FileText, Radio, Server,
  Users, Zap, CheckCircle, Info, Lightbulb, Terminal,
  Lock, Eye, Database, RefreshCw, Download, Bot,
  ArrowRight, Play, Settings, HelpCircle, Package
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ─── Guide data ──────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    id: 'start',
    icon: Play,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    label: 'Getting Started',
    route: null,
    summary: 'Login, navigate, understand the interface',
    content: [
      {
        type: 'steps',
        title: 'First steps',
        items: [
          { label: 'Login', desc: 'Go to http://127.0.0.1:3000, enter your credentials. Default admin: any email + password.' },
          { label: 'Explore the sidebar', desc: 'CORE section contains the main SOC pages. Use the collapse button (←) to gain space.' },
          { label: 'Set your scope', desc: 'In the top bar, choose "All Assets", a specific Profile, or a single Asset to filter all dashboards.' },
          { label: 'Check system status', desc: 'The green LIVE badge means the API is reachable. Orange means degraded.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'info',    text: 'All pages auto-refresh every 30 seconds. The "Just now" counter in the top bar shows last poll time.' },
          { type: 'tip',     text: 'Dark / Light mode: click the moon/sun icon in the top bar.' },
          { type: 'warning', text: 'The admin secret is required to manage agents and tokens. It is set in backend/.env under ADMIN_API_SECRET.' },
        ],
      },
    ],
  },
  {
    id: 'overview',
    icon: BarChart2,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
    label: 'SOC Overview',
    route: '/',
    summary: 'Security KPIs, risk map and incident summary',
    content: [
      {
        type: 'explain',
        title: 'What you see',
        items: [
          { label: 'Total Alerts', desc: 'Count of all detections currently in Elasticsearch (or mock data if ES is empty).' },
          { label: 'Anomaly Score', desc: 'Composite score 0–100 derived from alert severity, packet volume and log anomalies.' },
          { label: 'Mean Time to Detect', desc: 'Average minutes between event occurrence and alert creation.' },
          { label: 'Risky Hosts', desc: 'Top 5 hosts by risk score — computed from CPU, alert count and agent status.' },
          { label: 'Traffic Timeline', desc: 'Packetbeat flow events grouped by minute over the last hour.' },
          { label: 'Attacking IPs', desc: 'Source IPs appearing in the most critical alerts.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'info', text: 'Scope selector in the top bar filters ALL KPIs to a profile or specific asset.' },
          { type: 'tip',  text: 'Click an attacking IP to copy it. Use it in Alerts > Search to trace related events.' },
        ],
      },
    ],
  },
  {
    id: 'alerts',
    icon: Bell,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    border: 'border-destructive/20',
    label: 'Alerts',
    route: '/alerts',
    summary: 'Triage detections, run playbooks, block threats',
    content: [
      {
        type: 'explain',
        title: 'Alert fields',
        items: [
          { label: 'ID / Severity', desc: 'ALT-XXXXXX identifier + Critical / High / Medium / Low badge.' },
          { label: 'Status', desc: 'Open → Investigating → Resolved. Changes via Acknowledge button.' },
          { label: 'Source → Hostname', desc: 'Attack origin IP and targeted internal host.' },
          { label: 'MITRE Tactic', desc: 'ATT&CK kill-chain stage: Discovery, Credential Access, C2, etc.' },
          { label: 'Assignee', desc: 'SOC analyst responsible. Currently set per alert in mock data.' },
          { label: 'ETA', desc: 'Estimated resolution time.' },
        ],
      },
      {
        type: 'steps',
        title: 'Handling an alert',
        items: [
          { label: 'Click the alert row', desc: 'Opens the detail modal with full context.' },
          { label: 'Read the Playbook', desc: 'Step-by-step remediation instructions specific to the attack type.' },
          { label: 'Block IP', desc: 'Sends a block_ip command to the agent on the affected host.' },
          { label: 'Isolate Host', desc: 'Network-isolates the host — stops lateral movement.' },
          { label: 'Acknowledge', desc: 'Marks alert as Investigating and notifies the team.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'tip',     text: 'Use the filter bar to show only Critical+Open alerts — the highest priority queue.' },
          { type: 'warning', text: 'Block IP and Isolate Host require an active approved agent on the target host.' },
          { type: 'info',    text: 'Alert data comes from Elasticsearch ai-alerts-* index. If empty, mock data is shown.' },
        ],
      },
    ],
  },
  {
    id: 'incidents',
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/20',
    label: 'Incidents',
    route: '/incidents',
    summary: 'Group alerts into containment campaigns',
    content: [
      {
        type: 'explain',
        title: 'What is an incident?',
        items: [
          { label: 'Incident', desc: 'A named security event that groups one or more related alerts into a single investigation.' },
          { label: 'Timeline', desc: 'Chronological list of alerts belonging to the incident.' },
          { label: 'MITRE Coverage', desc: 'Bar chart showing which ATT&CK tactics were observed in this incident.' },
          { label: 'Affected Hosts', desc: 'Number of unique hosts touched by the incident.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'info',    text: 'Incidents are auto-derived from alerts. Each unique attack pattern generates one incident.' },
          { type: 'tip',     text: 'Click an incident in the left list to load its full details on the right.' },
          { type: 'warning', text: 'Currently read-only — manual incident creation and merging is on the roadmap.' },
        ],
      },
    ],
  },
  {
    id: 'stream',
    icon: Radio,
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
    label: 'Telemetry Stream',
    route: '/stream',
    summary: 'Live event feed from Packetbeat, Filebeat and agents',
    content: [
      {
        type: 'explain',
        title: 'Stream components',
        items: [
          { label: 'Events/sec chart', desc: 'Rolling 10-point chart of network events per second.' },
          { label: 'Bytes/sec chart',  desc: 'Rolling chart of bytes transferred.' },
          { label: 'Failed Logins',    desc: 'Count of authentication failures detected by Filebeat.' },
          { label: 'Live Event Feed',  desc: 'Scrolling list of the latest network events (source → dest, port, severity).' },
          { label: 'Pause / Resume',   desc: 'Pause buffers incoming events. Resume flushes buffer to feed.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'tip',  text: 'The feed auto-scrolls. Pause it to inspect specific events without losing them.' },
          { type: 'info', text: 'Data source priority: Packetbeat → Filebeat → mock events. Install agents to get real data.' },
        ],
      },
    ],
  },
  {
    id: 'logs',
    icon: Terminal,
    color: 'text-slate-400',
    bg: 'bg-slate-400/10',
    border: 'border-slate-400/20',
    label: 'Elastic Logs',
    route: '/logs',
    summary: 'Full-text log explorer with KQL-style filters',
    content: [
      {
        type: 'explain',
        title: 'How to use the explorer',
        items: [
          { label: 'Search bar', desc: 'Type any keyword — matches message, host, IP, user fields.' },
          { label: 'Filter chips', desc: 'Click a field value in a log row to pin it as a filter chip.' },
          { label: 'Source badge', desc: 'Shows which Elastic index the log came from (filebeat, packetbeat, agent).' },
          { label: 'Log level', desc: 'INFO / WARN / ERROR — colored for quick scanning.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'tip',     text: 'Multiple filter chips are AND-combined. Click the × on a chip to remove it.' },
          { type: 'info',    text: 'Logs come from filebeat-* index. Data appears once Filebeat is configured on an agent.' },
          { type: 'warning', text: 'No logs yet? Install an agent on a host with internet traffic and approve it.' },
        ],
      },
    ],
  },
  {
    id: 'hosts',
    icon: Server,
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    border: 'border-violet-400/20',
    label: 'Assets / Hosts',
    route: '/hosts',
    summary: 'Registered asset inventory + live Metricbeat hosts',
    content: [
      {
        type: 'explain',
        title: 'Two data sources merged',
        items: [
          { label: 'Registered assets (/api/assets)', desc: 'Hosts manually added via "Add Asset". Always visible even without an agent.' },
          { label: 'Live hosts (/api/hosts)',          desc: 'Hosts sending Metricbeat data — have real CPU/memory/risk scores.' },
          { label: 'Risk Score',    desc: '0–100 composite derived from CPU usage, memory pressure and active alert count.' },
          { label: 'Agent status',  desc: 'Missing = no agent / Installed = active agent sending beats data.' },
          { label: 'Last Seen',     desc: 'Timestamp of last heartbeat or Metricbeat event.' },
        ],
      },
      {
        type: 'steps',
        title: 'Adding a new host',
        items: [
          { label: 'Click "Add Asset"', desc: 'Fill hostname, IP, OS, role and site.' },
          { label: 'Go to Agents page', desc: 'Create an enrollment token linked to this asset.' },
          { label: 'Run install script', desc: 'Copy the sudo bash command and run it on the target host.' },
          { label: 'Approve in Agents', desc: 'Accept the pending agent — host becomes active within seconds.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'tip',  text: 'Export CSV downloads the current filtered list — useful for compliance audits.' },
          { type: 'info', text: 'Risk score 0 means no Metricbeat data yet — install and approve an agent to get live metrics.' },
        ],
      },
    ],
  },
  {
    id: 'agents',
    icon: Bot,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10',
    border: 'border-teal-400/20',
    label: 'Agents',
    route: '/agents',
    summary: 'Enroll, approve and manage endpoint agents',
    content: [
      {
        type: 'explain',
        title: 'Enrollment lifecycle',
        items: [
          { label: '1. Token created',      desc: 'Admin creates an enrollment token linked to an asset.' },
          { label: '2. Script run on host', desc: 'install-linux.sh or install-windows.ps1 uses the token to register.' },
          { label: '3. Pending approval',   desc: 'Agent waits in pending_approval state — visible in this page.' },
          { label: '4. Admin approves',     desc: 'Click Approve — agent receives Elasticsearch credentials.' },
          { label: '5. Active',             desc: 'Agent applies beats config, starts sending telemetry, sends heartbeats.' },
        ],
      },
      {
        type: 'steps',
        title: 'Creating a token',
        items: [
          { label: 'Click "New Token"', desc: 'Select an asset, set expiry (24h recommended for lab).' },
          { label: 'Enter admin secret', desc: 'The dialog will ask for your ADMIN_API_SECRET from backend/.env.' },
          { label: 'Copy the command', desc: 'The install command with token is shown — copy it to clipboard.' },
          { label: 'Run on target host', desc: 'Execute with sudo. Add NETSENTINEL_ALLOW_BASIC_AUTH=true for basic-auth setups.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'warning', text: 'Tokens expire. Create them just before running the install script.' },
          { type: 'tip',     text: 'Use --poll-interval 3 for faster approval during testing.' },
          { type: 'info',    text: 'The runtime service (netsentinel-agent-runtime) sends heartbeats every 5 minutes.' },
        ],
      },
    ],
  },
  {
    id: 'model',
    icon: Cpu,
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    border: 'border-pink-400/20',
    label: 'AI Detection',
    route: '/model',
    summary: 'Model metrics, feature importance and detection rules',
    content: [
      {
        type: 'explain',
        title: 'What the metrics mean',
        items: [
          { label: 'Precision',          desc: 'Of all alerts raised, how many were real threats. High = few false positives.' },
          { label: 'Recall',             desc: 'Of all real threats, how many were caught. High = few missed attacks.' },
          { label: 'F1 Score',           desc: 'Harmonic mean of Precision and Recall — overall model quality.' },
          { label: 'Feature Importance', desc: 'Which network/log features drive detections (ssh_failed_logins, port scan count, etc.).' },
          { label: 'Confusion Matrix',   desc: 'Shows matches per detection rule — how many real events triggered each rule.' },
          { label: 'Dedup Window',       desc: 'Time window to suppress duplicate alerts for the same signature.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'info',    text: 'Current mode is heuristic (rule-based). ML mode activates when the AI engine at port 9000 is running.' },
          { type: 'warning', text: '-- values mean no model is loaded. Deploy the ai-engine service to populate these metrics.' },
        ],
      },
    ],
  },
  {
    id: 'pipeline',
    icon: Activity,
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    border: 'border-green-400/20',
    label: 'Stack Health',
    route: '/pipeline',
    summary: 'Monitor beats, Elasticsearch and the AI service',
    content: [
      {
        type: 'explain',
        title: 'Service indicators',
        items: [
          { label: 'Ingestion Lag', desc: 'Delay between events occurring and being indexed in Elasticsearch.' },
          { label: 'Queue Depth',   desc: 'Events waiting to be processed. Should stay near 0 in healthy state.' },
          { label: 'Dropped Events', desc: 'Events lost due to backpressure. Non-zero means capacity issues.' },
          { label: 'Throughput',    desc: 'Events per second currently flowing through the pipeline.' },
          { label: 'Packetbeat / Filebeat / Metricbeat', desc: 'Status of each collector — Green=Healthy, Yellow=Degraded, Red=Down.' },
          { label: 'Elasticsearch', desc: 'Cluster health. Degraded = yellow cluster (replica unassigned).' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'tip',  text: 'Degraded Elasticsearch is normal on single-node clusters — all data is still available.' },
          { type: 'info', text: 'CPU 90%+ on a beat is expected during initial bulk indexing — it normalises after a few minutes.' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    icon: FileText,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    label: 'Reports',
    route: '/reports',
    summary: 'Generate and download security reports',
    content: [
      {
        type: 'explain',
        title: 'Report types',
        items: [
          { label: 'Executive Summary', desc: 'High-level overview of alert counts, top threats and risk posture. For management.' },
          { label: 'Technical Report',  desc: 'Full alert list with IPs, tactics, and recommended actions. For analysts.' },
          { label: 'Compliance Report', desc: 'Maps detections to compliance controls (ISO 27001, NIST). For auditors.' },
          { label: 'Incident Report',   desc: 'Detailed analysis of a specific incident timeline.' },
          { label: 'Threat Intelligence', desc: 'Attacking IP list, MITRE coverage and threat landscape summary.' },
        ],
      },
      {
        type: 'steps',
        title: 'Generating a report',
        items: [
          { label: 'Select report type', desc: 'Click the card for the type you need.' },
          { label: 'Set date range',     desc: 'Last 24h, 7 days, 30 days or custom.' },
          { label: 'Click Export',       desc: 'Report is generated from live data and downloaded immediately as .txt.' },
          { label: 'Re-download',        desc: 'Click the ⬇ icon next to any report in "Reports Generated This Session".' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'info', text: 'Scheduled reports (Weekly Executive, Daily Threat) are display-only for now — auto-send is on the roadmap.' },
          { type: 'tip',  text: 'Reports include your organisation header: University of Yaoundé I — Computer Science Dept. — Group P37.' },
        ],
      },
    ],
  },
  {
    id: 'config',
    icon: Settings,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10',
    border: 'border-gray-400/20',
    label: 'Configuration',
    route: null,
    summary: 'backend/.env — toutes les clés, leur rôle et comment les modifier',
    content: [
      {
        type: 'explain',
        title: 'Fichier de configuration',
        items: [
          { label: 'Emplacement', desc: 'backend/.env — à la racine du dossier backend. Créez-le s\'il n\'existe pas.' },
          { label: 'Chargement', desc: 'Chargé au démarrage du backend via python-dotenv. Tout changement nécessite un redémarrage.' },
          { label: 'Priorité', desc: 'Les variables d\'environnement système ont priorité sur le fichier .env.' },
          { label: 'Sécurité', desc: 'Ne jamais versionner ce fichier (.gitignore). Il contient des mots de passe et secrets.' },
        ],
      },
      {
        type: 'codeblock',
        title: 'Contenu complet du fichier backend/.env',
        language: 'env',
        code: `# ── Elasticsearch ──────────────────────────────────────────────
ELASTICSEARCH_URL=http://79.137.32.27:9201
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=<votre_mot_de_passe>
ELASTICSEARCH_API_KEY=                        # Laisser vide si user/pass utilisé
ELASTICSEARCH_VERIFY_TLS=false                # true si certificat TLS valide

# ── Indices Elasticsearch ──────────────────────────────────────
FILEBEAT_INDEX=filebeat-*
PACKETBEAT_INDEX=packetbeat-*
METRICBEAT_INDEX=.ds-metricbeat-*
AI_ALERTS_INDEX=ai-alerts-*
INGEST_AI_ALERTS_INDEX=ai-alerts-manual
AGENT_TOKENS_INDEX=netsentinel-agent-enrollment-tokens
AGENT_INSTANCES_INDEX=netsentinel-agent-instances

# ── API Backend ────────────────────────────────────────────────
NETSENTINEL_API_URL=http://127.0.0.1:8010
AI_SERVICE_URL=http://127.0.0.1:9000
ADMIN_API_SECRET=netsentinel-admin-dev-secret  # À CHANGER en production !
ALLOW_AGENT_BASIC_AUTH=true

# ── Frontend (CORS) ────────────────────────────────────────────
CORS_ORIGINS=http://localhost:3000

# ── Stockage ───────────────────────────────────────────────────
NETSENTINEL_STORAGE_BACKEND=elastic           # elastic | json
NETSENTINEL_TELEMETRY_BACKEND=elastic
STORAGE_JSON_PATH=./state/storage.json
TELEMETRY_JSON_PATH=./state/telemetry.json`,
      },
      {
        type: 'config',
        title: 'Référence de toutes les clés',
        items: [
          { key: 'ELASTICSEARCH_URL',           desc: 'URL complète du cluster ES. http ou https, avec le port (9200 par défaut, 9201 ici).' },
          { key: 'ELASTICSEARCH_USERNAME',      desc: 'Nom d\'utilisateur Elasticsearch. Valeur par défaut : elastic.' },
          { key: 'ELASTICSEARCH_PASSWORD',      desc: 'Mot de passe Elasticsearch. Généré à l\'installation ou défini dans kibana.' },
          { key: 'ELASTICSEARCH_API_KEY',       desc: 'Clé API ES (base64). Alternative au couple user/password. Laisser vide si non utilisée.' },
          { key: 'ELASTICSEARCH_VERIFY_TLS',    desc: 'false = accepte les certificats auto-signés. Mettre true en production avec un vrai cert.' },
          { key: 'FILEBEAT_INDEX',              desc: 'Pattern d\'index pour les logs Filebeat. Défaut : filebeat-*' },
          { key: 'PACKETBEAT_INDEX',            desc: 'Pattern d\'index pour les flux réseau Packetbeat. Défaut : packetbeat-*' },
          { key: 'METRICBEAT_INDEX',            desc: 'Pattern d\'index pour les métriques Metricbeat (data stream). Défaut : .ds-metricbeat-*' },
          { key: 'AI_ALERTS_INDEX',             desc: 'Index de lecture des alertes IA générées. Défaut : ai-alerts-*' },
          { key: 'INGEST_AI_ALERTS_INDEX',      desc: 'Index d\'écriture pour les alertes créées manuellement. Défaut : ai-alerts-manual' },
          { key: 'AGENT_TOKENS_INDEX',          desc: 'Index stockant les tokens d\'enrollment des agents.' },
          { key: 'AGENT_INSTANCES_INDEX',       desc: 'Index stockant les instances d\'agents (état, heartbeat, config).' },
          { key: 'NETSENTINEL_API_URL',         desc: 'URL publique du backend. Incluse dans la commande d\'installation des agents.' },
          { key: 'AI_SERVICE_URL',              desc: 'URL du micro-service Python IA (OCSVM). Port 9000 par défaut.' },
          { key: 'ADMIN_API_SECRET',            desc: 'En-tête secret (X-Admin-Secret) requis pour approuver des agents et créer des tokens.' },
          { key: 'ALLOW_AGENT_BASIC_AUTH',      desc: 'true = les agents peuvent s\'authentifier avec user/password ES en plus de la clé API.' },
          { key: 'CORS_ORIGINS',                desc: 'URL(s) du frontend autorisées à appeler l\'API. Séparer par virgule pour plusieurs origines.' },
          { key: 'NETSENTINEL_STORAGE_BACKEND', desc: 'elastic = données dans ES (prod). json = fichier local (mode hors-ligne/démo).' },
          { key: 'NETSENTINEL_TELEMETRY_BACKEND', desc: 'Même logique pour les données de télémétrie.' },
          { key: 'STORAGE_JSON_PATH',           desc: 'Chemin du fichier JSON si backend=json. Défaut : ./state/storage.json' },
          { key: 'TELEMETRY_JSON_PATH',         desc: 'Chemin du fichier JSON telemetry si backend=json.' },
        ],
      },
      {
        type: 'steps',
        title: 'Changer de cluster Elasticsearch',
        items: [
          { label: 'Ouvrir backend/.env', desc: 'Éditez le fichier avec n\'importe quel éditeur texte (nano, vim, VS Code).' },
          { label: 'Modifier ELASTICSEARCH_URL', desc: 'Exemple : ELASTICSEARCH_URL=http://192.168.1.100:9200' },
          { label: 'Mettre à jour les credentials', desc: 'Changez ELASTICSEARCH_USERNAME et ELASTICSEARCH_PASSWORD selon les identifiants du nouveau cluster.' },
          { label: 'Redémarrer le backend', desc: 'Tuez le processus uvicorn (Ctrl+C ou fuser -k 8010/tcp) puis relancez : cd backend && ../.venv/bin/python3 -m uvicorn server:app --host 0.0.0.0 --port 8010' },
          { label: 'Vérifier la connexion', desc: 'Ouvrez Stack Health (/pipeline) — Elasticsearch doit passer au vert.' },
        ],
      },
      {
        type: 'steps',
        title: 'Utiliser une API Key au lieu de user/password',
        items: [
          { label: 'Créer une API Key dans Kibana', desc: 'Kibana → Stack Management → API Keys → Create API Key. Copier la valeur encoded.' },
          { label: 'Coller dans .env', desc: 'ELASTICSEARCH_API_KEY=<valeur_base64_copiée>' },
          { label: 'Vider les champs user/pass', desc: 'ELASTICSEARCH_USERNAME= et ELASTICSEARCH_PASSWORD= (laisser vides).' },
          { label: 'Redémarrer le backend', desc: 'Le backend utilisera automatiquement la clé API si elle est définie.' },
        ],
      },
      {
        type: 'steps',
        title: 'Passer en mode hors-ligne (JSON)',
        items: [
          { label: 'Changer le backend de stockage', desc: 'NETSENTINEL_STORAGE_BACKEND=json et NETSENTINEL_TELEMETRY_BACKEND=json' },
          { label: 'Vérifier le chemin des fichiers', desc: 'STORAGE_JSON_PATH=./state/storage.json — le dossier state/ est créé automatiquement.' },
          { label: 'Redémarrer le backend', desc: 'Le backend lit et écrit dans les fichiers JSON locaux. Aucune connexion ES n\'est requise.' },
          { label: 'Repasser en mode elastic', desc: 'NETSENTINEL_STORAGE_BACKEND=elastic puis redémarrage.' },
        ],
      },
      {
        type: 'tips',
        items: [
          { type: 'warning', text: 'Tout changement dans backend/.env nécessite un redémarrage complet du backend — les variables ne se rechargent pas à chaud.' },
          { type: 'warning', text: 'Changez ADMIN_API_SECRET en production. La valeur par défaut (netsentinel-admin-dev-secret) est publique sur GitHub.' },
          { type: 'tip',     text: 'Pour plusieurs origines CORS : CORS_ORIGINS=http://localhost:3000,https://mon-domaine.com' },
          { type: 'info',    text: 'Si ELASTICSEARCH_VERIFY_TLS=false et que l\'URL est https://, les avertissements SSL sont supprimés côté Python.' },
        ],
      },
    ],
  },
];

/* ─── Animated section reveal hook ───────────────────────────────────────── */
function useVisible(ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return visible;
}

/* ─── Tip block ───────────────────────────────────────────────────────────── */
const TIP_STYLE = {
  tip:     { bg: 'bg-primary/10 border-primary/20',       text: 'text-primary',       Icon: Lightbulb },
  info:    { bg: 'bg-blue-500/10 border-blue-500/20',     text: 'text-blue-400',      Icon: Info },
  warning: { bg: 'bg-warning/10 border-warning/20',       text: 'text-warning',       Icon: AlertTriangle },
};

function TipBlock({ tip }) {
  const s = TIP_STYLE[tip.type || 'tip'];
  return (
    <div className={cn("flex gap-2.5 p-3 rounded-lg border text-sm", s.bg)}>
      <s.Icon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", s.text)} />
      <span className="text-foreground/80 leading-relaxed">{tip.text}</span>
    </div>
  );
}

/* ─── Section card ─────────────────────────────────────────────────────────── */
function SectionCard({ section, index, searchQuery }) {
  const ref = useRef(null);
  const visible = useVisible(ref);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const matchesSearch = !searchQuery ||
    section.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.content.some(block =>
      (block.items || []).some(i =>
        (i.label + ' ' + (i.desc || '') + (i.text || '') + (i.key || '')).toLowerCase().includes(searchQuery.toLowerCase())
      )
    );

  if (!matchesSearch) return null;

  const Icon = section.icon;

  return (
    <div
      id={`section-${section.id}`}
      ref={ref}
      className={cn(
        "rounded-2xl border bg-card shadow-card transition-all duration-500",
        section.border,
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      )}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-4 p-5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", section.bg)}>
          <Icon className={cn("w-5 h-5", section.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{section.label}</span>
            {section.route && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{section.route}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{section.summary}</p>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200", expanded && "rotate-90")} />
      </button>

      {/* Expanded content */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="px-5 pb-5 space-y-5 border-t border-border/50 pt-5">
          {section.content.map((block, bi) => (
            <div key={bi} className="space-y-3">
              {block.title && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{block.title}</h4>
              )}

              {block.type === 'steps' && (
                <div className="space-y-2">
                  {block.items.map((item, ii) => (
                    <div key={ii} className="flex gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                      <span className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5",
                        section.bg, section.color
                      )}>
                        {ii + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        {item.desc && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {block.type === 'explain' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {block.items.map((item, ii) => (
                    <div key={ii} className="p-3 rounded-lg bg-muted/30 border border-border/40 hover:border-border transition-colors">
                      <p className={cn("text-xs font-semibold mb-1", section.color)}>{item.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              {block.type === 'codeblock' && (
                <div className="rounded-lg overflow-hidden border border-border/60">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border/40">
                    <span className="text-xs font-mono text-muted-foreground">{block.language || 'bash'}</span>
                    <button
                      className="text-xs text-primary hover:text-primary/70 transition-colors"
                      onClick={() => navigator.clipboard?.writeText(block.code)}
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto bg-muted/20 text-foreground/80 whitespace-pre">
                    {block.code}
                  </pre>
                </div>
              )}

              {block.type === 'config' && (
                <div className="space-y-1.5 font-mono text-xs">
                  {block.items.map((item, ii) => (
                    <div key={ii} className="flex gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors">
                      <span className="text-primary font-semibold flex-shrink-0 w-60">{item.key}</span>
                      <span className="text-muted-foreground leading-relaxed font-sans">{item.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {block.type === 'tips' && (
                <div className="space-y-2">
                  {block.items.map((tip, ii) => <TipBlock key={ii} tip={tip} />)}
                </div>
              )}
            </div>
          ))}

          {section.route && (
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-2 mt-2", section.color)}
              onClick={() => navigate(section.route)}
            >
              Open {section.label}
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Quick nav pill ──────────────────────────────────────────────────────── */
function NavPill({ section, active }) {
  const Icon = section.icon;
  return (
    <a
      href={`#section-${section.id}`}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap",
        active
          ? cn("text-primary-foreground", section.bg.replace('/10', ''))
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", section.color)} />
      {section.label}
    </a>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function UserGuidePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('start');
  const heroRef = useRef(null);
  const heroVisible = useVisible(heroRef);

  useEffect(() => {
    const handler = () => {
      for (const s of SECTIONS) {
        const el = document.getElementById(`section-${s.id}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 180 && rect.bottom > 180) { setActiveSection(s.id); break; }
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const visibleCount = SECTIONS.filter(s =>
    !searchQuery ||
    s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.content.some(b => (b.items || []).some(i =>
      (i.label + ' ' + (i.desc || '') + (i.text || '') + (i.key || '')).toLowerCase().includes(searchQuery.toLowerCase())
    ))
  ).length;

  return (
    <div className="space-y-0 animate-fade-in">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div
        ref={heroRef}
        className={cn(
          "relative rounded-2xl overflow-hidden mb-8 transition-all duration-700",
          heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        )}
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--primary) / 0.04) 50%, transparent 100%)',
          border: '1px solid hsl(var(--primary) / 0.2)',
        }}
      >
        {/* Grid background */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

        <div className="relative p-8 md:p-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <Badge variant="outline" className="text-primary border-primary/30 text-xs mb-1">Documentation</Badge>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                NetSentinel AI
                <span className="text-primary"> User Guide</span>
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed mb-6">
            Complete reference for the NetSentinel AI SOC platform — from first login to agent deployment and threat response.
          </p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4">
            {[
              { icon: Package,  label: `${SECTIONS.length} sections` },
              { icon: Server,   label: 'Elasticsearch-backed' },
              { icon: Shield,   label: 'Heuristic + ML detection' },
              { icon: CheckCircle, label: 'Agent enrollment flow' },
            ].map((stat, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/60 border border-border/60 text-sm text-muted-foreground"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <stat.icon className="w-3.5 h-3.5 text-primary" />
                {stat.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search the guide... (e.g. alerts, agent, elasticsearch)"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 h-11 text-sm bg-card border-border/60"
        />
        {searchQuery && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {visibleCount} result{visibleCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Sticky nav ──────────────────────────────────────────────────── */}
      {!searchQuery && (
        <div className="sticky top-16 z-20 bg-background/80 backdrop-blur-md border border-border/50 rounded-xl mb-6 px-3 py-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {SECTIONS.map(s => (
              <NavPill key={s.id} section={s} active={activeSection === s.id} />
            ))}
          </div>
        </div>
      )}

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {SECTIONS.map((section, i) => (
          <SectionCard
            key={section.id}
            section={section}
            index={i}
            searchQuery={searchQuery}
          />
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {!searchQuery && (
        <div className="mt-10 p-6 rounded-2xl border border-border/50 bg-muted/20 text-center">
          <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Questions? Check <code className="bg-muted px-1.5 py-0.5 rounded text-xs">backend/.env</code> for configuration or open the <span className="text-primary font-medium">?</span> button on any page for contextual help.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            University of Yaoundé I · Computer Science Dept. · Group P37
          </p>
        </div>
      )}
    </div>
  );
}
