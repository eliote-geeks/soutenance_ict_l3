import { useState, useEffect } from 'react';
import { AlertTriangle, Activity, Shield, Clock, Globe, Server, TrendingUp } from 'lucide-react';
import { PageHelp } from '@/components/shared/PageHelp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/shared/KPICard';
import { AnomalyGauge } from '@/components/shared/AnomalyGauge';
import { TrafficChart } from '@/components/charts/TrafficChart';
import { SparklineChart } from '@/components/charts/SparklineChart';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchOverview } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

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
        setError("Impossible de charger l'overview pour le moment.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [scopeKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LoadingSkeleton variant="chart" className="lg:col-span-2" />
          <LoadingSkeleton variant="card" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SOC Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unified view of Filebeat, Packetbeat, fail2ban and AI detections
          </p>
        </div>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="py-8">
            <div className="text-sm text-destructive font-medium">
              {error || "Aucune donnee d'overview disponible."}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { kpis, trafficData, riskyHosts, attackingIPs, anomalyScore } = data;
  const totalEvents = (trafficData || []).reduce(
    (sum, point) => sum + Number(point.events || point.alerts || 0),
    0
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-soft">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.25),transparent_45%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-medium text-teal-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]" />
              Supervision en temps reel
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">NetSentinel AI</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Tableau SOC connecte aux journaux Elastic, aux agents enrolables et au moteur de detection IA.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase text-slate-400">Alertes</div>
              <div className="mt-1 font-mono text-xl font-semibold">{kpis.totalAlerts}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase text-slate-400">Anomalies</div>
              <div className="mt-1 font-mono text-xl font-semibold">{kpis.anomalies}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[11px] uppercase text-slate-400">Evenements</div>
              <div className="mt-1 font-mono text-xl font-semibold">{totalEvents}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Alertes totales"
          value={kpis.totalAlerts}
          trend={kpis.alertsTrend}
          trendLabel="vs 24h"
          icon={AlertTriangle}
          variant="warning"
          delay={100}
        />
        <KPICard
          title="Anomalies detectees"
          value={kpis.anomalies}
          trend={kpis.anomaliesTrend}
          trendLabel="vs 24h"
          icon={Activity}
          variant="danger"
          delay={200}
        />
        <KPICard
          title="Incidents ouverts"
          value={kpis.incidentsOpen}
          trend={kpis.incidentsTrend}
          trendLabel="vs semaine"
          icon={Shield}
          variant="primary"
          delay={300}
        />
        <KPICard
          title="Temps moyen detection"
          value={`${kpis.meanTimeToDetect}m`}
          trend={kpis.mttdTrend}
          trendLabel="amelioration"
          icon={Clock}
          variant="success"
          delay={400}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic Chart - Takes 2 columns */}
        <Card className="lg:col-span-2 border-border/50 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">
              Flux reseau Packetbeat
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="status-dot pulse bg-success" />
              Streaming
            </div>
          </CardHeader>
          <CardContent>
            <TrafficChart data={trafficData} height={280} />
          </CardContent>
        </Card>

        {/* Anomaly Score Gauge */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Anomaly Score
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AnomalyGauge 
              value={anomalyScore.current} 
              threshold={anomalyScore.threshold} 
              size="large"
            />
            <div className="mt-4 w-full">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Tendance 12h</span>
                <span className="font-mono">{anomalyScore.trend[anomalyScore.trend.length - 1]}</span>
              </div>
              <SparklineChart 
                data={anomalyScore.trend} 
                color={anomalyScore.current >= anomalyScore.threshold * 0.7 
                  ? 'hsl(var(--destructive))' 
                  : 'hsl(var(--primary))'
                }
                width={200}
                height={50}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Grid - Risky Hosts & Attacking IPs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Risky Hosts */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Server className="w-4 h-4 text-warning" />
              Hosts les plus risques
            </CardTitle>
            <span className="text-xs text-muted-foreground">Par score de risque</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskyHosts.map((host, index) => (
                <div 
                  key={host.id}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group",
                    "opacity-0 animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 100 + 500}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium truncate">
                        {host.hostname}
                      </span>
                      <SeverityBadge severity={host.criticality} showDot={false} />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {host.ip}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "text-lg font-bold font-mono",
                      host.riskScore >= 80 ? "text-destructive" : 
                      host.riskScore >= 60 ? "text-warning" : "text-primary"
                    )}>
                      {host.riskScore}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {host.alertCount} alertes
                    </span>
                  </div>
                  <div 
                    className="w-1 h-8 rounded-full"
                    style={{
                      background: `linear-gradient(to top, 
                        hsl(var(--${host.riskScore >= 80 ? 'destructive' : host.riskScore >= 60 ? 'warning' : 'primary'})) ${host.riskScore}%, 
                        hsl(var(--muted)) ${host.riskScore}%)`
                    }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Attacking IPs */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-destructive" />
              IP attaquantes
            </CardTitle>
            <span className="text-xs text-muted-foreground">Dernieres 24h</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {attackingIPs.map((ip, index) => (
                <div 
                  key={ip.id}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group",
                    "opacity-0 animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 100 + 500}ms` }}
                >
                  <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive">
                    {ip.country}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm font-medium block">
                      {ip.ip}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ip.lastAttack).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono text-destructive">
                      {ip.attackCount}
                    </div>
                    <span className="text-xs text-muted-foreground">attacks</span>
                  </div>
                  {ip.blocked && (
                    <span className="px-2 py-1 text-xs font-medium rounded bg-success/10 text-success border border-success/20">
                      Blocked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <PageHelp
        title="SOC Overview"
        description="Real-time security dashboard showing KPIs, anomaly scores and active threat indicators from your Elasticsearch cluster."
        items={[
          { label: 'KPI Cards', desc: 'Active alerts, critical hosts, events/sec and detection rate — all pulled live from Elasticsearch.' },
          { label: 'Anomaly Gauge', desc: 'Composite score (0–100) from the One-Class SVM model. Above 70 indicates active threat activity.' },
          { label: 'Alert Severity Chart', desc: 'Distribution of Critical / High / Medium alerts over the selected time window.' },
          { label: 'Top Threat IPs', desc: 'Source IPs with the highest alert count. Blocked = firewall rule is active.' },
        ]}
        tips={[
          { type: 'tip', text: 'Use the scope selector in the top bar to filter all panels to a specific host or asset profile.' },
          { type: 'info', text: 'Data refreshes every 30 seconds automatically. The "LIVE" indicator in the top bar confirms connectivity.' },
          { type: 'warning', text: 'An anomaly score above 80 warrants immediate investigation — check the Alerts page for details.' },
        ]}
      />
    </div>
  );
}
