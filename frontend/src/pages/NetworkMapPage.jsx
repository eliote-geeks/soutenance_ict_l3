import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Globe2, Monitor, Network, Server, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchAlerts, fetchHosts, fetchStream } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';

const short = (value, fallback = 'unknown') => String(value || fallback).slice(0, 22);

export default function NetworkMapPage() {
  const { scopeKey } = useScope();
  const [data, setData] = useState({ hosts: [], alerts: [], events: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [hostsResult, alertsResult, streamResult] = await Promise.all([
          fetchHosts(),
          fetchAlerts(),
          fetchStream(),
        ]);
        setData({
          hosts: hostsResult.hosts || [],
          alerts: alertsResult.alerts || [],
          events: streamResult.events || [],
        });
      } catch (error) {
        console.error('Failed to load network map:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [scopeKey]);

  const graph = useMemo(() => {
    const hosts = data.hosts.slice(0, 8);
    const alertSources = [...new Map(data.alerts
      .filter((alert) => alert.sourceIP && alert.sourceIP !== 'unknown')
      .map((alert) => [alert.sourceIP, alert])).values()].slice(0, 8);
    const flows = data.events.slice(0, 10);
    return { hosts, alertSources, flows };
  }, [data]);

  if (loading) {
    return <LoadingSkeleton variant="chart" className="h-[520px]" />;
  }

  return (
    <div className="space-y-5 animate-fade-in text-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carte reseau</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Topologie deduite des hosts, flux et alertes recus par le backend.
          </p>
        </div>
        <Badge className="bg-primary/10 text-primary border-primary/20">
          {graph.hosts.length} hosts · {graph.alertSources.length} sources
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid min-h-[430px] grid-cols-[1fr_1.1fr_1fr] gap-4">
            <div className="space-y-2">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Globe2 className="h-4 w-4 text-destructive" /> Sources suspectes
              </div>
              {graph.alertSources.map((alert) => (
                <div key={alert.sourceIP} className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2">
                  <div className="font-mono text-xs text-destructive">{alert.sourceIP}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{alert.title}</div>
                </div>
              ))}
              {graph.alertSources.length === 0 && (
                <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">Aucune source suspecte.</div>
              )}
            </div>

            <div className="relative rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="absolute left-4 right-4 top-1/2 border-t border-dashed border-primary/30" />
              <div className="relative mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/40 bg-background text-primary">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <div className="text-base font-semibold">NetSentinel AI</div>
                  <div className="text-xs text-muted-foreground">API · Elasticsearch · IA</div>
                </div>
                <div className="grid w-full grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-lg border border-border bg-card p-2">{data.alerts.length}<br />alertes</div>
                  <div className="rounded-lg border border-border bg-card p-2">{data.events.length}<br />flux</div>
                  <div className="rounded-lg border border-border bg-card p-2">{data.hosts.length}<br />hosts</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Server className="h-4 w-4 text-primary" /> Hosts surveilles
              </div>
              {graph.hosts.map((host) => (
                <div key={host.id || host.hostname} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Monitor className="h-4 w-4 text-primary" />
                      <span className="truncate text-xs font-semibold">{short(host.hostname)}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{host.status || 'online'}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{short(host.ip)}</div>
                </div>
              ))}
              {graph.hosts.length === 0 && (
                <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">Aucun host detecte.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Network className="h-4 w-4 text-primary" /> Derniers flux
            </div>
            <div className="space-y-2">
              {graph.flows.slice(0, 6).map((event) => (
                <div key={event.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                  <span className="truncate font-mono">{short(event.sourceIP)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="truncate font-mono">{short(event.destIP)}:{event.destPort || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" /> Signaux critiques
            </div>
            <div className="space-y-2">
              {data.alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                  <span className="truncate">{alert.title}</span>
                  <Badge variant="outline" className="text-[10px]">{alert.severity}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
