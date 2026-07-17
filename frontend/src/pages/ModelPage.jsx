import { useEffect, useMemo, useState } from 'react';
import { Activity, Brain, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchModel } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';

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
      detectors: detectors.length,
      signals: detectors.reduce((sum, item) => sum + Number(item.matches || 0), 0),
      active: detectors.filter((item) => Number(item.matches || 0) > 0).length,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">Moteur IA indisponible.</CardContent>
      </Card>
    );
  }

  const detectors = data.detectors || [];
  const thresholds = data.thresholds || {};
  const ml = data.ml || {};

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Moteur IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">Detection par regles et anomalies reseau.</p>
        </div>
        <Badge className="w-fit bg-primary/10 text-primary border-primary/20">
          {ml.enabled ? 'ML actif' : 'ML inactif'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{summary.detectors}</div><div className="text-xs text-muted-foreground">Detecteurs</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{summary.active}</div><div className="text-xs text-muted-foreground">Actifs</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{summary.signals}</div><div className="text-xs text-muted-foreground">Signaux</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-border/60 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Detecteurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detectors.map((detector) => (
              <div key={detector.name} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <div>
                  <div className="font-medium">{detector.name}</div>
                  <div className="text-xs text-muted-foreground">{detector.rule}</div>
                </div>
                <div className="font-mono text-lg font-bold">{detector.matches}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4 text-warning" />
              Parametres
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Echecs SSH</span>
              <span className="font-mono">{thresholds.sshFailure ?? '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Anomalies DNS</span>
              <span className="font-mono">{thresholds.dnsAnomaly ?? '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Ports distincts</span>
              <span className="font-mono">{thresholds.portScanDistinctPorts ?? '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fenetre anti-doublon</span>
              <span className="font-mono">{data.dedupWindowMinutes ?? '--'} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Historique ML</span>
              <span className="font-mono">{ml.historyHours ?? '--'} h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-muted/20">
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-3">
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" />
            <span>Les regles detectent les attaques connues.</span>
          </div>
          <div className="flex gap-2">
            <Brain className="mt-0.5 h-4 w-4 text-primary" />
            <span>Le ML signale les comportements anormaux.</span>
          </div>
          <div className="flex gap-2">
            <Activity className="mt-0.5 h-4 w-4 text-success" />
            <span>Les alertes sont envoyees vers Alertes et Incidents.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
