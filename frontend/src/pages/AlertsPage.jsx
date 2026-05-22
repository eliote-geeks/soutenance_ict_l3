import { useState, useEffect } from 'react';
import { 
  Bell,
  Check,
  Shield,
  Ban,
  Ticket,
  ChevronDown,
  MoreHorizontal,
  Search,
  User,
  BrainCircuit,
  Fingerprint,
  Swords,
  TreePine,
  Zap,
  Network,
  KeyRound,
  Globe,
  ScanLine,
  ArrowRightLeft,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchAlerts, acknowledgeAlert, isolateHost, blockIP, createTicket } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';


// ---------------------------------------------------------------------------
// Attack type extraction
// Parses the finding title to extract a clean attack type label + metadata.
// Covers all attack classes from heuristics.py and ml_models.py.
// ---------------------------------------------------------------------------

const ATTACK_TYPE_MAP = [
  // RandomForest named attacks (title starts with "Random Forest: X detected")
  { match: /random forest.*port scan/i,         key: 'port_scan',         label: 'Port Scan',          icon: ScanLine,       color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30' },
  { match: /random forest.*brute\s*force/i,     key: 'bruteforce',        label: 'Brute Force',        icon: KeyRound,       color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30' },
  { match: /random forest.*dos flood/i,         key: 'dos_flood',         label: 'DoS Flood',          icon: Zap,            color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30' },
  { match: /random forest.*lateral movement/i,  key: 'lateral_movement',  label: 'Lateral Movement',   icon: ArrowRightLeft, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/30' },
  { match: /random forest.*dns tunnel/i,        key: 'dns_tunnel',        label: 'DNS Tunnel',         icon: Globe,          color: 'text-cyan-400',   bg: 'bg-cyan-400/10 border-cyan-400/30' },
  // IsolationForest generic anomaly
  { match: /ml network anomaly/i,               key: 'ml_anomaly',        label: 'ML Anomaly',         icon: BrainCircuit,   color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/30' },
  // Heuristic detectors
  { match: /ssh brute force/i,                  key: 'bruteforce',        label: 'SSH Brute Force',    icon: KeyRound,       color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30' },
  { match: /dns anomaly/i,                      key: 'dns_anomaly',       label: 'DNS Anomaly',        icon: Globe,          color: 'text-cyan-400',   bg: 'bg-cyan-400/10 border-cyan-400/30' },
  { match: /port scan/i,                        key: 'port_scan',         label: 'Port Scan',          icon: ScanLine,       color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30' },
  { match: /privilege escalation/i,             key: 'privesc',           label: 'Privilege Escalation', icon: TrendingUp,   color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30' },
  { match: /lateral movement/i,                 key: 'lateral_movement',  label: 'Lateral Movement',   icon: ArrowRightLeft, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/30' },
  { match: /connection burst/i,                 key: 'dos_flood',         label: 'Connection Burst',   icon: Zap,            color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30' },
];

const UNKNOWN_ATTACK = {
  key: 'unknown',
  label: 'Unknown',
  icon: AlertTriangle,
  color: 'text-muted-foreground',
  bg: 'bg-muted/30 border-border',
};

function parseAttackType(title = '') {
  for (const entry of ATTACK_TYPE_MAP) {
    if (entry.match.test(title)) return entry;
  }
  return UNKNOWN_ATTACK;
}

// ---------------------------------------------------------------------------
// Detector label — shows which model/rule produced the finding
// ---------------------------------------------------------------------------

function parseDetector(title = '', sourceType = '') {
  if (/random forest/i.test(title))    return { label: 'Random Forest',     icon: TreePine,     color: 'text-emerald-400' };
  if (/ml network anomaly/i.test(title)) return { label: 'Isolation Forest', icon: BrainCircuit, color: 'text-violet-400' };
  if (/ssh brute force/i.test(title))  return { label: 'Heuristic: SSH',    icon: Swords,       color: 'text-muted-foreground' };
  if (/dns anomaly/i.test(title))      return { label: 'Heuristic: DNS',    icon: Swords,       color: 'text-muted-foreground' };
  if (/port scan/i.test(title))        return { label: 'Heuristic: Scan',   icon: Swords,       color: 'text-muted-foreground' };
  if (/privilege/i.test(title))        return { label: 'Heuristic: PrivEsc',icon: Swords,       color: 'text-muted-foreground' };
  if (/lateral/i.test(title))          return { label: 'Heuristic: Lateral',icon: Swords,       color: 'text-muted-foreground' };
  if (/burst/i.test(title))            return { label: 'Heuristic: Burst',  icon: Swords,       color: 'text-muted-foreground' };
  // Fallback to sourceType field
  if (sourceType === 'ml')             return { label: 'ML Model',          icon: BrainCircuit, color: 'text-violet-400' };
  return                                        { label: 'Heuristic',        icon: Swords,       color: 'text-muted-foreground' };
}

// ---------------------------------------------------------------------------
// AttackTypeBadge component
// ---------------------------------------------------------------------------

function AttackTypeBadge({ title, className }) {
  const attack = parseAttackType(title);
  const Icon = attack.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium',
      attack.bg, attack.color, className
    )}>
      <Icon className="w-3 h-3" />
      {attack.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DetectorBadge component
// ---------------------------------------------------------------------------

function DetectorBadge({ title, sourceType, className }) {
  const detector = parseDetector(title, sourceType);
  const Icon = detector.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs',
      detector.color, className
    )}>
      <Icon className="w-3 h-3" />
      {detector.label}
    </span>
  );
}


// ---------------------------------------------------------------------------
// All unique attack type keys for the filter dropdown
// ---------------------------------------------------------------------------

const ATTACK_TYPE_FILTER_OPTIONS = [
  { value: 'all',              label: 'All Attack Types' },
  { value: 'bruteforce',       label: 'Brute Force / SSH' },
  { value: 'port_scan',        label: 'Port Scan' },
  { value: 'dos_flood',        label: 'DoS / Connection Burst' },
  { value: 'lateral_movement', label: 'Lateral Movement' },
  { value: 'dns_tunnel',       label: 'DNS Tunnel / Anomaly' },
  { value: 'dns_anomaly',      label: 'DNS Anomaly' },
  { value: 'privesc',          label: 'Privilege Escalation' },
  { value: 'ml_anomaly',       label: 'ML Anomaly (Unknown)' },
];


// ===========================================================================
// AlertsPage
// ===========================================================================

export default function AlertsPage() {
  const { scopeKey } = useScope();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSourceType, setFilterSourceType] = useState('all');
  const [filterAttackType, setFilterAttackType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchAlerts();
        setAlerts(result.alerts);
      } catch (error) {
        console.error('Failed to load alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [scopeKey]);

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(a =>
        a.id === alertId ? { ...a, status: 'investigating' } : a
      ));
      toast.success('Alert acknowledged', { description: `Alert ${alertId} is now being investigated` });
    } catch {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleIsolateHost = async (hostname) => {
    try {
      await isolateHost(hostname);
      toast.success('Host isolated', { description: `${hostname} has been isolated from the network` });
    } catch {
      toast.error('Failed to isolate host');
    }
  };

  const handleBlockIP = async (ip) => {
    try {
      await blockIP(ip);
      toast.success('IP blocked', { description: `${ip} has been added to the blocklist` });
    } catch {
      toast.error('Failed to block IP');
    }
  };

  const handleCreateTicket = async (alertId) => {
    try {
      const result = await createTicket(alertId, { priority: 'high' });
      toast.success('Ticket created', { description: `Ticket ${result.ticketId} created` });
    } catch {
      toast.error('Failed to create ticket');
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && alert.status !== filterStatus) return false;
    if (filterSourceType !== 'all' && alert.sourceType !== filterSourceType) return false;
    if (filterAttackType !== 'all') {
      const attackKey = parseAttackType(alert.title).key;
      // dns_tunnel and dns_anomaly both match the dns_tunnel filter
      if (filterAttackType === 'dns_tunnel') {
        if (attackKey !== 'dns_tunnel' && attackKey !== 'dns_anomaly') return false;
      } else if (attackKey !== filterAttackType) {
        return false;
      }
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        alert.id.toLowerCase().includes(query) ||
        alert.title.toLowerCase().includes(query) ||
        (alert.sourceIP || '').toLowerCase().includes(query) ||
        (alert.hostname || '').toLowerCase().includes(query)
      );
    }
    return true;
  });

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const severityCounts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high:     alerts.filter(a => a.severity === 'high').length,
    medium:   alerts.filter(a => a.severity === 'medium').length,
    low:      alerts.filter(a => a.severity === 'low').length,
  };

  const confidenceLabel = (value) =>
    typeof value === 'number' ? `${Math.round(value * 100)}%` : '--';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <LoadingSkeleton className="h-10 w-64" />
          <LoadingSkeleton className="h-10 w-32" />
          <LoadingSkeleton className="h-10 w-32" />
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage detections, validate anomalies and apply remediation playbooks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="severity-critical gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            {severityCounts.critical} Critical
          </Badge>
          <Badge variant="outline" className="severity-high gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            {severityCounts.high} High
          </Badge>
          <Badge variant="outline" className="severity-medium gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            {severityCounts.medium} Medium
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
          </SelectContent>
        </Select>

        {/* Attack type filter — NEW */}
        <Select value={filterAttackType} onValueChange={setFilterAttackType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Attack Type" />
          </SelectTrigger>
          <SelectContent>
            {ATTACK_TYPE_FILTER_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSourceType} onValueChange={setFilterSourceType}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Detection" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="heuristic">Heuristic</SelectItem>
            <SelectItem value="ml">ML</SelectItem>
          </SelectContent>
        </Select>

      </div>

      {/* Alerts List */}
      <Card className="border-border/50 shadow-soft">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredAlerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-sm">No alerts match the current filters</p>
              </div>
            )}
            {filteredAlerts.map((alert, index) => (
              <div
                key={alert.id}
                className={cn(
                  "flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer",
                  "opacity-0 animate-slide-up"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => setSelectedAlert(alert)}
              >
                {/* Severity indicator bar */}
                <div className={cn(
                  "w-1 h-12 rounded-full flex-shrink-0",
                  alert.severity === 'critical' && "bg-destructive",
                  alert.severity === 'high'     && "bg-destructive/70",
                  alert.severity === 'medium'   && "bg-warning",
                  alert.severity === 'low'      && "bg-primary",
                )} />

                {/* Alert info */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: ID + severity + status + attack type + detector */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">
                      {alert.id}
                    </span>
                    <SeverityBadge severity={alert.severity} />
                    <StatusBadge status={alert.status} />
                    {/* Attack type — the main new addition */}
                    <AttackTypeBadge title={alert.title} />
                    {/* Detector */}
                    <DetectorBadge title={alert.title} sourceType={alert.sourceType} />
                  </div>

                  {/* Row 2: Title */}
                  <h3 className="font-medium text-foreground truncate">
                    {alert.title}
                  </h3>

                  {/* Row 3: IPs + MITRE + confidence */}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{alert.sourceIP}</span>
                    <span>→</span>
                    <span>{alert.hostname}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">{alert.mitreTactic}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">
                      Confidence {confidenceLabel(alert.confidence)}
                    </span>
                  </div>
                </div>

                {/* Assignee & Time */}
                <div className="flex-shrink-0 text-right hidden md:block">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{alert.assignee || 'Unassigned'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {confidenceLabel(alert.confidence)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(alert.timestamp)}
                  </span>
                  {alert.eta && (
                    <div className="text-xs text-primary mt-1">ETA: {alert.eta}</div>
                  )}
                </div>

                {/* Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="w-4 h-4 mr-2" />Acknowledge
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleIsolateHost(alert.hostname)}>
                      <Shield className="w-4 h-4 mr-2" />Isolate Host
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBlockIP(alert.sourceIP)}>
                      <Ban className="w-4 h-4 mr-2" />Block IP
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleCreateTicket(alert.id)}>
                      <Ticket className="w-4 h-4 mr-2" />Create Ticket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Alert Detail Dialog */}
      <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
        <DialogContent className="max-w-2xl">
          {selectedAlert && (() => {
            const attack   = parseAttackType(selectedAlert.title);
            const detector = parseDetector(selectedAlert.title, selectedAlert.sourceType);
            const AttackIcon   = attack.icon;
            const DetectorIcon = detector.icon;
            return (
              <>
                <DialogHeader>
                  {/* ID + severity + status */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono text-sm text-muted-foreground">
                      {selectedAlert.id}
                    </span>
                    <SeverityBadge severity={selectedAlert.severity} />
                    <StatusBadge status={selectedAlert.status} />
                  </div>

                  {/* Attack type — prominent display in dialog */}
                  <div className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border w-fit mb-3',
                    attack.bg, attack.color
                  )}>
                    <AttackIcon className="w-4 h-4" />
                    <span className="font-semibold text-sm">{attack.label}</span>
                    <span className="text-xs opacity-60">·</span>
                    <DetectorIcon className={cn('w-3.5 h-3.5', detector.color)} />
                    <span className={cn('text-xs', detector.color)}>{detector.label}</span>
                  </div>

                  <DialogTitle className="text-xl">{selectedAlert.title}</DialogTitle>
                  <DialogDescription>{selectedAlert.description}</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-4">
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Attack type</span>
                      <p className="text-sm font-medium">{attack.label}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Detected by</span>
                      <p className="text-sm">{detector.label}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Confidence</span>
                      <p className="text-sm font-mono">{confidenceLabel(selectedAlert.confidence)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Source IP</span>
                      <p className="font-mono text-sm">{selectedAlert.sourceIP}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Destination</span>
                      <p className="font-mono text-sm">{selectedAlert.destIP}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Hostname</span>
                      <p className="font-mono text-sm">{selectedAlert.hostname}</p>
                    </div>
                    {selectedAlert.recommendation && (
                      <div>
                        <span className="text-xs text-muted-foreground">Recommended action</span>
                        <p className="text-sm">{selectedAlert.recommendation}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Fingerprint className="w-3 h-3" />Signature
                      </span>
                      <p className="font-mono text-sm break-all">{selectedAlert.signature || '--'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">MITRE ATT&CK</span>
                      <p className="text-sm">{selectedAlert.mitreTactic}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Timestamp</span>
                      <p className="text-sm">{formatTimestamp(selectedAlert.timestamp)}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Assignee</span>
                      <p className="text-sm">{selectedAlert.assignee || 'Unassigned'}</p>
                    </div>
                    {selectedAlert.playbook && (
                      <div>
                        <span className="text-xs text-muted-foreground">Playbook</span>
                        <p className="text-sm">{selectedAlert.playbook}</p>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => handleBlockIP(selectedAlert.sourceIP)}>
                    <Ban className="w-4 h-4 mr-2" />Block IP
                  </Button>
                  <Button variant="outline" onClick={() => handleIsolateHost(selectedAlert.hostname)}>
                    <Shield className="w-4 h-4 mr-2" />Isolate Host
                  </Button>
                  <Button onClick={() => handleAcknowledge(selectedAlert.id)}>
                    <Check className="w-4 h-4 mr-2" />Acknowledge
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}