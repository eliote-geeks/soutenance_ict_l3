import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  Copy,
  KeyRound,
  Laptop,
  RefreshCw,
  ShieldX,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import {
  approveAgentInstance,
  createEnrollmentToken,
  disableAgentInstance,
  fetchAgentInstances,
  fetchAssets,
  fetchEnrollmentTokens,
  rejectAgentInstance,
  revokeEnrollmentToken,
} from '@/lib/api';
import { toast } from 'sonner';

const initialForm = {
  asset_id: '',
  profile_id: '',
  site: 'yaounde-lab',
  role: 'workstation',
  environment: 'lab',
  expires_in_minutes: '30',
  single_use: 'true',
};

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
};

const relativeTime = (value) => {
  if (!value) return 'No heartbeat';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
};

export default function AgentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [latestToken, setLatestToken] = useState(null);
  const [assets, setAssets] = useState([]);
  const [instances, setInstances] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [form, setForm] = useState(initialForm);

  const loadData = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const [assetsResult, instancesResult, tokensResult] = await Promise.all([
        fetchAssets(),
        fetchAgentInstances(),
        fetchEnrollmentTokens(),
      ]);
      setAssets(assetsResult.assets || []);
      setInstances(instancesResult.instances || []);
      setTokens(tokensResult.tokens || []);
      setForm((prev) => ({
        ...prev,
        asset_id: prev.asset_id || assetsResult.assets?.[0]?.id || '',
      }));
    } catch (error) {
      toast.error('Unable to load agent administration.', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const pendingInstances = useMemo(
    () => instances.filter((instance) => instance.status === 'pending_approval'),
    [instances],
  );

  const stats = useMemo(() => ({
    enrolled: instances.length,
    pending: instances.filter((instance) => instance.status === 'pending_approval').length,
    active: instances.filter((instance) => instance.status === 'active').length,
    inactive: assets.filter((asset) => (asset.agentStatus || 'inactive') === 'inactive').length,
  }), [assets, instances]);

  const handleCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch (error) {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleCreateToken = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        expires_in_minutes: Number(form.expires_in_minutes),
        single_use: form.single_use === 'true',
        profile_id: form.profile_id || null,
      };
      const result = await createEnrollmentToken(payload);
      setLatestToken(result.token);
      setOpen(false);
      toast.success('Enrollment token created.', {
        description: `Token for ${result.token.asset_id} ready to distribute.`,
      });
      await handleCopy(result.token.raw_token, 'Enrollment token');
      await loadData();
    } catch (error) {
      toast.error('Unable to create enrollment token.', {
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (runner, successMessage) => {
    try {
      await runner();
      toast.success(successMessage);
      await loadData();
    } catch (error) {
      toast.error('Action failed.', {
        description: error.message,
      });
    }
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Agent administration is restricted"
        description="Only administrators can create enrollment tokens, approve machines, and disable deployed agents."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <LoadingSkeleton key={index} variant="card" />
          ))}
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agent Administration</h1>
          <p className="text-sm text-muted-foreground">
            Control install - enroll - approve - active for every monitored machine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <KeyRound className="h-4 w-4" />
                Create token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create enrollment token</DialogTitle>
                <DialogDescription>
                  Generate a single-use token for one machine, then install the agent locally and approve it from this page.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleCreateToken}>
                <div className="space-y-2">
                  <Label>Asset</Label>
                  <Select
                    value={form.asset_id}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, asset_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {assets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.hostname} · {asset.ip}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Profile ID</Label>
                    <Input
                      value={form.profile_id}
                      onChange={(event) => setForm((prev) => ({ ...prev, profile_id: event.target.value }))}
                      placeholder="profile_lab"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expires in (minutes)</Label>
                    <Input
                      type="number"
                      min="5"
                      value={form.expires_in_minutes}
                      onChange={(event) => setForm((prev) => ({ ...prev, expires_in_minutes: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Site</Label>
                    <Input
                      value={form.site}
                      onChange={(event) => setForm((prev) => ({ ...prev, site: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Input
                      value={form.role}
                      onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Environment</Label>
                    <Input
                      value={form.environment}
                      onChange={(event) => setForm((prev) => ({ ...prev, environment: event.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || !form.asset_id}>
                    {submitting ? 'Creating...' : 'Create token'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {latestToken && (
        <Card className="border-primary/20 bg-primary/5 shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Latest enrollment token</CardTitle>
            <CardDescription>
              Share this token once with the operator of {latestToken.asset_id}. It is not shown again after refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="font-mono text-sm text-foreground break-all">{latestToken.raw_token}</div>
              <div className="text-xs text-muted-foreground">
                Expires {formatDateTime(latestToken.expires_at)}
              </div>
            </div>
            <Button variant="outline" onClick={() => handleCopy(latestToken.raw_token, 'Enrollment token')}>
              <Copy className="h-4 w-4" />
              Copy token
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Enrolled instances</CardTitle>
            <CardDescription>Machines that reached the backend</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold font-mono">{stats.enrolled}</CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Pending approval</CardTitle>
            <CardDescription>Waiting for admin validation</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold font-mono text-warning">{stats.pending}</CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Active agents</CardTitle>
            <CardDescription>Approved and sending heartbeats</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold font-mono text-success">{stats.active}</CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Inactive assets</CardTitle>
            <CardDescription>Known machines without a running agent</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-bold font-mono text-muted-foreground">{stats.inactive}</CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Approval queue</CardTitle>
          <CardDescription>These machines have installed the agent and are waiting for your decision.</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingInstances.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No machine is waiting for approval"
              description="Create a token, install the agent on a workstation, then come back here to approve it."
            />
          ) : (
            <div className="space-y-3">
              {pendingInstances.map((instance) => (
                <div key={instance.id} className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      <span className="font-medium text-foreground">{instance.hostname}</span>
                      <StatusBadge status={instance.status} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {instance.ip} · {instance.os} · Agent {instance.agent_version || 'unknown'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Requested {formatDateTime(instance.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleAction(() => approveAgentInstance(instance.id), 'Agent approved.')}
                    >
                      <BadgeCheck className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAction(() => rejectAgentInstance(instance.id, 'Rejected from dashboard'), 'Agent rejected.')}
                    >
                      <UserX className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Agent instances</CardTitle>
          <CardDescription>Lifecycle visibility with version, heartbeat and admin actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="font-medium text-foreground">{instance.hostname}</div>
                      <div className="text-xs text-muted-foreground">{instance.ip} · {instance.os}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">{instance.asset?.id || instance.asset_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {instance.asset?.site || 'n/a'} · {instance.asset?.environment || 'n/a'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={instance.status} /></TableCell>
                  <TableCell>
                    <Badge variant="outline">{instance.agent_version || 'unknown'}</Badge>
                  </TableCell>
                  <TableCell>{instance.service_state || 'waiting'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{relativeTime(instance.last_seen_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {instance.status === 'pending_approval' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleAction(() => approveAgentInstance(instance.id), 'Agent approved.')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAction(() => rejectAgentInstance(instance.id, 'Rejected from dashboard'), 'Agent rejected.')}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {instance.status !== 'inactive' && instance.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAction(() => disableAgentInstance(instance.id, 'Disabled from dashboard'), 'Agent disabled.')}
                        >
                          Disable
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">Inventory and token state</CardTitle>
          <CardDescription>Correlate known assets, current agent status and open enrollment tokens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-3">
            {assets.map((asset) => (
              <div key={asset.id} className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{asset.hostname}</span>
                    <StatusBadge status={asset.agentStatus || 'inactive'} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {asset.ip} · {asset.os} · {asset.role}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {asset.agentInstanceId ? `Instance ${asset.agentInstanceId}` : 'No agent instance yet'}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Enrollment tokens</div>
            {tokens.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title="No token available"
                description="Create a token when you are ready to install the agent on a new machine."
              />
            ) : (
              tokens.map((token) => (
                <div key={token.id} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{token.asset_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {token.site} · {token.role} · expires {formatDateTime(token.expires_at)}
                      </div>
                    </div>
                    <StatusBadge status={token.expired ? 'inactive' : token.status} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(() => revokeEnrollmentToken(token.id), 'Enrollment token revoked.')}
                    >
                      Revoke
                    </Button>
                    {token.raw_token && (
                      <Button size="sm" variant="outline" onClick={() => handleCopy(token.raw_token, 'Enrollment token')}>
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
