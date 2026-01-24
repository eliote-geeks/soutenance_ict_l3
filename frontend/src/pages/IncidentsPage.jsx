import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Users, 
  ChevronRight,
  Shield,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchIncidents } from '@/lib/api';
import { cn } from '@/lib/utils';

// Simple MITRE ATT&CK tactics for matrix view
const mitreTactics = [
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Exfiltration',
  'Command and Control',
];

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchIncidents();
        setIncidents(result.incidents);
        if (result.incidents.length > 0) {
          setSelectedIncident(result.incidents[0]);
        }
      } catch (error) {
        console.error('Failed to load incidents:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LoadingSkeleton variant="table" className="lg:col-span-1" />
          <LoadingSkeleton variant="chart" className="lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and investigate security incidents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="severity-critical gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            {incidents.filter(i => i.status === 'active').length} Active
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incidents List */}
        <Card className="border-border/50 shadow-soft lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Active Incidents
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border">
                {incidents.map((incident, index) => (
                  <div
                    key={incident.id}
                    onClick={() => setSelectedIncident(incident)}
                    className={cn(
                      "p-4 cursor-pointer transition-colors",
                      "opacity-0 animate-slide-up",
                      selectedIncident?.id === incident.id 
                        ? "bg-accent" 
                        : "hover:bg-muted/30"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {incident.id}
                      </span>
                      <SeverityBadge severity={incident.severity} />
                    </div>
                    <h3 className="font-medium text-sm mb-2 line-clamp-2">
                      {incident.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <StatusBadge status={incident.status} />
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {incident.alertCount} alerts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Incident Details */}
        {selectedIncident && (
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <Card className="border-border/50 shadow-soft">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-sm text-muted-foreground">
                        {selectedIncident.id}
                      </span>
                      <SeverityBadge severity={selectedIncident.severity} />
                      <StatusBadge status={selectedIncident.status} />
                    </div>
                    <h2 className="text-xl font-bold">{selectedIncident.title}</h2>
                  </div>
                  <Button>Investigate</Button>
                </div>
                
                <div className="grid grid-cols-4 gap-4 mt-6">
                  <div>
                    <span className="text-xs text-muted-foreground">Alerts</span>
                    <p className="text-lg font-bold font-mono">{selectedIncident.alertCount}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Affected Hosts</span>
                    <p className="text-lg font-bold font-mono">{selectedIncident.affectedHosts}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Assignee</span>
                    <p className="text-sm font-medium">{selectedIncident.assignee}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Created</span>
                    <p className="text-sm font-medium">{formatTimestamp(selectedIncident.createdAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="border-border/50 shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Incident Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                  <div className="space-y-4">
                    {selectedIncident.timeline.map((event, index) => (
                      <div 
                        key={index} 
                        className={cn(
                          "flex items-start gap-4 opacity-0 animate-slide-up"
                        )}
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        <div className="w-4 h-4 rounded-full bg-primary border-4 border-background relative z-10" />
                        <div className="flex-1 pb-4">
                          <p className="text-sm font-medium">{event.action}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* MITRE ATT&CK Matrix */}
            <Card className="border-border/50 shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-destructive" />
                  MITRE ATT&CK Coverage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-6 md:grid-cols-11 gap-1">
                  {mitreTactics.map((tactic) => {
                    const isActive = selectedIncident.tactics.includes(tactic);
                    return (
                      <div
                        key={tactic}
                        className={cn(
                          "p-2 rounded text-center text-[10px] font-medium transition-colors",
                          isActive 
                            ? "bg-destructive/20 text-destructive border border-destructive/30" 
                            : "bg-muted text-muted-foreground"
                        )}
                        title={tactic}
                      >
                        {tactic.split(' ').map(w => w[0]).join('')}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                    Detected
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-muted" />
                    Not Detected
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
