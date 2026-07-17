import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Activity, Shield, Globe, Network } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { TrafficChart } from '@/components/charts/TrafficChart';
import { fetchOverview } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const kpiStyles = {
  warning: 'border-warning/30 bg-warning/5 text-warning',
  danger: 'border-destructive/30 bg-destructive/5 text-destructive',
  primary: 'border-primary/30 bg-primary/5 text-primary',
  success: 'border-success/30 bg-success/5 text-success',
};

const Stat = ({ icon: Icon, label, value, tone = 'primary' }) => (
  <Card className={cn('border', kpiStyles[tone])}>
    <CardContent className="flex items-center justify-between p-5">
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-3 font-mono text-3xl font-bold text-foreground">{value}</div>
      </div>
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', kpiStyles[tone])}>
        <Icon className="h-6 w-6" />
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

  const threatTypes = useMemo(() => {
    const alerts = Number(data?.kpis?.totalAlerts || 0);
    const anomalies = Number(data?.kpis?.anomalies || 0);
    const incidents = Number(data?.kpis?.incidentsOpen || 0);
    return [
      { name: 'ML Anomaly', value: Math.max(anomalies, 1), color: 'hsl(var(--primary))' },
      { name: 'Incidents', value: Math.max(incidents, 1), color: 'hsl(var(--warning))' },
      { name: 'Alerts', value: Math.max(alerts, 1), color: 'hsl(var(--destructive))' },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="card" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <LoadingSkeleton key={i} variant="card" />)}
        </div>
        <LoadingSkeleton variant="chart" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const { kpis, trafficData = [], riskyHosts = [], attackingIPs = [] } = data;
  const topIps = attackingIPs.slice(0, 5);
  const suspiciousIps = attackingIPs.length;

  return (
    <div className="space-y-7 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SOC Overview</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Unified view of Filebeat, Packetbeat, fail2ban and AI detections
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Stat icon={AlertTriangle} label="Total Alerts" value={kpis.totalAlerts} tone="warning" />
        <Stat icon={Activity} label="Anomalies Detected" value={kpis.anomalies} tone="danger" />
        <Stat icon={Shield} label="Incidents" value={kpis.incidentsOpen} tone="primary" />
        <Stat icon={Globe} label="Suspicious IPs" value={suspiciousIps} tone="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-xl">Traffic Timeline (24h)</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Network activity by category</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-3 w-3 rounded-full bg-success" />
              Streaming
            </span>
          </CardHeader>
          <CardContent>
            <TrafficChart data={trafficData} height={360} />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Types d'attaques</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Distribution des signaux</p>
          </CardHeader>
          <CardContent>
            <div className="h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatTypes}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={72}
                    outerRadius={112}
                    paddingAngle={3}
                  >
                    {threatTypes.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {threatTypes.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Network className="h-5 w-5 text-destructive" />
            Top Attacking IPs
          </CardTitle>
          <span className="text-sm text-muted-foreground">Last 24h</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {topIps.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-5">
                <div>
                  <div className="font-mono text-lg font-semibold">{item.ip}</div>
                  <div className="text-sm text-muted-foreground">{item.country}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold text-destructive">{item.attackCount}</div>
                  <div className="text-sm text-muted-foreground">attacks</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {riskyHosts.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Hosts a risque</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {riskyHosts.slice(0, 3).map((host) => (
              <div key={host.id} className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="font-medium">{host.hostname}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{host.ip}</div>
                <div className="mt-3 font-mono text-xl font-bold">{host.riskScore}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
