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
  ScanLine,
  Shield,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchModel } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const ruleMeta = {
  'SSH brute force': {
    icon: KeyRound,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    target: 'Tentatives SSH',
    condition: 'Plusieurs mots de passe SSH echouent depuis une meme IP.',
    thresholdKey: 'sshFailure',
    thresholdLabel: 'echecs',
  },
  'DNS burst anomaly': {
    icon: Globe,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50 border-cyan-200',
    target: 'DNS suspect',
    condition: 'Le volume DNS sort du comportement attendu.',
    thresholdKey: 'dnsAnomaly',
    thresholdLabel: 'erreurs',
  },
  'Port scan': {
    icon: ScanLine,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    target: 'Scan de ports',
    condition: 'Une IP contacte plusieurs ports differents en peu de temps.',
    thresholdKey: 'portScanDistinctPorts',
    thresholdLabel: 'ports',
  },
  'ML anomaly': {
    icon: Brain,
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-200',
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

  useEffect(() => {
    const loadData = async () => {
      try {
        setData(await fetchModel());
      } catch (error) {
        console.error('Failed to load model data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [scopeKey]);

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
    <div className="space-y-7 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Moteur de detection</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Cette page montre comment NetSentinel AI transforme les logs Elastic en alertes et incidents.
          </p>
        </div>
        <Badge className="w-fit bg-primary/10 text-primary border-primary/20">
          {ml.enabled ? 'ML active' : 'ML inactive'} · {modelName}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5">
            <div className="font-mono text-3xl font-bold">{summary.rules}</div>
            <div className="mt-1 text-sm text-muted-foreground">regles configurees</div>
          </CardContent>
        </Card>
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-5">
            <div className="font-mono text-3xl font-bold">{summary.active}</div>
            <div className="mt-1 text-sm text-muted-foreground">regles declenchees maintenant</div>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-5">
            <div className="font-mono text-3xl font-bold">{summary.signals}</div>
            <div className="mt-1 text-sm text-muted-foreground">alertes produites</div>
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
                    <div className={cn('rounded-xl border bg-white p-3', meta.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{detector.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{meta.condition}</p>
                    </div>
                  </div>
                  <Badge className={hits > 0 ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'}>
                    {hits > 0 ? 'Declenchee' : 'Calme'}
                  </Badge>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Surveille</div>
                    <div className="mt-1 text-sm font-medium">{meta.target}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Declenchement</div>
                    <div className="mt-1 font-mono text-sm font-semibold">
                      {thresholdFor(meta)} {meta.thresholdLabel}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Alertes</div>
                    <div className="mt-1 font-mono text-lg font-bold">{hits}</div>
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
