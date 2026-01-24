import { useState, useEffect } from 'react';
import { AlertTriangle, Activity, Shield, Clock, Globe, Server, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPICard } from '@/components/shared/KPICard';
import { AnomalyGauge } from '@/components/shared/AnomalyGauge';
import { TrafficChart } from '@/components/charts/TrafficChart';
import { SparklineChart } from '@/components/charts/SparklineChart';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchOverview } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchOverview();
        setData(result);
      } catch (error) {
        console.error('Failed to load overview data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const { kpis, trafficData, riskyHosts, attackingIPs, anomalyScore } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time threat monitoring and anomaly detection
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <span className="status-dot pulse bg-primary" />
          <span className="text-sm font-medium text-primary">AI Model Active</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Alerts"
          value={kpis.totalAlerts}
          trend={kpis.alertsTrend}
          trendLabel="vs last 24h"
          icon={AlertTriangle}
          variant="warning"
          delay={100}
        />
        <KPICard
          title="Anomalies Detected"
          value={kpis.anomalies}
          trend={kpis.anomaliesTrend}
          trendLabel="vs last 24h"
          icon={Activity}
          variant="danger"
          delay={200}
        />
        <KPICard
          title="Open Incidents"
          value={kpis.incidentsOpen}
          trend={kpis.incidentsTrend}
          trendLabel="vs last week"
          icon={Shield}
          variant="primary"
          delay={300}
        />
        <KPICard
          title="Mean Time to Detect"
          value={`${kpis.meanTimeToDetect}m`}
          trend={kpis.mttdTrend}
          trendLabel="improvement"
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
              Live Traffic Stream
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
                <span>12h Trend</span>
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
              Top Risky Hosts
            </CardTitle>
            <span className="text-xs text-muted-foreground">By risk score</span>
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
                      {host.alertCount} alerts
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
              Top Attacking IPs
            </CardTitle>
            <span className="text-xs text-muted-foreground">Last 24h</span>
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
    </div>
  );
}
