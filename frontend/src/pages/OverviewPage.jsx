import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Activity, Shield, Server, Globe, Bot, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { TrafficChart } from '@/components/charts/TrafficChart';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { fetchOverview } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const Stat = ({ icon: Icon, label, value, tone = 'primary' }) => (
  <Card className="border-border/60 shadow-soft">
    <CardContent className="flex items-center gap-4 p-4">
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        tone === 'danger' && 'bg-destructive/10 text-destructive',
        tone === 'warning' && 'bg-warning/10 text-warning',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'primary' && 'bg-primary/10 text-primary'
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold font-mono leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </CardContent>
  </Card>
);

export default function OverviewPage() {
  const { scopeKey } = useScope();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchOverview();
        setData(result);
        setError('');
      } catch (error) {
        console.error('Failed to load overview data:', error);
        setError("Donnees indisponibles.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [scopeKey]);

  const threatLevel = useMemo(() => {
    const score = Number(data?.anomalyScore?.current || 0);
    if (score >= 75) return { label: 'Critique', className: 'text-destructive bg-destructive/10 border-destructive/20' };
    if (score >= 50) return { label: 'Eleve', className: 'text-warning bg-warning/10 border-warning/20' };
    return { label: 'Stable', className: 'text-success bg-success/10 border-success/20' };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingSkeleton variant="card" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <LoadingSkeleton key={i} variant="card" />)}
        </div>
        <LoadingSkeleton variant="chart" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const { kpis, trafficData = [], riskyHosts = [], attackingIPs = [], anomalyScore = {} } = data;
  const topHosts = riskyHosts.slice(0, 4);
  const topIps = attackingIPs.slice(0, 4);

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">NetSentinel AI</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span>Console SOC</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              <span>Elastic + Agents + IA</span>
            </div>
          </div>
        </div>
        <div className={cn('inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold', threatLevel.className)}>
          <Activity className="h-4 w-4" />
          Niveau {threatLevel.label}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={AlertTriangle} label="Alertes" value={kpis.totalAlerts} tone="warning" />
        <Stat icon={Activity} label="Anomalies IA" value={kpis.anomalies} tone="danger" />
        <Stat icon={Shield} label="Incidents ouverts" value={kpis.incidentsOpen} tone="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 border-border/60 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Trafic reseau</CardTitle>
            <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">Live</span>
          </CardHeader>
          <CardContent>
            <TrafficChart data={trafficData} height={300} />
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button asChild className="justify-start gap-2">
              <a href="/alerts"><AlertTriangle className="h-4 w-4" />Voir les alertes</a>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2">
              <a href="/agents"><Bot className="h-4 w-4" />Enroler un agent</a>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2">
              <a href="/hosts"><Server className="h-4 w-4" />Verifier les hosts</a>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2">
              <a href="/resolution"><ShieldCheck className="h-4 w-4" />Audit resolution</a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="border-border/60 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-warning" />
              Hosts a risque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topHosts.map((host) => (
              <div key={host.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{host.hostname}</div>
                  <div className="font-mono text-xs text-muted-foreground">{host.ip}</div>
                </div>
                <div className="flex items-center gap-3">
                  <SeverityBadge severity={host.criticality} showDot={false} />
                  <span className="font-mono text-lg font-bold">{host.riskScore}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-destructive" />
              Sources suspectes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topIps.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                <div>
                  <div className="font-mono font-medium">{item.ip}</div>
                  <div className="text-xs text-muted-foreground">{item.country}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-destructive">{item.attackCount}</div>
                  <div className="text-xs text-muted-foreground">alertes</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
