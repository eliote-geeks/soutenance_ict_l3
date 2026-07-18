import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  Filter,
  Globe,
  KeyRound,
  Plus,
  ScanLine,
  Search,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { createDetectionRule, fetchModel } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const systemRuleMeta = {
  'SSH brute force': { icon: KeyRound, family: 'Brute Force / SSH', query: 'failed password >= threshold', severity: 'high' },
  'DNS burst anomaly': { icon: Globe, family: 'DNS Anomaly', query: 'dns errors >= threshold', severity: 'medium' },
  'Port scan': { icon: ScanLine, family: 'Port Scan', query: 'distinct destination ports >= threshold', severity: 'medium' },
  'ML anomaly': { icon: Brain, family: 'ML Anomaly (Unknown)', query: 'Isolation Forest outlier', severity: 'high' },
};

const attackTypes = [
  'Brute Force / SSH',
  'Port Scan',
  'DoS / Connection Burst',
  'Lateral Movement',
  'DNS Tunnel / Anomaly',
  'DNS Anomaly',
  'Privilege Escalation',
  'ML Anomaly (Unknown)',
];

const severityClass = {
  critical: 'border-destructive/30 bg-destructive/10 text-destructive',
  high: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
  medium: 'border-warning/30 bg-warning/10 text-warning',
  low: 'border-success/30 bg-success/10 text-success',
};

const RuleIcon = ({ detector }) => {
  const Icon = systemRuleMeta[detector.name]?.icon || SlidersHorizontal;
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
};

export default function ModelPage() {
  const { scopeKey } = useScope();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [form, setForm] = useState({
    name: '',
    attack_type: 'Brute Force / SSH',
    field: 'title',
    operator: 'contains',
    value: '',
    severity: 'medium',
    enabled: true,
  });

  const loadData = async () => {
    setData(await fetchModel());
  };

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch((error) => console.error('Failed to load model data:', error))
      .finally(() => setLoading(false));
  }, [scopeKey]);

  const detectors = useMemo(() => data?.detectors || [], [data]);
  const ml = data?.ml || {};
  const modelName = data?.versions?.[0]?.version || 'hybrid-detection';

  const rows = useMemo(() => (
    detectors.map((detector) => {
      const meta = systemRuleMeta[detector.name] || {};
      const severity = detector.severity || meta.severity || 'medium';
      const family = detector.attackType || meta.family || 'Custom';
      const query = detector.rule || meta.query || 'custom condition';
      const matches = Number(detector.matches || 0);
      return {
        ...detector,
        family,
        query,
        severity,
        matches,
        status: detector.custom && detector.enabled === false ? 'disabled' : 'enabled',
        source: detector.custom ? 'Custom' : 'System',
      };
    })
  ), [detectors]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !needle || [row.name, row.family, row.query, row.severity, row.source]
        .some((value) => String(value || '').toLowerCase().includes(needle));
      const matchesType = typeFilter === 'all' || row.family === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [rows, search, typeFilter]);

  const summary = useMemo(() => ({
    total: rows.length,
    enabled: rows.filter((rule) => rule.status === 'enabled').length,
    custom: rows.filter((rule) => rule.custom).length,
    signals: rows.reduce((sum, rule) => sum + rule.matches, 0),
  }), [rows]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.value.trim()) return;
    setSaving(true);
    try {
      await createDetectionRule(form);
      setForm((prev) => ({ ...prev, name: '', value: '' }));
      setPanelOpen(false);
      await loadData();
    } catch (error) {
      console.error('Failed to create detection rule:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="card" />
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">Regles de detection indisponibles.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in text-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Detection rules</h1>
          <p className="mt-1 text-xs text-muted-foreground">Regles systeme et personnalisees executees sur les donnees Elastic.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-primary/20 bg-primary/10 text-primary">
            {ml.enabled ? 'ML actif' : 'ML inactif'} · {modelName}
          </Badge>
          <Button size="sm" className="h-8 gap-2" onClick={() => setPanelOpen(true)}>
            <Plus className="h-4 w-4" /> New rule
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Total rules', summary.total, Database],
          ['Enabled', summary.enabled, CheckCircle2],
          ['Custom', summary.custom, SlidersHorizontal],
          ['Signals', summary.signals, Activity],
        ].map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
              </div>
              <Icon className="h-4 w-4 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rules by name, type, query, severity..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All rule types</option>
                {attackTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-border bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Rule</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Query / condition</th>
                  <th className="px-4 py-3 text-right font-medium">Matches</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <tr key={row.id || row.name} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <RuleIcon detector={row} />
                        <div>
                          <div className="font-medium">{row.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{row.custom ? 'User managed rule' : 'Built-in detector'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.family}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn('capitalize', severityClass[row.severity] || severityClass.medium)}>
                        {row.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]',
                        row.status === 'enabled'
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-muted text-muted-foreground'
                      )}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {row.status}
                      </span>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <code className="block truncate rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">{row.query}</code>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{row.matches}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.source}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No rules match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="font-medium">Input</div>
              <div className="mt-1 text-xs text-muted-foreground">Filebeat, Packetbeat, Metricbeat, agents.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 text-warning" />
            <div>
              <div className="font-medium">Evaluation</div>
              <div className="mt-1 text-xs text-muted-foreground">Rules, thresholds, ML anomaly scoring.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              <div className="font-medium">Output</div>
              <div className="mt-1 text-xs text-muted-foreground">Alerts and incidents for investigation.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm">
          <div className="h-full w-full max-w-md border-l border-border bg-card shadow-none">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="font-semibold">Create detection rule</div>
                <div className="mt-1 text-xs text-muted-foreground">Persisted in Elasticsearch and applied to this page.</div>
              </div>
              <button className="rounded-md p-1 hover:bg-muted" onClick={() => setPanelOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Name</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="SSH root suspect" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Rule type</span>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.attack_type} onChange={(event) => setForm({ ...form, attack_type: event.target.value })}>
                  {attackTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">Field</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.field} onChange={(event) => setForm({ ...form, field: event.target.value })}>
                    <option value="title">title</option>
                    <option value="sourceIP">sourceIP</option>
                    <option value="hostname">hostname</option>
                    <option value="mitreTactic">mitreTactic</option>
                    <option value="message">message</option>
                    <option value="log.message">log.message</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium">Operator</span>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })}>
                    <option value="contains">contains</option>
                    <option value="equals">equals</option>
                    <option value="starts_with">starts_with</option>
                  </select>
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Value</span>
                <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} placeholder="ssh, dns, root..." />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Severity</span>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPanelOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving || !form.name.trim() || !form.value.trim()}>
                  {saving ? 'Saving...' : 'Create rule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
