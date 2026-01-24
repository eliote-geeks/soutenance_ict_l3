import { useState, useEffect } from 'react';
import { Activity, Server, AlertTriangle, CheckCircle, Clock, Gauge } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchPipeline } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function PipelinePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchPipeline();
        setData(result);
      } catch (error) {
        console.error('Failed to load pipeline data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  const { services, ingestionLag, queueDepth, droppedEvents, throughput, uptime } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor data ingestion and processing pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-success/10 text-success border-success/20 gap-1.5">
            <CheckCircle className="w-3 h-3" />
            {uptime}% Uptime
          </Badge>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingestion Lag</p>
                <p className="text-xl font-bold font-mono">
                  {ingestionLag}
                  <span className="text-sm text-muted-foreground ml-1">ms</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-warning/10">
                <Activity className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Queue Depth</p>
                <p className="text-xl font-bold font-mono">{queueDepth}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-destructive/10">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dropped Events</p>
                <p className="text-xl font-bold font-mono text-destructive">{droppedEvents}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-success/10">
                <Gauge className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Throughput</p>
                <p className="text-xl font-bold font-mono">
                  {(throughput / 1000).toFixed(1)}
                  <span className="text-sm text-muted-foreground ml-1">k/s</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Status */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Service Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {services.map((service, index) => (
              <div
                key={service.name}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50",
                  "opacity-0 animate-slide-up"
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Status indicator */}
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  service.status === 'healthy' && "bg-success",
                  service.status === 'degraded' && "bg-warning",
                  service.status === 'down' && "bg-destructive",
                )} />
                
                {/* Service name */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">{service.name}</h4>
                  <StatusBadge status={service.status} className="mt-1" />
                </div>
                
                {/* CPU */}
                <div className="w-32">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">CPU</span>
                    <span className={cn(
                      "font-mono",
                      service.cpu >= 80 && "text-destructive",
                      service.cpu >= 60 && service.cpu < 80 && "text-warning",
                      service.cpu < 60 && "text-foreground",
                    )}>{service.cpu}%</span>
                  </div>
                  <Progress 
                    value={service.cpu} 
                    className={cn(
                      "h-1.5",
                      service.cpu >= 80 && "[&>div]:bg-destructive",
                      service.cpu >= 60 && service.cpu < 80 && "[&>div]:bg-warning",
                      service.cpu < 60 && "[&>div]:bg-primary",
                    )}
                  />
                </div>
                
                {/* Memory */}
                <div className="w-32">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Memory</span>
                    <span className={cn(
                      "font-mono",
                      service.memory >= 80 && "text-destructive",
                      service.memory >= 60 && service.memory < 80 && "text-warning",
                      service.memory < 60 && "text-foreground",
                    )}>{service.memory}%</span>
                  </div>
                  <Progress 
                    value={service.memory} 
                    className={cn(
                      "h-1.5",
                      service.memory >= 80 && "[&>div]:bg-destructive",
                      service.memory >= 60 && service.memory < 80 && "[&>div]:bg-warning",
                      service.memory < 60 && "[&>div]:bg-chart-4",
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Architecture Diagram */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Pipeline Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 overflow-x-auto py-4">
            {['Log Sources', 'Collector', 'Parser', 'ML Engine', 'Alert Manager', 'Dashboard'].map((stage, index) => (
              <div key={stage} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-20 h-20 rounded-xl flex items-center justify-center text-xs font-medium text-center p-2",
                    index === 0 && "bg-muted text-muted-foreground",
                    index > 0 && index < 5 && "bg-primary/10 text-primary border border-primary/20",
                    index === 5 && "bg-success/10 text-success border border-success/20",
                  )}>
                    {stage}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {index === 2 && `${throughput}/s`}
                    {index === 3 && `${ingestionLag}ms`}
                  </div>
                </div>
                {index < 5 && (
                  <div className="w-8 h-0.5 bg-border mx-2 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
