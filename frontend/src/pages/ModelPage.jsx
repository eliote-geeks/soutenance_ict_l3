import { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, CheckCircle, ShieldAlert, Gauge, Layers3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchModel } from '@/lib/api';
import { useScope } from '@/context/ScopeContext';
import { cn } from '@/lib/utils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      <p className="text-xs text-muted-foreground">
        Importance: <span className="font-mono">{(payload[0]?.value * 100).toFixed(1)}%</span>
      </p>
    </div>
  );
};

const percentLabel = (value) => (
  typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : '--'
);

const progressValue = (value) => (
  typeof value === 'number' ? value * 100 : 0
);

export default function ModelPage() {
  const { scopeKey } = useScope();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchModel();
        setData(result);
        setError('');
      } catch (error) {
        console.error('Failed to load model data:', error);
        setError("Impossible de charger les donnees du modele.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [scopeKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="chart" className="lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Detection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor anomaly scoring, feature quality and false positives
          </p>
        </div>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="py-8">
            <div className="text-sm text-destructive font-medium">
              {error || "Aucune donnee modele disponible."}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const versions = Array.isArray(data.versions) ? data.versions : [];
  const featureImportance = Array.isArray(data.featureImportance)
    ? data.featureImportance
    : Array.isArray(data.features)
      ? data.features.map((feature) => ({
          feature: feature.feature || feature.name || 'unknown',
          importance: Number(feature.importance || 0),
        }))
      : [];
  const confusionMatrix = data.confusionMatrix || {
    truePositive: Math.max(1, Math.round((versions[0]?.recall || 0.85) * 100)),
    falsePositive: versions[0]?.falsePositives || 0,
    trueNegative: 100,
    falseNegative: Math.max(1, Math.round((1 - (versions[0]?.recall || 0.85)) * 20)),
  };
  const activeVersion = versions.find(v => v.status === 'active');

  // Calculate metrics from confusion matrix
  const total = confusionMatrix.truePositive + confusionMatrix.falsePositive + 
                confusionMatrix.trueNegative + confusionMatrix.falseNegative;
  const accuracy = total > 0
    ? ((confusionMatrix.truePositive + confusionMatrix.trueNegative) / total * 100).toFixed(1)
    : '0.0';
  const detectors = Array.isArray(data.detectors) ? data.detectors : [];
  const thresholds = data.thresholds || {};
  const ml = data.ml || {};
  const dedupWindowMinutes = data.dedupWindowMinutes;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Detection</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor anomaly scoring, feature quality and false positives
          </p>
        </div>
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5">
          <Brain className="w-3 h-3" />
          Active Model: {activeVersion?.version}
        </Badge>
      </div>

      {/* Model Versions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {versions.map((version, index) => (
          <Card 
            key={version.version}
            className={cn(
              "border-border/50 shadow-soft transition-all",
              version.status === 'active' && "border-primary/30 bg-primary/5"
            )}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-lg">{version.version}</span>
                  {version.status === 'active' && (
                    <Badge className="bg-success/10 text-success border-success/20">
                      Active
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Deployed {version.deployedAt}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Precision</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{percentLabel(version.precision)}</span>
                    <Progress value={progressValue(version.precision)} className="h-1.5 flex-1 [&>div]:bg-primary" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Recall</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{percentLabel(version.recall)}</span>
                    <Progress value={progressValue(version.recall)} className="h-1.5 flex-1 [&>div]:bg-chart-4" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">F1 Score</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{percentLabel(version.f1)}</span>
                    <Progress value={progressValue(version.f1)} className="h-1.5 flex-1 [&>div]:bg-warning" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">False Positives</span>
                  <span className="font-mono font-medium block">{version.falsePositives}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <ShieldAlert className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dedup Window</p>
                <p className="text-2xl font-bold font-mono">{dedupWindowMinutes ?? '--'}m</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-warning/10">
                <Gauge className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ML Contamination</p>
                <p className="text-2xl font-bold font-mono">
                  {typeof ml.contamination === 'number' ? `${(ml.contamination * 100).toFixed(0)}%` : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-success/10">
                <Layers3 className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ML History Window</p>
                <p className="text-2xl font-bold font-mono">{ml.historyHours ?? '--'}h</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Importance */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Feature Importance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart 
                data={featureImportance} 
                layout="vertical"
                margin={{ top: 5, right: 20, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis 
                  type="number" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                />
                <YAxis 
                  type="category" 
                  dataKey="feature" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                  width={90}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar 
                  dataKey="importance" 
                  fill="hsl(var(--primary))" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Confusion Matrix */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Confusion Matrix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.confusionMatrix ? (
              <>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <span className="text-4xl font-bold text-primary">{accuracy}%</span>
                    <p className="text-sm text-muted-foreground">Overall Accuracy</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  <div className="aspect-square rounded-lg bg-success/20 p-4 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold text-success">
                      {confusionMatrix.truePositive}
                    </span>
                    <span className="text-xs text-success/80">True Positive</span>
                  </div>
                  <div className="aspect-square rounded-lg bg-destructive/20 p-4 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold text-destructive">
                      {confusionMatrix.falsePositive}
                    </span>
                    <span className="text-xs text-destructive/80">False Positive</span>
                  </div>
                  <div className="aspect-square rounded-lg bg-destructive/20 p-4 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold text-destructive">
                      {confusionMatrix.falseNegative}
                    </span>
                    <span className="text-xs text-destructive/80">False Negative</span>
                  </div>
                  <div className="aspect-square rounded-lg bg-success/20 p-4 flex flex-col items-center justify-center">
                    <span className="font-mono text-2xl font-bold text-success">
                      {confusionMatrix.trueNegative}
                    </span>
                    <span className="text-xs text-success/80">True Negative</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-sm">Predicted Positive</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span className="text-sm">Predicted Negative</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Live mode uses rule-based detectors on Elastic events. No labeled validation set is available on the running stream.
                </div>
                {detectors.map((detector) => (
                  <div key={detector.name} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{detector.name}</div>
                        <div className="text-xs text-muted-foreground">{detector.rule}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold">{detector.matches}</div>
                        <div className="text-xs text-muted-foreground">matches</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Runtime Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">SSH failures</div>
                <div className="font-mono text-lg font-bold">{thresholds.sshFailure ?? '--'}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">DNS anomalies</div>
                <div className="font-mono text-lg font-bold">{thresholds.dnsAnomaly ?? '--'}</div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Distinct ports</div>
                <div className="font-mono text-lg font-bold">{thresholds.portScanDistinctPorts ?? '--'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              ML Runtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Enabled</span>
                <Badge className={cn(
                  ml.enabled ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground'
                )}>
                  {ml.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bucket size</span>
                <span className="font-mono">{ml.bucketMinutes ?? '--'} min</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Min samples</span>
                <span className="font-mono">{ml.minSamples ?? '--'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
