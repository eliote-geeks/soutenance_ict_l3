import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Download, Lock, Trash2,
  ChevronRight, ChevronLeft, X, Check,
  ShieldAlert, Eye, EyeOff, Loader, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const BACKEND = 'http://127.0.0.1:8010';

/* ─── Step indicator pill ─────────────────────────────────────────────────── */
function StepDot({ n, current, done }) {
  return (
    <div className={cn(
      'w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all',
      done    ? 'bg-destructive border-destructive text-white'
      : current ? 'bg-destructive/10 border-destructive text-destructive'
      : 'bg-muted/40 border-border text-muted-foreground'
    )}>
      {done ? <Check className="w-3 h-3" /> : n}
    </div>
  );
}

/* ─── Modal shell — rendered via portal directly into document.body ───────── */
function Modal({ children, onClose }) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={e => { e.stopPropagation(); onClose(); }}
      />
      {/* Panel — stopPropagation prevents clicks bubbling through React portal tree */}
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in"
        style={{ zIndex: 100000 }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ─── STEP 1 — Avertissement ─────────────────────────────────────────────── */
function Step1Warning({ onNext, onClose }) {
  return (
    <>
      <div className="p-6 border-b border-border flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Réinitialiser l'application</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Étape 1 sur 4 — Avertissement</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        {/* Steps row */}
        <div className="flex items-center gap-2 justify-center">
          {[1,2,3,4].map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot n={n} current={n===1} done={false} />
              {i < 3 && <div className="w-8 h-0.5 bg-border rounded" />}
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-destructive/8 border border-destructive/25 space-y-3">
          <p className="text-sm font-semibold text-destructive flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Action irréversible
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed">
            Cette opération va <strong>supprimer le fichier de configuration</strong>{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">backend/.env</code> et
            relancer le wizard de configuration depuis le début.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conséquences</p>
          {[
            'La connexion Elasticsearch sera perdue — les pages afficheront des données mock.',
            'Tous les agents actifs perdront leur connexion au backend.',
            'Les tokens d\'enrollment seront invalidés.',
            'Le secret admin sera effacé — les agents ne pourront plus être approuvés.',
            'Le frontend redirigera automatiquement vers le wizard de configuration.',
          ].map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start text-sm text-foreground/75">
              <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-border flex justify-between">
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button variant="destructive" onClick={onNext} className="gap-2">
          Je comprends, continuer <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}

/* ─── STEP 2 — Sauvegarde ─────────────────────────────────────────────────── */
function Step2Backup({ config, onNext, onBack, onClose }) {
  const [saved, setSaved] = useState(false);

  const downloadConfig = () => {
    const content = config.map(l => l.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netsentinel-config-backup-${new Date().toISOString().slice(0,10)}.env`;
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <>
      <div className="p-6 border-b border-border flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center flex-shrink-0">
            <Save className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Sauvegarde de la configuration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Étape 2 sur 4 — Backup</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center gap-2 justify-center">
          {[1,2,3,4].map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot n={n} current={n===2} done={n<2} />
              {i < 3 && <div className={cn('w-8 h-0.5 rounded', n < 2 ? 'bg-destructive/40' : 'bg-border')} />}
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Nous vous recommandons de <strong>sauvegarder votre configuration actuelle</strong> avant de réinitialiser.
          Vous pourrez la réutiliser lors de la prochaine configuration.
        </p>

        {/* Config preview */}
        {config.length > 0 ? (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b border-border/50 text-xs font-mono text-muted-foreground">
              backend/.env (valeurs sensibles masquées)
            </div>
            <div className="max-h-48 overflow-y-auto">
              {config.filter(l => l.key).map((line, i) => (
                <div key={i} className={cn('flex items-center gap-3 px-3 py-1.5 text-xs font-mono', i%2===0 ? 'bg-muted/15' : '')}>
                  <span className="text-primary font-semibold w-48 flex-shrink-0 truncate">{line.key}</span>
                  <span className="text-foreground/70 truncate">{line.value || '(vide)'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-muted/30 text-sm text-muted-foreground text-center">
            Aucun fichier .env trouvé — rien à sauvegarder.
          </div>
        )}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={downloadConfig}
        >
          {saved
            ? <><Check className="w-4 h-4 text-success" /> Sauvegarde téléchargée</>
            : <><Download className="w-4 h-4" /> Télécharger la configuration (.env)</>
          }
        </Button>
      </div>

      <div className="p-4 border-t border-border flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button variant="destructive" onClick={onNext} className="gap-2">
          {saved ? 'Continuer' : 'Ignorer et continuer'}
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}

/* ─── STEP 3 — Vérification admin ────────────────────────────────────────── */
function Step3Auth({ onNext, onBack, onClose }) {
  const [secret, setSecret] = useState('');
  const [show, setShow]     = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    if (!secret.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Dry-run: call reset with a flag — we just verify the secret is accepted
      const res = await fetch(`${BACKEND}/api/setup/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_secret: secret, dry_run: true }),
      });
      if (res.status === 403) {
        setError('Secret admin incorrect. Vérifiez la valeur dans backend/.env.');
        return;
      }
      // 200 or anything else → accepted (or we proceed with the secret stored)
      onNext(secret);
    } catch {
      // Can't reach backend — accept the secret anyway (will fail at final step)
      onNext(secret);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="p-6 border-b border-border flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Vérification des permissions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Étape 3 sur 4 — Authentification</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center gap-2 justify-center">
          {[1,2,3,4].map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot n={n} current={n===3} done={n<3} />
              {i < 3 && <div className={cn('w-8 h-0.5 rounded', n < 3 ? 'bg-destructive/40' : 'bg-border')} />}
            </div>
          ))}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          La réinitialisation nécessite le <strong>secret administrateur</strong>.
          C'est la valeur de <code className="bg-muted px-1.5 py-0.5 rounded text-xs">ADMIN_API_SECRET</code> dans votre fichier <code className="bg-muted px-1.5 py-0.5 rounded text-xs">backend/.env</code>.
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Secret admin</label>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              placeholder="netsentinel-admin-dev-secret"
              value={secret}
              onChange={e => { setSecret(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && verify()}
              className={cn('pr-10', error && 'border-destructive')}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShow(s => !s)}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <div className="p-4 border-t border-border flex justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Retour</Button>
        <Button
          variant="destructive"
          onClick={verify}
          disabled={!secret.trim() || loading}
          className="gap-2"
        >
          {loading ? <><Loader className="w-4 h-4 animate-spin" /> Vérification…</> : <>Vérifier <ChevronRight className="w-4 h-4" /></>}
        </Button>
      </div>
    </>
  );
}

/* ─── STEP 4 — Confirmation finale ───────────────────────────────────────── */
const CONFIRM_WORD = 'RESET';

function Step4Confirm({ adminSecret, onBack, onClose }) {
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
      const res = await fetch(`${BACKEND}/api/setup/reset`, {
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
        setSuccess(true);      // afficher l'écran succès
        setLoading(false);
        setTimeout(() => navigate('/setup'), 2000);
      } else {
        setError(data.detail || 'Erreur lors de la réinitialisation.');
        setLoading(false);
      }
    } catch {
      setError('Impossible de joindre le backend (port 8010).');
      setLoading(false);
    }
  };

  /* ── Écran succès ── */
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
          <Check className="w-8 h-8 text-success" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">Configuration supprimée</p>
          <p className="text-sm text-muted-foreground mt-1">Redirection vers le wizard de configuration…</p>
        </div>
        <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-[grow_2s_ease-in-out_forwards]"
            style={{ animation: 'width 2s linear forwards', width: '0%' }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Vous allez être redirigé dans 2 secondes…</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 border-b border-destructive/30 bg-destructive/5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 border border-destructive/40 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="font-bold text-destructive">Confirmation finale</h2>
            <p className="text-xs text-destructive/70 mt-0.5">Étape 4 sur 4 — Irréversible</p>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center gap-2 justify-center">
          {[1,2,3,4].map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot n={n} current={n===4} done={n<4} />
              {i < 3 && <div className="w-8 h-0.5 bg-destructive/40 rounded" />}
            </div>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center space-y-1">
          <p className="text-sm font-bold text-destructive">⚠ Cette action est irréversible</p>
          <p className="text-xs text-destructive/80">Le fichier .env sera supprimé et l'app redirigée vers le wizard.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Tapez <code className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono font-bold">{CONFIRM_WORD}</code> pour confirmer
          </label>
          <Input
            value={typed}
            onChange={e => { setTyped(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && confirmed && execute()}
            placeholder={CONFIRM_WORD}
            className={cn(
              'font-mono text-center tracking-widest text-base',
              confirmed ? 'border-destructive focus-visible:ring-destructive/30' : ''
            )}
            autoFocus
          />
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-border flex justify-between">
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
    </>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function ResetAppDialog({ trigger }) {
  const [open, setOpen]           = useState(false);
  const [step, setStep]           = useState(1);
  const [config, setConfig]       = useState([]);
  const [adminSecret, setAdminSecret] = useState('');

  const openDialog = async () => {
    setStep(1);
    setAdminSecret('');
    // Pre-fetch config for step 2 backup display
    try {
      const res  = await fetch(`${BACKEND}/api/setup/current-config`);
      const data = await res.json();
      setConfig(data.lines || []);
    } catch {
      setConfig([]);
    }
    setOpen(true);
  };

  const close = () => setOpen(false);

  return (
    <>
      <div onClick={openDialog}>{trigger}</div>

      {open && (
        <Modal onClose={close}>
          {step === 1 && <Step1Warning onNext={() => setStep(2)} onClose={close} />}
          {step === 2 && <Step2Backup  config={config} onNext={() => setStep(3)} onBack={() => setStep(1)} onClose={close} />}
          {step === 3 && <Step3Auth    onNext={(s) => { setAdminSecret(s); setStep(4); }} onBack={() => setStep(2)} onClose={close} />}
          {step === 4 && <Step4Confirm adminSecret={adminSecret} onBack={() => setStep(3)} onClose={close} />}
        </Modal>
      )}
    </>
  );
}

export default ResetAppDialog;
