import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Search, Shield, AlertTriangle, Wifi, WifiOff, Download, Plus } from 'lucide-react';
import { PageHelp } from '@/components/shared/PageHelp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SeverityBadge } from '@/components/shared/SeverityBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchHosts, fetchAssets, isolateHost, createAsset } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const EMPTY_ASSET_FORM = { hostname: '', ip: '', os: 'Linux', role: 'Server', site: 'default-site' };

export default function HostsPage() {
  const navigate = useNavigate();
  const { scopeKey } = useScope();
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCriticality, setFilterCriticality] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [hostsResult, assetsResult] = await Promise.all([
        fetchHosts().catch(() => ({ hosts: [] })),
        fetchAssets().catch(() => ({ assets: [] })),
      ]);
      const liveHosts = hostsResult.hosts || [];
      const registeredAssets = assetsResult.assets || [];
      // Build a lookup of live Metricbeat hosts by hostname (lowercase)
      const liveByHostname = Object.fromEntries(
        liveHosts.map(h => [h.hostname.toLowerCase(), h])
      );
      // Start from registered assets, overlay live data where available
      const registeredRows = registeredAssets.map(asset => {
        const live = liveByHostname[asset.hostname?.toLowerCase()];
        return live
          ? { ...live, id: asset.id || live.id, role: asset.role || live.role }
          : {
              id: asset.id,
              hostname: asset.hostname,
              ip: asset.ip,
              os: asset.os || 'Unknown',
              role: asset.role || 'Asset',
              riskScore: 0,
              criticality: 'low',
              lastSeen: asset.agentLastSeenAt || null,
              alertCount: 0,
              status: asset.agentStatus === 'active' ? 'online' : 'offline',
              agent: asset.agentStatus === 'active' ? 'installed' : 'missing',
            };
      });
      // Add live hosts not already in registered assets
      const registeredHostnames = new Set(registeredAssets.map(a => a.hostname?.toLowerCase()));
      const extraLive = liveHosts.filter(h => !registeredHostnames.has(h.hostname.toLowerCase()));
      setHosts([...registeredRows, ...extraLive]);
    } catch (error) {
      console.error('Failed to load hosts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const handleIsolate = async (hostname) => {
    try {
      await isolateHost(hostname);
      toast.success('Host isolated', { description: `${hostname} has been isolated` });
    } catch (error) {
      toast.error('Failed to isolate host');
    }
  };

  const handleExportCSV = () => {
    const headers = ['hostname', 'ip', 'os', 'role', 'riskScore', 'criticality', 'status', 'lastSeen', 'agent'];
    const rows = hosts.map(h =>
      headers.map(k => JSON.stringify(h[k] ?? '')).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netsentinel-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Inventory exported');
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    if (!assetForm.hostname.trim() || !assetForm.ip.trim()) {
      toast.error('Hostname and IP are required');
      return;
    }
    setSubmitting(true);
    try {
      const id = `asset_${assetForm.hostname.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
      await createAsset({ id, ...assetForm });
      toast.success('Asset registered', { description: `${assetForm.hostname} added — continuing to agent enrollment.` });
      setAddDialogOpen(false);
      setAssetForm(EMPTY_ASSET_FORM);
      await loadData();
      navigate(`/agents?asset_id=${encodeURIComponent(id)}&create=1`);
    } catch (error) {
      toast.error('Failed to register asset', {
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHosts = hosts.filter(host => {
    if (filterCriticality !== 'all' && host.criticality !== filterCriticality) return false;
    if (filterStatus !== 'all' && host.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        host.hostname.toLowerCase().includes(query) ||
        host.ip.toLowerCase().includes(query) ||
        host.os.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const formatLastSeen = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  };

  const getRiskColor = (score) => {
    if (score >= 80) return 'text-destructive';
    if (score >= 60) return 'text-warning';
    if (score >= 40) return 'text-primary';
    return 'text-success';
  };

  // Summary stats
  const stats = {
    total: hosts.length,
    online: hosts.filter(h => h.status === 'online').length,
    critical: hosts.filter(h => h.criticality === 'critical').length,
    highRisk: hosts.filter(h => h.riskScore >= 70).length,
    missingAgent: hosts.filter(h => h.agent === 'missing').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
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
          <h1 className="text-2xl font-bold text-foreground">Assets & Hosts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inventory of monitored servers, agents and exposed services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportCSV} disabled={hosts.length === 0}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total Hosts</p>
                <p className="text-xl font-bold font-mono">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Wifi className="w-5 h-5 text-success" />
              <div>
                <p className="text-xs text-muted-foreground">Online</p>
                <p className="text-xl font-bold font-mono text-success">{stats.online}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="text-xl font-bold font-mono text-destructive">{stats.critical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="text-xs text-muted-foreground">High Risk</p>
                <p className="text-xl font-bold font-mono text-warning">{stats.highRisk}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <WifiOff className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Missing Agent</p>
                <p className="text-xl font-bold font-mono">{stats.missingAgent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search hosts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={filterCriticality} onValueChange={setFilterCriticality}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Criticality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Criticality</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Add Asset Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
            <DialogDescription>
              Add a new host or server to the monitored inventory.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAsset} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Hostname *</label>
              <Input
                value={assetForm.hostname}
                onChange={e => setAssetForm(f => ({ ...f, hostname: e.target.value }))}
                placeholder="e.g. web-server-01"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">IP Address *</label>
              <Input
                value={assetForm.ip}
                onChange={e => setAssetForm(f => ({ ...f, ip: e.target.value }))}
                placeholder="e.g. 192.168.1.10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">OS</label>
                <Select value={assetForm.os} onValueChange={v => setAssetForm(f => ({ ...f, os: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Linux">Linux</SelectItem>
                    <SelectItem value="Windows Server">Windows Server</SelectItem>
                    <SelectItem value="Windows 11">Windows 11</SelectItem>
                    <SelectItem value="macOS">macOS</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Role</label>
                <Input
                  value={assetForm.role}
                  onChange={e => setAssetForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="e.g. Web Server"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Site</label>
              <Input
                value={assetForm.site}
                onChange={e => setAssetForm(f => ({ ...f, site: e.target.value }))}
                placeholder="e.g. lab, dmz, prod"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Registering…' : 'Register Asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hosts Table */}
      <Card className="border-border/50 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-48">Hostname</TableHead>
                <TableHead className="w-32">IP Address</TableHead>
                <TableHead className="w-36">OS</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-28">Risk Score</TableHead>
                <TableHead className="w-24">Criticality</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24">Last Seen</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHosts.map((host, index) => (
                <TableRow 
                  key={host.id}
                  className={cn(
                    "opacity-0 animate-slide-up cursor-pointer",
                    host.agent === 'missing' && "bg-destructive/5"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        host.status === 'online' ? "bg-success" : "bg-muted-foreground"
                      )} />
                      <span className="font-mono text-sm font-medium">
                        {host.hostname}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{host.ip}</TableCell>
                  <TableCell className="text-sm">{host.os}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {host.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-mono font-medium", getRiskColor(host.riskScore))}>
                        {host.riskScore}
                      </span>
                      <Progress 
                        value={host.riskScore} 
                        className={cn(
                          "w-12 h-1.5",
                          host.riskScore >= 80 && "[&>div]:bg-destructive",
                          host.riskScore >= 60 && host.riskScore < 80 && "[&>div]:bg-warning",
                          host.riskScore < 60 && "[&>div]:bg-primary",
                        )}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={host.criticality} showDot={false} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={host.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatLastSeen(host.lastSeen)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleIsolate(host.hostname)}
                      className="text-xs"
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      Isolate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PageHelp
        title="Assets / Hosts"
        description="Inventory of all monitored machines. Risk scores are computed from open CVEs, alert frequency and network exposure."
        items={[
          { label: 'Browse assets', desc: 'The table lists every host seen by Elasticsearch. Click a row to open a detail drawer with full context.' },
          { label: 'Filter by status', desc: 'Use the status filter buttons (Online / Offline / High-risk) to narrow down the list.' },
          { label: 'Risk score', desc: 'A score from 0–100 aggregating CVE severity, recent alert count and OS patch level.' },
          { label: 'Export', desc: 'Download the full asset inventory as CSV using the Export button.' },
        ]}
        tips={[
          { type: 'tip', text: 'Sort by Risk Score descending to prioritise remediation on the most exposed hosts.' },
          { type: 'info', text: 'Hosts appear automatically once an agent is active and sending heartbeats — no manual registration needed.' },
          { type: 'warning', text: 'Offline hosts still appear in the list. Investigate long-offline hosts — the agent may have been tampered with.' },
        ]}
      />
    </div>
  );
}
