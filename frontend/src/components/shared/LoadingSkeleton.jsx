import { cn } from '@/lib/utils';

export const LoadingSkeleton = ({ className, variant = 'default' }) => {
  if (variant === 'card') {
    return (
      <div className={cn("rounded-xl border bg-card p-6 space-y-4", className)}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border bg-card">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            <div className="h-4 flex-1 bg-muted rounded animate-pulse" />
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            <div className="h-6 w-16 bg-muted rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn("rounded-xl border bg-card p-6", className)}>
        <div className="flex items-center justify-between mb-6">
          <div className="h-5 w-40 bg-muted rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
            <div className="h-6 w-16 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="h-64 bg-muted/30 rounded-lg animate-pulse flex items-end justify-around gap-2 p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div 
              key={i} 
              className="w-full bg-muted rounded-t animate-pulse" 
              style={{ height: `${Math.random() * 60 + 20}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-4 bg-muted rounded animate-pulse", className)} />
  );
};

export default LoadingSkeleton;
