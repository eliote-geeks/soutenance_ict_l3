import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle,
  Database,
  Globe,
  KeyRound,
  Plus,
  ScanLine,
  Shield,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { createDetectionRule, fetchModel } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const ruleMeta = {
  'SSH brute force': {
    icon: KeyRound,
    color: 'text-red-500',
    bg: 'bg-destructive/10 border-destructive/30',
    target: 'Tentatives SSH',
    condition: 'Plusieurs mots de passe SSH echouent depuis une meme IP.',
    thresholdKey: 'sshFailure',
    thresholdLabel: 'echecs',
  },
  'DNS burst anomaly': {
    icon: Globe,
    color: 'text-cyan-600',
    bg: 'bg-primary/10 border-primary/30',
    target: 'DNS suspect',
    condition: 'Le volume DNS sort du comportement attendu.',
    thresholdKey: 'dnsAnomaly',
    thresholdLabel: 'erreurs',
  },
  'Port scan': {
    icon: ScanLine,
    color: 'text-blue-600',
    bg: 'bg-cyan-500/10 border-cyan-500/30',
    target: 'Scan de ports',
    condition: 'Une IP contacte plusieurs ports differents en peu de temps.',
    thresholdKey: 'portScanDistinctPorts',
    thresholdLabel: 'ports',
  },
  'ML anomaly': {
    icon: Brain,
    color: 'text-violet-600',
    bg: 'bg-purple-500/10 border-purple-500/30',
    target: 'Anomalie ML',
    condition: 'Le modele ML detecte un comportement hors profil normal.',
    thresholdKey: 'minSamples',
    thresholdLabel: 'echantillons',
  },
};

export default function ModelPage() {
  const { scopeKey } = useScope();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    attack_type: 'Brute Force / SSH',
    field: 'title',
    operator: 'contains',
    value: '',
    severity: 'medium',
    enabled: true,
  });

  const loadData = async () => {
    setData(await fetchModel());
  };

  useEffect(() => {
    loadData()
      .catch((error) => console.error('Failed to load model data:', error))
      .finally(() => setLoading(false));
  }, [scopeKey]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.value.trim()) return;
    setSaving(true);
    try {
      await createDetectionRule(form);
      setForm((prev) => ({ ...prev, name: '', value: '' }));
      await loadData();
    } catch (error) {
      console.error('Failed to create detection rule:', error);
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const detectors = data?.detectors || [];
    return {
      rules: detectors.length,
      active: detectors.filter((rule) => Number(rule.matches || 0) > 0).length,
      signals: detectors.reduce((sum, rule) => sum + Number(rule.matches || 0), 0),
    };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">Regles de detection indisponibles.</CardContent>
      </Card>
    );
  }

  const detectors = data.detectors || [];
  const thresholds = data.thresholds || {};
  const ml = data.ml || {};
  const modelName = data.versions?.[0]?.version || 'hybrid-detection';

  const thresholdFor = (meta) => {
    if (meta.thresholdKey === 'minSamples') return ml.minSamples ?? '--';
    return thresholds[meta.thresholdKey] ?? '--';
  };

  return (
    <div className="space-y-5 animate-fade-in text-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Regles de detection</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Cette page montre comment NetSentinel AI transforme les logs Elastic en alertes et incidents.
          </p>
        </div>
        <Badge className="w-fit bg-primary/10 text-primary border-primary/20">
          {ml.enabled ? 'ML actif' : 'ML inactif'} · {modelName}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="font-mono text-2xl font-bold">{summary.rules}</div>
            <div className="mt-1 text-sm text-muted-foreground">detecteurs</div>
          </CardContent>
        </Card>
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-5">
            <div className="font-mono text-2xl font-bold">{summary.active}</div>
            <div className="mt-1 text-sm text-muted-foreground">actifs</div>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-5">
            <div className="font-mono text-2xl font-bold">{summary.signals}</div>
            <div className="mt-1 text-sm text-muted-foreground">signaux</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Database className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold">Entree</div>
              <div className="text-sm text-muted-foreground">Logs Filebeat, Packetbeat, Metricbeat et agents.</div>
            </div>
          </div>
          <ArrowRight className="hidden h-5 w-5 text-muted-foreground lg:block" />
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-warning/10 p-2 text-warning"><Shield className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold">Traitement</div>
              <div className="text-sm text-muted-foreground">Regles de securite + Isolation Forest.</div>
            </div>
          </div>
          <ArrowRight className="hidden h-5 w-5 text-muted-foreground lg:block" />
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-success/10 p-2 text-success"><CheckCircle className="h-4 w-4" /></div>
            <div>
              <div className="font-semibold">Sortie</div>
              <div className="text-sm text-muted-foreground">Alertes visibles, puis regroupement en incidents.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_1fr_0.7fr_auto] lg:items-end">
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Nom</span>
              <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: SSH root suspect" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Type</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.attack_type} onChange={(e) => setForm({ ...form, attack_type: e.target.value })}>
                <option>Brute Force / SSH</option>
                <option>Port Scan</option>
                <option>DoS / Connection Burst</option>
                <option>Lateral Movement</option>
                <option>DNS Tunnel / Anomaly</option>
                <option>DNS Anomaly</option>
                <option>Privilege Escalation</option>
                <option>ML Anomaly (Unknown)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Champ</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}>
                <option value="title">title</option>
                <option value="sourceIP">sourceIP</option>
                <option value="hostname">hostname</option>
                <option value="mitreTactic">mitreTactic</option>
                <option value="message">message</option>
                <option value="log.message">log.message</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Operateur</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="starts_with">starts_with</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Valeur</span>
              <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="ssh, dns, root..." />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase text-muted-foreground">Severite</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </label>
            <Button type="submit" size="sm" disabled={saving || !form.name.trim() || !form.value.trim()} className="h-9 gap-2">
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {detectors.map((detector) => {
          const meta = ruleMeta[detector.name] || ruleMeta['ML anomaly'];
          const Icon = meta.icon;
          const hits = Number(detector.matches || 0);
          return (
            <Card key={detector.name} className={cn('border', meta.bg)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('rounded-lg border bg-card p-2', meta.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">{detector.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{detector.custom ? detector.rule : meta.condition}</p>
                    </div>
                  </div>
                  <Badge className={hits > 0 ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}>
                    {detector.custom && !detector.enabled ? 'Inactive' : (hits > 0 ? 'Declenchee' : 'Calme')}
                  </Badge>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Surveille</div>
                    <div className="mt-1 text-xs font-medium">{detector.custom ? detector.attackType : meta.target}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Declenchement</div>
                    <div className="mt-1 font-mono text-xs font-semibold">
                      {thresholdFor(meta)} {meta.thresholdLabel}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Alertes</div>
                    <div className="mt-1 font-mono text-base font-bold">{hits}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/60">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold">Suite logique</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Une regle declenchee cree une alerte. Plusieurs alertes liees deviennent un incident a traiter.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild>
              <a href="/alerts"><AlertTriangle className="mr-2 h-4 w-4" />Voir Alertes</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/incidents">Voir Incidents</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
