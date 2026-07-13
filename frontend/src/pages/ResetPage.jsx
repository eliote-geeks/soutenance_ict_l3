import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Download, Lock, Trash2, ShieldAlert,
  ChevronRight, ChevronLeft, Check, Eye, EyeOff,
  Loader, Save, RefreshCw, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBackendBaseUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

const CONFIRM_WORD = 'RESET';

/* ─── Step indicator ─────────────────────────────────────────────────────── */
const STEPS = [
  { n: 1, label: 'Avertissement' },
  { n: 2, label: 'Sauvegarde'   },
  { n: 3, label: 'Authentification' },
  { n: 4, label: 'Confirmation' },
];

function StepBar({ current }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {STEPS.map((s, i) => {
        const done    = s.n < current;
        const active  = s.n === current;
        return (
          <div key={s.n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
                done   ? 'bg-destructive border-destructive text-white'
                : active ? 'bg-destructive/10 border-destructive text-destructive'
                : 'bg-muted/30 border-border text-muted-foreground'
              )}>
                {done ? <Check className="w-3.5 h-3.5" /> : s.n}
              </div>
              <span className={cn(
                'text-sm font-medium hidden sm:block',
                active ? 'text-foreground' : done ? 'text-destructive/70' : 'text-muted-foreground'
              )}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('w-8 h-0.5 rounded', done ? 'bg-destructive/50' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Card wrapper ───────────────────────────────────────────────────────── */
function Card({ children }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, subtitle, danger }) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-6 border-b border-border',
      danger && 'bg-destructive/5 border-destructive/20'
    )}>
      <div className={cn(
        'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0',
        danger ? 'bg-destructive/15 border border-destructive/30' : 'bg-warning/15 border border-warning/30'
      )}>
        <Icon className={cn('w-5 h-5', danger ? 'text-destructive' : 'text-warning')} />
      </div>
      <div>
        <h2 className={cn('text-lg font-bold', danger ? 'text-destructive' : 'text-foreground')}>{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ─── Step 1 — Avertissement ─────────────────────────────────────────────── */
function Step1({ onNext, onCancel }) {
  return (
    <Card>
      <CardHeader icon={ShieldAlert} title="Réinitialisation de l'application" subtitle="Lisez attentivement avant de continuer" danger />
      <div className="p-6 space-y-5">
        <div className="p-4 rounded-xl bg-destructive/8 border border-destructive/20 space-y-2">
          <p className="text-sm font-semibold text-destructive">Cette action va :</p>
          <ul className="space-y-2">
            {[
              'Supprimer le fichier de configuration backend/.env',
              'Déconnecter tous les agents actifs du backend',
              'Invalider tous les tokens d\'enrollment existants',
              'Effacer le secret admin — les agents ne pourront plus être approuvés',
              'Rediriger l\'application vers le wizard de configuration',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-xl bg-muted/30 border border-border text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Les données Elasticsearch ne sont pas supprimées.</strong>{' '}
          Logs, alertes et métriques restent intacts dans votre cluster. Seule la configuration locale de NetSentinel est effacée.
        </div>
      </div>
      <div className="flex justify-between p-6 pt-0 gap-3">
        <Button variant="outline" onClick={onCancel} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Annuler
        </Button>
        <Button variant="destructive" onClick={onNext} className="gap-2">
          Je comprends, continuer <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ─── Step 2 — Sauvegarde ─────────────────────────────────────────────────── */
function Step2({ config, onNext, onBack }) {
  const [saved, setSaved] = useState(false);

  const download = () => {
    const content = config.map(l => l.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netsentinel-backup-${new Date().toISOString().slice(0, 10)}.env`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <Card>
      <CardHeader icon={Save} title="Sauvegarde de la configuration" subtitle="Optionnel mais recommandé" />
      <div className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Téléchargez une copie de votre configuration avant de continuer.
          Vous pourrez la réutiliser lors du prochain wizard.
        </p>

        {config.length > 0 ? (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="px-4 py-2 bg-muted/50 border-b border-border/50 flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">backend/.env</span>
              <span className="text-xs text-muted-foreground/60">(valeurs sensibles masquées)</span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-border/30">
              {config.filter(l => l.key).map((line, i) => (
                <div key={i} className={cn('flex items-center gap-3 px-4 py-2 text-xs font-mono', i%2===0 ? 'bg-muted/10' : '')}>
                  <span className="text-primary font-semibold w-52 flex-shrink-0 truncate">{line.key}</span>
                  <span className="text-foreground/60 truncate">{line.value || '(vide)'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-muted/20 text-center text-sm text-muted-foreground">
            Aucun fichier .env trouvé — rien à sauvegarder.
          </div>
        )}

        <Button variant="outline" className="w-full gap-2" onClick={download} disabled={config.length === 0}>
          {saved
            ? <><Check className="w-4 h-4 text-success" /> Sauvegarde téléchargée</>
            : <><Download className="w-4 h-4" /> Télécharger la configuration</>
          }
        </Button>
      </div>
      <div className="flex justify-between p-6 pt-0 gap-3">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button variant="destructive" onClick={onNext} className="gap-2">
          {saved ? 'Continuer' : 'Ignorer et continuer'}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

/* ─── Step 3 — Authentification ──────────────────────────────────────────── */
function Step3({ onNext, onBack }) {
  const [secret, setSecret]   = useState('');
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const verify = async () => {
    if (!secret.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/setup/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_secret: secret, dry_run: true }),
      });
      if (res.status === 403) {
        setError('Secret admin incorrect. Vérifiez ADMIN_API_SECRET dans backend/.env.');
        return;
      }
      onNext(secret);
    } catch {
      setError('Backend inaccessible (port 8010). Vérifiez que le serveur est démarré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={Lock} title="Vérification des permissions" subtitle="Le secret admin est requis pour réinitialiser" />
      <div className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Entrez la valeur de{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">ADMIN_API_SECRET</code>{' '}
          définie dans <code className="bg-muted px-1.5 py-0.5 rounded text-xs">backend/.env</code>.
        </p>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Secret administrateur</label>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              placeholder="Votre secret admin…"
              value={secret}
              onChange={e => { setSecret(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && verify()}
              className={cn('pr-10 font-mono', error && 'border-destructive')}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShow(s => !s)}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between p-6 pt-0 gap-3">
        <Button variant="outline" onClick={onBack} disabled={loading} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button variant="destructive" onClick={verify} disabled={!secret.trim() || loading} className="gap-2">
          {loading
            ? <><Loader className="w-4 h-4 animate-spin" /> Vérification…</>
            : <>Vérifier le secret <ChevronRight className="w-4 h-4" /></>
          }
        </Button>
      </div>
    </Card>
  );
}

/* ─── Step 4 — Confirmation finale ──────────────────────────────────────── */
function Step4({ adminSecret, onBack }) {
  const navigate = useNavigate();
  const [typed, setTyped]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const execute = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/setup/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_secret: adminSecret }),
      });
      if (res.status === 403) {
        setError('Secret admin refusé par le serveur.');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
        setLoading(false);
        setTimeout(() => navigate('/setup'), 2500);
      } else {
        setError(data.detail || 'Erreur lors de la réinitialisation.');
        setLoading(false);
      }
    } catch {
      setError('Backend inaccessible. Vérifiez que le serveur est démarré.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center gap-6 p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-success/15 border-2 border-success/30 flex items-center justify-center">
            <Check className="w-10 h-10 text-success" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Configuration supprimée</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Le fichier .env a été supprimé. Redirection vers le wizard de configuration…
            </p>
          </div>
          <div className="w-56 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ animation: 'progress-fill 2.5s linear forwards', width: '0%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Redirection dans 2 secondes…</p>
        </div>
        <style>{`
          @keyframes progress-fill { from { width: 0% } to { width: 100% } }
        `}</style>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader icon={Trash2} title="Confirmation finale" subtitle="Action irréversible — lisez attentivement" danger />
      <div className="p-6 space-y-5">
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/25 text-center space-y-1">
          <p className="text-sm font-bold text-destructive">⚠ Dernière étape avant suppression</p>
          <p className="text-xs text-destructive/80">Le fichier backend/.env sera supprimé définitivement.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Tapez{' '}
            <code className="bg-destructive/10 text-destructive px-2 py-0.5 rounded font-mono font-bold text-sm">
              {CONFIRM_WORD}
            </code>{' '}
            pour confirmer
          </label>
          <Input
            value={typed}
            onChange={e => { setTyped(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && confirmed && execute()}
            placeholder={CONFIRM_WORD}
            className={cn(
              'font-mono text-center tracking-widest text-base',
              confirmed && 'border-destructive'
            )}
            autoFocus
          />
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between p-6 pt-0 gap-3">
        <Button variant="outline" onClick={onBack} disabled={loading} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Retour
        </Button>
        <Button
          variant="destructive"
          onClick={execute}
          disabled={!confirmed || loading}
          className="gap-2"
        >
          {loading
            ? <><Loader className="w-4 h-4 animate-spin" /> Réinitialisation…</>
            : <><Trash2 className="w-4 h-4" /> Réinitialiser définitivement</>
          }
        </Button>
      </div>
    </Card>
  );
}

/* ─── Page principale ────────────────────────────────────────────────────── */
export default function ResetPage() {
  const navigate = useNavigate();
  const [step, setStep]           = useState(1);
  const [config, setConfig]       = useState([]);
  const [adminSecret, setAdminSecret] = useState('');

  const loadConfig = async () => {
    try {
      const res  = await fetch(`${getBackendBaseUrl()}/api/setup/current-config`);
      const data = await res.json();
      setConfig(data.lines || []);
    } catch {
      setConfig([]);
    }
  };

  const goToStep = async (n) => {
    if (n === 2 && config.length === 0) await loadConfig();
    setStep(n);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Réinitialiser l'application</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Supprime la configuration locale et relance le wizard de démarrage
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ChevronLeft className="w-4 h-4" /> Retour
        </Button>
      </div>

      {/* Step bar */}
      <StepBar current={step} />

      {/* Step content — centered, max width */}
      <div className="max-w-2xl mx-auto">
        {step === 1 && <Step1 onNext={() => goToStep(2)} onCancel={() => navigate(-1)} />}
        {step === 2 && <Step2 config={config} onNext={() => goToStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3 onNext={(s) => { setAdminSecret(s); setStep(4); }} onBack={() => setStep(2)} />}
        {step === 4 && <Step4 adminSecret={adminSecret} onBack={() => setStep(3)} />}
      </div>
    </div>
  );
}
