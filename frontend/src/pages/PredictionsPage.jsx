import { useState, useEffect } from 'react';
import { TrendingUp, Target, AlertTriangle, Brain, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PredictionChart } from '@/components/charts/PredictionChart';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchPredictions } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function PredictionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchPredictions();
        setData(result);
      } catch (error) {
        console.error('Failed to load predictions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="chart" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LoadingSkeleton variant="card" />
          <LoadingSkeleton variant="card" />
        </div>
      </div>
    );
  }

  const { forecast, nextTargets, riskTrend, confidence } = data;

  // Calculate forecast summary
  const currentHour = new Date().getHours();
  const nextHours = forecast.slice(currentHour, currentHour + 6);
  const avgPredicted = Math.round(nextHours.reduce((a, b) => a + b.predicted, 0) / nextHours.length);
  const maxPredicted = Math.max(...nextHours.map(h => h.upper));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Predictions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered threat forecasting and risk assessment
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {(confidence * 100).toFixed(0)}% Confidence
            </span>
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              "gap-1.5",
              riskTrend === 'increasing' && "bg-destructive/10 text-destructive border-destructive/20",
              riskTrend === 'decreasing' && "bg-success/10 text-success border-success/20",
              riskTrend === 'stable' && "bg-muted text-muted-foreground"
            )}
          >
            {riskTrend === 'increasing' ? (
              <ArrowUp className="w-3 h-3" />
            ) : riskTrend === 'decreasing' ? (
              <ArrowDown className="w-3 h-3" />
            ) : null}
            Risk {riskTrend}
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg. Predicted (6h)</p>
                <p className="text-2xl font-bold font-mono">{avgPredicted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-warning/10">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Peak Estimate</p>
                <p className="text-2xl font-bold font-mono text-warning">{maxPredicted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-destructive/10">
                <Target className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">At-Risk Hosts</p>
                <p className="text-2xl font-bold font-mono text-destructive">{nextTargets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 24h Forecast Chart */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">
            24-Hour Anomaly Forecast
          </CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-primary rounded" />
              Predicted
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-primary/20 rounded" />
              Confidence Band
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PredictionChart data={forecast} height={350} />
        </CardContent>
      </Card>

      {/* Next Likely Targets */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-destructive" />
            Next Likely Targets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {nextTargets.map((target, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/50",
                  "opacity-0 animate-slide-up"
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Risk indicator */}
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center font-bold font-mono text-lg",
                  target.probability >= 0.7 && "bg-destructive/10 text-destructive",
                  target.probability >= 0.5 && target.probability < 0.7 && "bg-warning/10 text-warning",
                  target.probability < 0.5 && "bg-primary/10 text-primary",
                )}>
                  {(target.probability * 100).toFixed(0)}%
                </div>
                
                {/* Target info */}
                <div className="flex-1">
                  <h4 className="font-mono font-medium text-foreground">
                    {target.hostname}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {target.reason}
                  </p>
                </div>
                
                {/* Progress bar */}
                <div className="w-48 hidden md:block">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Probability</span>
                    <span className={cn(
                      "font-mono font-medium",
                      target.probability >= 0.7 && "text-destructive",
                      target.probability >= 0.5 && target.probability < 0.7 && "text-warning",
                      target.probability < 0.5 && "text-primary",
                    )}>
                      {(target.probability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={target.probability * 100} 
                    className={cn(
                      "h-2",
                      target.probability >= 0.7 && "[&>div]:bg-destructive",
                      target.probability >= 0.5 && target.probability < 0.7 && "[&>div]:bg-warning",
                      target.probability < 0.5 && "[&>div]:bg-primary",
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Prediction Methodology
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <div>
                  <p className="font-medium">Historical Pattern Analysis</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Analyzes past 30 days of attack patterns and anomalies
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div>
                  <p className="font-medium">Time Series Forecasting</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    LSTM neural network with attention mechanism
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <div>
                  <p className="font-medium">Risk Factor Weighting</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Combines host criticality, exposure, and vulnerability scores
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Confidence Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Data Quality</span>
                  <span className="font-mono text-primary">94%</span>
                </div>
                <Progress value={94} className="h-2 [&>div]:bg-primary" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Model Accuracy</span>
                  <span className="font-mono text-primary">91%</span>
                </div>
                <Progress value={91} className="h-2 [&>div]:bg-primary" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Pattern Coverage</span>
                  <span className="font-mono text-warning">78%</span>
                </div>
                <Progress value={78} className="h-2 [&>div]:bg-warning" />
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Temporal Stability</span>
                  <span className="font-mono text-primary">86%</span>
                </div>
                <Progress value={86} className="h-2 [&>div]:bg-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
