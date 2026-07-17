import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
  AlertTriangle,
  Server,
  Brain,
  Activity,
  ShieldCheck,
  Shield,
  Bot,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Network,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

// ─── Pages kept after review ────────────────────────────────────────────────
// Removed: Network Flows (100% fake data), Risk Forecast (fake LSTM claims),
//          Profile, Users, Settings (not relevant to IDPS demo)
const navItems = [
  { path: '/',          icon: LayoutDashboard, label: 'Dashboard',       badge: false },
  { path: '/alerts',    icon: Bell,            label: 'Alerts & Intrusions', badge: true  },
  { path: '/incidents', icon: AlertTriangle,   label: 'Incidents',       badge: false },
  { path: '/stream',    icon: Network,         label: 'Traffic Analysis', badge: false },
  { path: '/hosts',     icon: Server,          label: 'Hosts',           badge: false },
  { path: '/agents',    icon: Bot,             label: 'Agents',          badge: false },
  { path: '/resolution', icon: ShieldCheck,    label: 'Resolution',      badge: false },
  { path: '/model',     icon: Brain,           label: 'Detection Rules', badge: false },
  { path: '/pipeline',  icon: Activity,        label: 'Stack Health',    badge: false },
];

export const Sidebar = ({ collapsed, onToggle }) => {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const { user, alertCount } = useAuth();

  const isCollapsed =
    typeof collapsed === 'boolean' ? collapsed : localCollapsed;

  const handleToggle = () => {
    if (onToggle) { onToggle(); return; }
    setLocalCollapsed((prev) => !prev);
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col transition-all duration-300',
        isCollapsed ? 'w-[72px]' : 'w-72'
      )}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl gradient-teal flex items-center justify-center flex-shrink-0 shadow-glow-teal">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        {!isCollapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="font-bold text-foreground leading-tight">NetSentinel AI</h1>
            <span className="text-xs text-muted-foreground">SOC Elastic + IA</span>
          </div>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar">
        {!isCollapsed && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-success" />
            System Active
          </div>
        )}

        <div className="space-y-1">
          {navItems.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'sidebar-item relative group',
                  isActive && 'active',
                  `stagger-${Math.min(index + 1, 6)}`
                )
              }
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <item.icon
                className={cn(
                  'w-5 h-5 flex-shrink-0 transition-colors',
                  'group-hover:text-primary'
                )}
              />

              {!isCollapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}

              {/* Alert count badge — only rendered when we have a real count */}
              {item.badge && !isCollapsed && alertCount > 0 && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full bg-destructive/10 text-destructive">
                  {alertCount}
                </span>
              )}
              {item.badge && isCollapsed && alertCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
              )}
            </NavLink>
          ))}
        </div>

        {/* ── Danger zone ──────────────────────────────────────────────────── */}
        <div className="mt-2 pt-2 border-t border-border/50">
          {!isCollapsed && (
            <p className="px-2 mb-1 text-[11px] uppercase text-destructive/60">
              Administration
            </p>
          )}
          <NavLink
            to="/reset"
            className={({ isActive }) =>
              cn('sidebar-item relative group', isActive && 'active text-destructive')
            }
          >
            <RotateCcw className="w-5 h-5 flex-shrink-0 text-destructive/70 group-hover:text-destructive transition-colors" />
            {!isCollapsed && (
              <span className="truncate animate-fade-in text-destructive/80 group-hover:text-destructive">
                Reinitialiser
              </span>
            )}
          </NavLink>
        </div>
      </nav>

      {/* ── University branding ───────────────────────────────────────────── */}
      {!isCollapsed && (
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground/80">UY1 - ICTD L3</p>
            <p>Groupe P35</p>
          </div>
        </div>
      )}

      {/* ── Collapse toggle ───────────────────────────────────────────────── */}
      <button
        onClick={handleToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-soft"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
};

export default Sidebar;
