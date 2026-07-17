import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle, Clock, ShieldCheck, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchFirewallBlocks, unblockIP } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const formatDate = (value) => {
  if (!value) return '--';
  return new Date(value).toLocaleString();
};

const statusStyle = (status) => {
  if (status === 'enforced') return 'bg-success/10 text-success border-success/20';
  if (status === 'pending') return 'bg-warning/10 text-warning border-warning/20';
  if (status === 'released') return 'bg-muted text-muted-foreground border-border';
  return 'bg-destructive/10 text-destructive border-destructive/20';
};

export default function ResolutionPage() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');

  const loadData = async () => {
    try {
      const result = await fetchFirewallBlocks(false);
      setBlocks(result.blocks || []);
    } catch (error) {
      toast.error("Impossible de charger l'audit de reponse.", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => ({
    total: blocks.length,
    active: blocks.filter((item) => ['enforced', 'pending'].includes(item.status)).length,
    enforced: blocks.filter((item) => item.status === 'enforced').length,
    pending: blocks.filter((item) => item.status === 'pending').length,
  }), [blocks]);

  const handleRelease = async (ip) => {
    setSubmitting(ip);
    try {
      await unblockIP(ip);
      toast.success('Blocage leve.', { description: ip });
      await loadData();
    } catch (error) {
      toast.error('Echec de la levee du blocage.', { description: error.message });
    } finally {
      setSubmitting('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <LoadingSkeleton key={i} variant="card" />)}
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Resolution</h1>
        <p className="mt-1 text-sm text-muted-foreground">Audit des actions de reponse: blocage IP, statut agent et expiration.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{stats.total}</div><div className="text-xs text-muted-foreground">Actions</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{stats.active}</div><div className="text-xs text-muted-foreground">Actives</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{stats.enforced}</div><div className="text-xs text-muted-foreground">Appliquees</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold font-mono">{stats.pending}</div><div className="text-xs text-muted-foreground">En attente agent</div></CardContent></Card>
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Blocages IP
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {blocks.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">Aucune action de blocage enregistree.</div>
          ) : (
            <div className="divide-y divide-border">
              {blocks.map((block) => {
                const active = ['enforced', 'pending'].includes(block.status);
                return (
                  <div key={block.id || block.ip} className="grid gap-3 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Ban className="h-4 w-4 text-destructive" />
                        <span className="font-mono font-semibold">{block.ip}</span>
                        <Badge variant="outline" className={cn('capitalize', statusStyle(block.status))}>{block.status}</Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{block.reason || block.detail || 'Action NetSentinel'}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground text-xs">Host</div>
                      <div className="font-mono">{block.hostname || '--'}</div>
                    </div>
                    <div className="text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground text-xs"><Clock className="h-3 w-3" />Expiration</div>
                      <div>{formatDate(block.expires_at)}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!active || submitting === block.ip}
                      onClick={() => handleRelease(block.ip)}
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Lever
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
          <p>
            enforced signifie qu'un agent actif a recu l'ordre local. pending signifie que NetSentinel a enregistre la decision, mais qu'aucun agent actif n'a encore applique la regle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
