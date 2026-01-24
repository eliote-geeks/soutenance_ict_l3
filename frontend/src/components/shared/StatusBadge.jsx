import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const statusConfig = {
  open: {
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    label: 'Open',
  },
  investigating: {
    className: 'bg-warning/10 text-warning-foreground border-warning/20',
    label: 'Investigating',
  },
  resolved: {
    className: 'bg-success/10 text-success border-success/20',
    label: 'Resolved',
  },
  false_positive: {
    className: 'bg-muted text-muted-foreground border-border',
    label: 'False Positive',
  },
  active: {
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    label: 'Active',
  },
  contained: {
    className: 'bg-warning/10 text-warning-foreground border-warning/20',
    label: 'Contained',
  },
  healthy: {
    className: 'bg-success/10 text-success border-success/20',
    label: 'Healthy',
  },
  degraded: {
    className: 'bg-warning/10 text-warning-foreground border-warning/20',
    label: 'Degraded',
  },
  down: {
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    label: 'Down',
  },
  online: {
    className: 'bg-success/10 text-success border-success/20',
    label: 'Online',
  },
  offline: {
    className: 'bg-muted text-muted-foreground border-border',
    label: 'Offline',
  },
};

export const StatusBadge = ({ status, className }) => {
  const config = statusConfig[status?.toLowerCase()] || {
    className: 'bg-muted text-muted-foreground border-border',
    label: status,
  };

  return (
    <Badge 
      variant="outline" 
      className={cn("font-medium", config.className, className)}
    >
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
