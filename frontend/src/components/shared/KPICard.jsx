import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export const KPICard = ({ 
  title, 
  value, 
  trend, 
  trendLabel,
  icon: Icon, 
  variant = 'default',
  loading = false,
  delay = 0
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isVisible || loading) return;
    
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numericValue)) {
      // Use a ref pattern instead of setState in effect for non-numeric values
      const timeoutId = setTimeout(() => setDisplayValue(value), 0);
      return () => clearTimeout(timeoutId);
    }

    const duration = 1500;
    const steps = 60;
    const increment = numericValue / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= numericValue) {
        setDisplayValue(numericValue);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, isVisible, loading]);

  const TrendIcon = useMemo(() => {
    const numTrend = parseFloat(trend);
    if (numTrend > 0) return TrendingUp;
    if (numTrend < 0) return TrendingDown;
    return Minus;
  }, [trend]);

  const getTrendColor = () => {
    const numTrend = parseFloat(trend);
    if (variant === 'danger' || variant === 'warning') {
      return numTrend > 0 ? 'text-destructive' : 'text-success';
    }
    return numTrend > 0 ? 'text-success' : numTrend < 0 ? 'text-destructive' : 'text-muted-foreground';
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'border-primary/20 bg-primary/5';
      case 'warning':
        return 'border-warning/20 bg-warning/5';
      case 'danger':
        return 'border-destructive/20 bg-destructive/5';
      case 'success':
        return 'border-success/20 bg-success/5';
      default:
        return 'border-border';
    }
  };

  const getIconStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-primary/10 text-primary';
      case 'warning':
        return 'bg-warning/10 text-warning';
      case 'danger':
        return 'bg-destructive/10 text-destructive';
      case 'success':
        return 'bg-success/10 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const TrendIcon = getTrendIcon();

  if (loading) {
    return (
      <div className={cn("kpi-card", getVariantStyles())}>
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
          </div>
          <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="mt-3 h-4 w-20 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "kpi-card opacity-0",
        getVariantStyles(),
        isVisible && "animate-slide-up"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-bold font-mono tracking-tight text-foreground">
            {typeof displayValue === 'number' ? displayValue.toLocaleString() : displayValue}
          </p>
        </div>
        {Icon && (
          <div className={cn("p-2.5 rounded-lg", getIconStyles())}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-1.5">
          <TrendIcon className={cn("w-4 h-4", getTrendColor())} />
          <span className={cn("text-sm font-medium font-mono", getTrendColor())}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          {trendLabel && (
            <span className="text-xs text-muted-foreground ml-1">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default KPICard;
