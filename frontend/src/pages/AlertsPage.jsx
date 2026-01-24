import { useState, useEffect } from 'react';
import { 
  Bell, 
  Check, 
  Shield, 
  Ban, 
  Ticket, 
  Filter,
  ChevronDown,
  MoreHorizontal,
  Search,
  User
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
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchAlerts, acknowledgeAlert, isolateHost, blockIP, createTicket } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
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
  }, []);

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, status: 'investigating' } : a
      ));
      toast.success('Alert acknowledged', { description: `Alert ${alertId} is now being investigated` });
    } catch (error) {
      toast.error('Failed to acknowledge alert');
    }
  };

  const handleIsolateHost = async (hostname) => {
    try {
      await isolateHost(hostname);
      toast.success('Host isolated', { description: `${hostname} has been isolated from the network` });
    } catch (error) {
      toast.error('Failed to isolate host');
    }
  };

  const handleBlockIP = async (ip) => {
    try {
      await blockIP(ip);
      toast.success('IP blocked', { description: `${ip} has been added to the blocklist` });
    } catch (error) {
      toast.error('Failed to block IP');
    }
  };

  const handleCreateTicket = async (alertId) => {
    try {
      const result = await createTicket(alertId, { priority: 'high' });
      toast.success('Ticket created', { description: `Ticket ${result.ticketId} created` });
    } catch (error) {
      toast.error('Failed to create ticket');
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && alert.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        alert.id.toLowerCase().includes(query) ||
        alert.title.toLowerCase().includes(query) ||
        alert.sourceIP.toLowerCase().includes(query) ||
        alert.hostname.toLowerCase().includes(query)
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
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

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
            Manage and respond to security alerts
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
      <div className="flex flex-wrap items-center gap-4">
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

        <Button variant="outline" size="icon" className="ml-auto">
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {/* Alerts List */}
      <Card className="border-border/50 shadow-soft">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
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
                {/* Severity indicator */}
                <div className={cn(
                  "w-1 h-12 rounded-full flex-shrink-0",
                  alert.severity === 'critical' && "bg-destructive",
                  alert.severity === 'high' && "bg-destructive/70",
                  alert.severity === 'medium' && "bg-warning",
                  alert.severity === 'low' && "bg-primary",
                )}/>
                
                {/* Alert info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">
                      {alert.id}
                    </span>
                    <SeverityBadge severity={alert.severity} />
                    <StatusBadge status={alert.status} />
                  </div>
                  <h3 className="font-medium text-foreground truncate">
                    {alert.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{alert.sourceIP}</span>
                    <span>→</span>
                    <span>{alert.hostname}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">{alert.mitreTactic}</span>
                  </div>
                </div>
                
                {/* Assignee & Time */}
                <div className="flex-shrink-0 text-right hidden md:block">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">
                      {alert.assignee || 'Unassigned'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(alert.timestamp)}
                  </span>
                  {alert.eta && (
                    <div className="text-xs text-primary mt-1">
                      ETA: {alert.eta}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="flex-shrink-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleAcknowledge(alert.id)}>
                      <Check className="w-4 h-4 mr-2" />
                      Acknowledge
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleIsolateHost(alert.hostname)}>
                      <Shield className="w-4 h-4 mr-2" />
                      Isolate Host
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBlockIP(alert.sourceIP)}>
                      <Ban className="w-4 h-4 mr-2" />
                      Block IP
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleCreateTicket(alert.id)}>
                      <Ticket className="w-4 h-4 mr-2" />
                      Create Ticket
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
          {selectedAlert && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {selectedAlert.id}
                  </span>
                  <SeverityBadge severity={selectedAlert.severity} />
                  <StatusBadge status={selectedAlert.status} />
                </div>
                <DialogTitle className="text-xl">
                  {selectedAlert.title}
                </DialogTitle>
                <DialogDescription>
                  {selectedAlert.description}
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-3">
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
                </div>
                <div className="space-y-3">
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
                </div>
              </div>
              
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handleBlockIP(selectedAlert.sourceIP)}>
                  <Ban className="w-4 h-4 mr-2" />
                  Block IP
                </Button>
                <Button variant="outline" onClick={() => handleIsolateHost(selectedAlert.hostname)}>
                  <Shield className="w-4 h-4 mr-2" />
                  Isolate Host
                </Button>
                <Button onClick={() => handleAcknowledge(selectedAlert.id)}>
                  <Check className="w-4 h-4 mr-2" />
                  Acknowledge
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
