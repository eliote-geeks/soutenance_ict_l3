import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export const AnomalyGauge = ({ value, threshold, size = 'default' }) => {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setAnimatedValue(value);
        clearInterval(timer);
      } else {
        setAnimatedValue(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const percentage = Math.min((animatedValue / 100) * 100, 100);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference * 0.75;

  const getColor = () => {
    if (animatedValue >= threshold) return 'hsl(var(--destructive))';
    if (animatedValue >= threshold * 0.7) return 'hsl(var(--warning))';
    return 'hsl(var(--primary))';
  };

  const dimensions = size === 'large' ? { width: 180, height: 140 } : { width: 140, height: 110 };

  return (
    <div className="relative flex flex-col items-center">
      <svg 
        width={dimensions.width} 
        height={dimensions.height} 
        viewBox="0 0 120 95" 
        className="transform -rotate-90"
      >
        {/* Background arc */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke={getColor()}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            filter: `drop-shadow(0 0 8px ${getColor()})`,
          }}
        />
        {/* Threshold marker */}
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          strokeDasharray="4 4"
          strokeDashoffset={circumference - (threshold / 100) * circumference * 0.75}
          opacity="0.5"
        />
      </svg>
      
      {/* Value display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
        <span 
          className="text-3xl font-bold font-mono"
          style={{ color: getColor() }}
        >
          {Math.round(animatedValue)}
        </span>
        <span className="text-xs text-muted-foreground mt-1">Anomaly Score</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>Normal</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning" />
          <span>Elevated</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-destructive" />
          <span>Critical</span>
        </div>
      </div>
    </div>
  );
};

export default AnomalyGauge;
