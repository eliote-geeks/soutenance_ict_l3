import { useState, useEffect } from 'react';
import { Brain, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
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

export default function ModelPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchModel();
        setData(result);
      } catch (error) {
        console.error('Failed to load model data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

  const { versions, featureImportance, confusionMatrix } = data;
  const activeVersion = versions.find(v => v.status === 'active');

  // Calculate metrics from confusion matrix
  const total = confusionMatrix.truePositive + confusionMatrix.falsePositive + 
                confusionMatrix.trueNegative + confusionMatrix.falseNegative;
  const accuracy = ((confusionMatrix.truePositive + confusionMatrix.trueNegative) / total * 100).toFixed(1);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Model & AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ML model performance and feature analysis
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
                    <span className="font-mono font-medium">{(version.precision * 100).toFixed(0)}%</span>
                    <Progress value={version.precision * 100} className="h-1.5 flex-1 [&>div]:bg-primary" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Recall</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{(version.recall * 100).toFixed(0)}%</span>
                    <Progress value={version.recall * 100} className="h-1.5 flex-1 [&>div]:bg-chart-4" />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">F1 Score</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{(version.f1 * 100).toFixed(0)}%</span>
                    <Progress value={version.f1 * 100} className="h-1.5 flex-1 [&>div]:bg-warning" />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
