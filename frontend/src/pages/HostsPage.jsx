import { useState, useEffect } from 'react';
import { Server, Search, Shield, AlertTriangle, Wifi, WifiOff, Download } from 'lucide-react';
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
import { fetchHosts, isolateHost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function HostsPage() {
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCriticality, setFilterCriticality] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchHosts();
        setHosts(result.hosts);
      } catch (error) {
        console.error('Failed to load hosts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleIsolate = async (hostname) => {
    try {
      await isolateHost(hostname);
      toast.success('Host isolated', { description: `${hostname} has been isolated` });
    } catch (error) {
      toast.error('Failed to isolate host');
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
            Inventory of monitored hosts and their security status
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export Inventory
        </Button>
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
    </div>
  );
}
