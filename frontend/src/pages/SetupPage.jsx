import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Database, Lock, Layers, CheckCircle,
  ChevronRight, ChevronLeft, Wifi, WifiOff,
  Eye, EyeOff, RefreshCw, Copy, Check, AlertTriangle,
  Info, Loader,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getBackendBaseUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PresentationSlides } from '@/components/shared/PresentationSlides';

/* ─── Steps config ───────────────────────────────────────────────────────── */
const STEPS = [
  { id: 'welcome',  label: 'Bienvenue',          icon: Shield   },
  { id: 'elastic',  label: 'Elasticsearch',       icon: Database },
  { id: 'security', label: 'Sécurité',            icon: Lock     },
  { id: 'indices',  label: 'Index Patterns',      icon: Layers   },
  { id: 'summary',  label: 'Récapitulatif',        icon: CheckCircle },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function generateSecret(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TipBox({ type = 'info', text }) {
  const styles = {
    info:    { bg: 'bg-blue-500/10 border-blue-500/20',    icon: Info,          cls: 'text-blue-400' },
    warning: { bg: 'bg-warning/10 border-warning/20',      icon: AlertTriangle, cls: 'text-warning'  },
    success: { bg: 'bg-success/10 border-success/20',      icon: CheckCircle,   cls: 'text-success'  },
  };
  const s = styles[type];
  const Icon = s.icon;
  return (
    <div className={cn('flex gap-2.5 p-3 rounded-lg border text-sm', s.bg)}>
      <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', s.cls)} />
      <span className="text-foreground/80 leading-relaxed">{text}</span>
    </div>
  );
}

/* ─── Step components ────────────────────────────────────────────────────── */

function StepWelcome({ onNext }) {
  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <PresentationSlides />
      </div>

      <div className="space-y-4">
        <TipBox type="info" text="La configuration sera sauvegardee dans backend/.env. Vous pourrez la modifier ensuite sans changer la logique de deploiement de l application." />

        <div className="flex justify-center">
          <Button size="lg" className="gap-2 px-8" onClick={onNext}>
            Demarrer la configuration
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepElastic({ values, onChange, onNext, onBack }) {
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const backend = getBackendBaseUrl();
      const res = await fetch(`${backend}/api/setup/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: values.elasticsearch_url,
          username: values.elasticsearch_username,
          password: values.elasticsearch_password,
          api_key: values.elasticsearch_api_key,
          verify_tls: values.elasticsearch_verify_tls,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Impossible de joindre le backend (port 8010).' });
    } finally {
      setTesting(false);
    }
  };

  const canNext = testResult?.ok;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" /> Connexion Elasticsearch
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Renseignez les informations de votre cluster.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Field label="URL du cluster" hint="Inclure le protocole et le port. Ex : http://192.168.1.10:9200">
            <Input
              placeholder="http://localhost:9200"
              value={values.elasticsearch_url}
              onChange={e => onChange('elasticsearch_url', e.target.value)}
            />
          </Field>
        </div>

        <Field label="Nom d'utilisateur" hint="Par défaut : elastic">
          <Input
            placeholder="elastic"
            value={values.elasticsearch_username}
            onChange={e => onChange('elasticsearch_username', e.target.value)}
          />
        </Field>

        <Field label="Mot de passe">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={values.elasticsearch_password}
              onChange={e => onChange('elasticsearch_password', e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(s => !s)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <div className="md:col-span-2">
          <Field label="API Key (optionnel)" hint="Alternative au couple nom d'utilisateur / mot de passe. Laisser vide si vous utilisez les identifiants ci-dessus.">
            <Input
              placeholder="VXNlcm5hbWU6UGFzc3dvcmQ="
              value={values.elasticsearch_api_key}
              onChange={e => onChange('elasticsearch_api_key', e.target.value)}
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <Field label="API Key agent (recommandé)" hint="Clé dédiée envoyée aux agents pour écrire les données Beats. Si vide, l'agent utilise l'API key ES principale ou le fallback autorisé.">
            <Input
              placeholder="Clé API Elasticsearch dédiée aux agents"
              value={values.agent_elastic_api_key}
              onChange={e => onChange('agent_elastic_api_key', e.target.value)}
            />
          </Field>
        </div>

        <div className="md:col-span-2 flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          <input
            type="checkbox"
            id="verify_tls"
            checked={values.elasticsearch_verify_tls}
            onChange={e => onChange('elasticsearch_verify_tls', e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <label htmlFor="verify_tls" className="text-sm text-foreground cursor-pointer">
            Vérifier le certificat TLS
            <span className="text-xs text-muted-foreground ml-2">(décocher pour les certificats auto-signés)</span>
          </label>
        </div>
      </div>

      {/* Test connection */}
      <div className="space-y-3">
        <Button
          variant="outline"
          className="gap-2 w-full"
          onClick={testConnection}
          disabled={!values.elasticsearch_url || testing}
        >
          {testing
            ? <><Loader className="w-4 h-4 animate-spin" /> Test en cours…</>
            : <><Wifi className="w-4 h-4" /> Tester la connexion</>
          }
        </Button>

        {testResult && (
          testResult.ok ? (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-success/10 border border-success/20">
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-success">Connexion réussie ✓</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Cluster : <strong>{testResult.cluster_name}</strong> · Elasticsearch {testResult.version}
                  {testResult.node_name && ` · Node : ${testResult.node_name}`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <WifiOff className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Échec de la connexion</p>
                <p className="text-muted-foreground text-xs mt-0.5">{testResult.error}</p>
              </div>
            </div>
          )
        )}
      </div>

      {!canNext && <TipBox type="info" text="Testez la connexion avant de continuer. Cela valide que NetSentinel peut atteindre votre cluster Elasticsearch." />}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Retour
        </Button>
        <Button onClick={onNext} disabled={!canNext} className="gap-2">
          Continuer <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StepSecurity({ values, onChange, onNext, onBack }) {
  const [copied, setCopied] = useState(false);

  const copySecret = () => {
    navigator.clipboard?.writeText(values.admin_api_secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" /> Sécurité & Accès
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Définissez le secret administrateur et les origines autorisées.</p>
      </div>

      <div className="space-y-5">
        <Field label="Secret administrateur (ADMIN_API_SECRET)" hint="Requis pour approuver des agents et créer des tokens d'enrollment. Gardez-le confidentiel.">
          <div className="flex gap-2">
            <Input
              value={values.admin_api_secret}
              onChange={e => onChange('admin_api_secret', e.target.value)}
              className="font-mono text-sm"
            />
            <Button variant="outline" size="icon" onClick={() => onChange('admin_api_secret', generateSecret())} title="Générer un secret aléatoire">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={copySecret} title="Copier">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </Field>

        <Field label="Origines CORS autorisées" hint="URL(s) du frontend autorisées à appeler l'API. Séparer par virgule pour plusieurs origines.">
          <Input
            placeholder="http://localhost:3000"
            value={values.cors_origins}
            onChange={e => onChange('cors_origins', e.target.value)}
          />
        </Field>

        <Field label="URL publique du backend (NETSENTINEL_API_URL)" hint="Incluse dans les commandes d'installation des agents. Doit être accessible depuis les machines cibles.">
          <Input
            placeholder={getBackendBaseUrl()}
            value={values.netsentinel_api_url}
            onChange={e => onChange('netsentinel_api_url', e.target.value)}
          />
        </Field>

        <Field label="URL du service IA (AI_SERVICE_URL)" hint="Service Python de détection (One-Class SVM). Port 9000 par défaut. Laisser la valeur par défaut si non déployé.">
          <Input
            placeholder="http://127.0.0.1:9000"
            value={values.ai_service_url}
            onChange={e => onChange('ai_service_url', e.target.value)}
          />
        </Field>
      </div>

      <TipBox type="warning" text="La valeur par défaut du secret admin est publique sur GitHub. Générez un secret aléatoire pour un déploiement en production." />

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button onClick={onNext} disabled={!values.admin_api_secret || !values.cors_origins} className="gap-2">
          Continuer <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StepIndices({ values, onChange, onNext, onBack }) {
  const DEFAULTS = {
    filebeat_index:      'filebeat-*',
    packetbeat_index:    'packetbeat-*',
    metricbeat_index:    '.ds-metricbeat-*',
    ai_alerts_index:     'ai-alerts-*',
    agent_tokens_index:  'netsentinel-agent-enrollment-tokens',
    agent_instances_index: 'netsentinel-agent-instances',
  };

  const reset = () => Object.entries(DEFAULTS).forEach(([k, v]) => onChange(k, v));

  const fields = [
    { key: 'filebeat_index',          label: 'Filebeat (logs)',         hint: 'Logs système et applicatifs.' },
    { key: 'packetbeat_index',        label: 'Packetbeat (réseau)',      hint: 'Flux réseau capturés.' },
    { key: 'metricbeat_index',        label: 'Metricbeat (métriques)',   hint: 'CPU, RAM, disque des agents.' },
    { key: 'ai_alerts_index',         label: 'Alertes IA',              hint: 'Index de lecture des alertes générées.' },
    { key: 'agent_tokens_index',      label: 'Tokens d\'enrollment',    hint: 'Tokens d\'inscription des agents.' },
    { key: 'agent_instances_index',   label: 'Instances d\'agents',     hint: 'État, heartbeat et config des agents.' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" /> Index Patterns
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Noms des index Elasticsearch. Les valeurs par défaut conviennent à une installation standard.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 flex-shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Réinitialiser
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(f => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input
              value={values[f.key]}
              onChange={e => onChange(f.key, e.target.value)}
              className="font-mono text-sm"
            />
          </Field>
        ))}
      </div>

      <TipBox type="info" text="Ne modifiez ces valeurs que si vos index Elasticsearch portent des noms personnalisés. Les wildcards (*) sont supportés." />

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button onClick={onNext} className="gap-2">Voir le récapitulatif <ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

function StepSummary({ values, onBack, onFinish, finishing, error }) {
  const rows = [
    { label: 'Elasticsearch URL',       value: values.elasticsearch_url },
    { label: 'Nom d\'utilisateur ES',   value: values.elasticsearch_username },
    { label: 'Mot de passe ES',         value: '•'.repeat(Math.min(values.elasticsearch_password.length, 12)) || '(vide)' },
    { label: 'API Key ES',              value: values.elasticsearch_api_key ? '••••••' + values.elasticsearch_api_key.slice(-4) : '(non définie)' },
    { label: 'API Key agent',           value: values.agent_elastic_api_key ? '••••••' + values.agent_elastic_api_key.slice(-4) : '(fallback)' },
    { label: 'Vérifier TLS',            value: values.elasticsearch_verify_tls ? 'Oui' : 'Non' },
    { label: 'Secret admin',            value: '•'.repeat(Math.min(values.admin_api_secret.length, 16)) },
    { label: 'CORS Origins',            value: values.cors_origins },
    { label: 'URL backend',             value: values.netsentinel_api_url },
    { label: 'URL service IA',          value: values.ai_service_url },
    { label: 'Index Filebeat',          value: values.filebeat_index },
    { label: 'Index Packetbeat',        value: values.packetbeat_index },
    { label: 'Index Metricbeat',        value: values.metricbeat_index },
    { label: 'Index Alertes IA',        value: values.ai_alerts_index },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-primary" /> Récapitulatif
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Vérifiez la configuration avant de finaliser.</p>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden">
        {rows.map((row, i) => (
          <div key={i} className={cn(
            'flex items-center justify-between px-4 py-2.5 text-sm',
            i % 2 === 0 ? 'bg-muted/20' : 'bg-transparent',
          )}>
            <span className="text-muted-foreground font-medium w-44 flex-shrink-0">{row.label}</span>
            <span className="font-mono text-foreground text-right break-all">{row.value}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <TipBox type="info" text="La configuration sera sauvegardée dans backend/.env. Un redémarrage du backend sera nécessaire pour que tous les changements prennent effet." />

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={finishing} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Retour
        </Button>
        <Button onClick={onFinish} disabled={finishing} className="gap-2 px-6">
          {finishing
            ? <><Loader className="w-4 h-4 animate-spin" /> Enregistrement…</>
            : <><CheckCircle className="w-4 h-4" /> Terminer la configuration</>
          }
        </Button>
      </div>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────────────────── */
export default function SetupPage() {
  const navigate = useNavigate();
  const backend = getBackendBaseUrl();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);

  const [values, setValues] = useState({
    elasticsearch_url: '',
    elasticsearch_username: 'elastic',
    elasticsearch_password: '',
    elasticsearch_api_key: '',
    agent_elastic_api_key: '',
    elasticsearch_verify_tls: false,
    admin_api_secret: generateSecret(32),
    cors_origins: 'http://localhost:3000',
    netsentinel_api_url: backend,
    ai_service_url: 'http://127.0.0.1:9000',
    filebeat_index: 'filebeat-*',
    packetbeat_index: 'packetbeat-*',
    metricbeat_index: '.ds-metricbeat-*',
    ai_alerts_index: 'ai-alerts-*',
    agent_tokens_index: 'netsentinel-agent-enrollment-tokens',
    agent_instances_index: 'netsentinel-agent-instances',
  });

  const set = (key, val) => setValues(v => ({ ...v, [key]: val }));

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      const res = await fetch(`${backend}/api/setup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.ok) {
        navigate('/login');
      } else {
        setFinishError(data.detail || 'Erreur lors de la sauvegarde.');
      }
    } catch {
      setFinishError('Impossible de joindre le backend. Vérifiez qu\'il est démarré sur le port 8010.');
    } finally {
      setFinishing(false);
    }
  };

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className={cn('w-full', step === 0 ? 'max-w-5xl' : 'max-w-2xl')}>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done    = i < step;
            const current = i === step;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  'w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-300',
                  done    ? 'bg-primary border-primary text-primary-foreground'
                  : current ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-muted/30 border-border text-muted-foreground',
                )}>
                  {done
                    ? <Check className="w-4 h-4" />
                    : <Icon className="w-4 h-4" />
                  }
                </div>
                <span className={cn(
                  'text-xs font-medium hidden sm:block',
                  current ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn('w-6 h-0.5 rounded mx-1', done ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className={cn(
          'bg-card border border-border rounded-2xl shadow-2xl',
          step === 0 ? 'p-6 md:p-8' : 'p-8',
        )}>
          {step === 0 && <StepWelcome  onNext={next} />}
          {step === 1 && <StepElastic  values={values} onChange={set} onNext={next} onBack={back} />}
          {step === 2 && <StepSecurity values={values} onChange={set} onNext={next} onBack={back} />}
          {step === 3 && <StepIndices  values={values} onChange={set} onNext={next} onBack={back} />}
          {step === 4 && (
            <StepSummary
              values={values}
              onBack={back}
              onFinish={finish}
              finishing={finishing}
              error={finishError}
            />
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          University of Yaoundé I · Computer Science Dept. · Group P37
        </p>
      </div>
    </div>
  );
}
