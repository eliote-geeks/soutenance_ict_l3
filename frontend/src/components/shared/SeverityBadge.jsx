import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const severityConfig = {
  critical: {
    className: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
    dot: 'bg-destructive',
  },
  high: {
    className: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
    dot: 'bg-destructive',
  },
  medium: {
    className: 'bg-warning/10 text-warning-foreground border-warning/20 hover:bg-warning/20',
    dot: 'bg-warning',
  },
  low: {
    className: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
    dot: 'bg-primary',
  },
  info: {
    className: 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
    dot: 'bg-muted-foreground',
  },
};

export const SeverityBadge = ({ severity, showDot = true, className }) => {
  const config = severityConfig[severity?.toLowerCase()] || severityConfig.info;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-medium capitalize gap-1.5",
        config.className,
        className
      )}
    >
      {showDot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      )}
      {severity}
    </Badge>
  );
};

export default SeverityBadge;
