import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Radio, 
  FileSearch, 
  Bell, 
  AlertTriangle, 
  Server, 
  Network, 
  Brain, 
  TrendingUp, 
  Activity, 
  FileText,
  Shield,
  Users,
  User,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'SOC Overview', priority: true },
  { path: '/stream', icon: Radio, label: 'Telemetry Stream', priority: true },
  { path: '/logs', icon: FileSearch, label: 'Elastic Logs' },
  { path: '/alerts', icon: Bell, label: 'Alerts', priority: true, badge: true },
  { path: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { path: '/hosts', icon: Server, label: 'Assets/Hosts' },
  { path: '/network', icon: Network, label: 'Network Flows' },
  { path: '/model', icon: Brain, label: 'AI Detection' },
  { path: '/predictions', icon: TrendingUp, label: 'Risk Forecast', priority: true },
  { path: '/pipeline', icon: Activity, label: 'Stack Health' },
  { path: '/reports', icon: FileText, label: 'Reports' },
];

const accountItems = [
  { path: '/profile', icon: User, label: 'Profile' },
  { path: '/users', icon: Users, label: 'Users', adminOnly: true },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export const Sidebar = ({ collapsed, onToggle }) => {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const { user } = useAuth();
  const isCollapsed = typeof collapsed === 'boolean' ? collapsed : localCollapsed;
  const isAdmin = user?.role === 'admin';
  const visibleAccountItems = accountItems.filter((item) => !item.adminOnly || isAdmin);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
      return;
    }
    setLocalCollapsed((prev) => !prev);
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col transition-all duration-300",
        isCollapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
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

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar space-y-6">
        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              Core
            </p>
          )}
          {navItems.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "sidebar-item relative group",
                isActive && "active",
                `stagger-${Math.min(index + 1, 6)}`
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <item.icon className={cn(
                "w-5 h-5 flex-shrink-0 transition-colors",
                "group-hover:text-primary"
              )} />
              {!isCollapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}
              {item.badge && !isCollapsed && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full bg-destructive/10 text-destructive">
                  3
                </span>
              )}
              {item.badge && isCollapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
              )}
            </NavLink>
          ))}
        </div>

        <div className="space-y-1">
          {!isCollapsed && (
            <p className="px-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              Account
            </p>
          )}
          {visibleAccountItems.map((item, index) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "sidebar-item relative group",
                isActive && "active",
                `stagger-${Math.min(index + 1, 6)}`
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <item.icon className={cn(
                "w-5 h-5 flex-shrink-0 transition-colors",
                "group-hover:text-primary"
              )} />
              {!isCollapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* University branding */}
      {!isCollapsed && (
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p className="font-medium text-foreground/80">Université de Yaoundé I</p>
            <p>Département Informatique</p>
            <p>Groupe P37</p>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={handleToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-soft"
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
