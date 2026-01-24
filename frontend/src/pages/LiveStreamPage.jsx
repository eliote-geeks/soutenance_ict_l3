import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Zap, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RealtimeChart } from '@/components/charts/RealtimeChart';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchStream } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function LiveStreamPage() {
  const [data, setData] = useState({ events: [], metrics: {} });
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [buffer, setBuffer] = useState([]);
  const [latency, setLatency] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      if (isPaused) {
        // Store in buffer when paused
        try {
          const result = await fetchStream();
          setBuffer(prev => [...prev, ...result.events].slice(-100));
          setLatency(Math.floor(Math.random() * 50) + 10);
        } catch (error) {
          console.error('Failed to load stream data:', error);
        }
        return;
      }

      try {
        const start = Date.now();
        const result = await fetchStream();
        setLatency(Date.now() - start);
        
        // Merge buffer if resuming
        if (buffer.length > 0) {
          setData(prev => ({
            events: [...buffer, ...result.events].slice(0, 50),
            metrics: result.metrics,
          }));
          setBuffer([]);
        } else {
          setData(result);
        }
      } catch (error) {
        console.error('Failed to load stream data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isPaused, buffer]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  const { events, metrics } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Stream</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time security event feed and metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Latency indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {latency}ms latency
            </span>
          </div>
          
          {/* Buffer indicator */}
          {buffer.length > 0 && (
            <Badge variant="outline" className="gap-1.5 bg-warning/10 text-warning border-warning/20">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              {buffer.length} buffered
            </Badge>
          )}
          
          {/* Pause/Resume */}
          <Button 
            variant={isPaused ? "default" : "outline"}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className={cn(
              "gap-2",
              isPaused && "gradient-teal text-primary-foreground"
            )}
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Realtime Metrics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4">
            <RealtimeChart 
              metrics={metrics}
              dataKey="eventsPerSecond"
              color="hsl(var(--primary))"
              label="Events/sec"
              height={150}
            />
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4">
            <RealtimeChart 
              metrics={metrics}
              dataKey="bytesPerSecond"
              color="hsl(var(--chart-4))"
              label="Bytes/sec"
              height={150}
            />
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4">
            <RealtimeChart 
              metrics={metrics}
              dataKey="failedLogins"
              color="hsl(var(--destructive))"
              label="Failed Logins"
              height={150}
            />
          </CardContent>
        </Card>
      </div>

      {/* Live Event Feed */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Live Event Feed
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn(
              "status-dot",
              isPaused ? "bg-warning" : "bg-success pulse"
            )} />
            <span className="text-xs text-muted-foreground">
              {isPaused ? 'Paused' : 'Streaming'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4" ref={scrollRef}>
            <div className="space-y-2">
              {events.map((event, index) => (
                <div
                  key={event.id}
                  className={cn(
                    "flex items-start gap-4 p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-all cursor-pointer group",
                    "opacity-0 animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Timestamp */}
                  <div className="flex-shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  
                  {/* Severity */}
                  <div className="flex-shrink-0">
                    <SeverityBadge severity={event.severity} />
                  </div>
                  
                  {/* Event details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">
                        {event.type}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {event.mitreTactic}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="font-mono">
                        {event.sourceIP} → {event.destIP}:{event.destPort}
                      </span>
                      <span className="hidden sm:inline">|</span>
                      <span className="hidden sm:inline">{event.hostname}</span>
                      {event.user && (
                        <>
                          <span className="hidden md:inline">|</span>
                          <span className="hidden md:inline">User: {event.user}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Confidence */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-mono font-medium">
                      {event.confidence}%
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {event.modelVersion}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Zap className="w-4 h-4" />
            <span className="text-xs">Active Connections</span>
          </div>
          <span className="text-2xl font-bold font-mono">
            {metrics.activeConnections?.toLocaleString() || 0}
          </span>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Queue Depth</span>
          </div>
          <span className="text-2xl font-bold font-mono">
            {metrics.queueDepth || 0}
          </span>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Avg Latency</span>
          </div>
          <span className="text-2xl font-bold font-mono">
            {metrics.latency || 0}ms
          </span>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <RefreshCw className="w-4 h-4" />
            <span className="text-xs">Events (5s)</span>
          </div>
          <span className="text-2xl font-bold font-mono text-primary">
            {events.length}
          </span>
        </div>
      </div>
    </div>
  );
}
