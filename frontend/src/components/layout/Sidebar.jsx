import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  FileSearch,
  Bell,
  AlertTriangle,
  Server,
  Brain,
  Activity,
  FileText,
  Shield,
  Bot,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

// ─── Pages kept after review ────────────────────────────────────────────────
// Removed: Network Flows (100% fake data), Risk Forecast (fake LSTM claims),
//          Profile, Users, Settings (not relevant to IDPS demo)
const navItems = [
  { path: '/',          icon: LayoutDashboard, label: 'SOC Overview',    badge: false },
  { path: '/stream',    icon: Radio,           label: 'Telemetry Stream', badge: false },
  { path: '/logs',      icon: FileSearch,      label: 'Elastic Logs',    badge: false },
  { path: '/alerts',    icon: Bell,            label: 'Alerts',          badge: true  },
  { path: '/incidents', icon: AlertTriangle,   label: 'Incidents',       badge: false },
  { path: '/hosts',     icon: Server,          label: 'Assets / Hosts',  badge: false },
  { path: '/agents',    icon: Bot,             label: 'Agents',          badge: false },
  { path: '/model',     icon: Brain,           label: 'AI Detection',    badge: false },
  { path: '/pipeline',  icon: Activity,        label: 'Stack Health',    badge: false },
  { path: '/reports',   icon: FileText,        label: 'Reports',         badge: false },
  { path: '/guide',     icon: BookOpen,        label: 'User Guide',      badge: false },
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
        isCollapsed ? 'w-[72px]' : 'w-64'
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
            <span className="text-xs text-muted-foreground">Elastic + IA Security Lab</span>
          </div>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar">
        {!isCollapsed && (
          <p className="px-2 mb-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">
            Core
          </p>
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
      </nav>

      {/* ── University branding ───────────────────────────────────────────── */}
      {!isCollapsed && (
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground/80">University of Yaoundé I</p>
            <p>Computer Science Dept.</p>
            <p>Group P37</p>
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