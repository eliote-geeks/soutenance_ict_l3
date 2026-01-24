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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Overview', priority: true },
  { path: '/stream', icon: Radio, label: 'Live Stream', priority: true },
  { path: '/logs', icon: FileSearch, label: 'Logs Explorer' },
  { path: '/alerts', icon: Bell, label: 'Alerts', priority: true, badge: true },
  { path: '/incidents', icon: AlertTriangle, label: 'Incidents' },
  { path: '/hosts', icon: Server, label: 'Assets/Hosts' },
  { path: '/network', icon: Network, label: 'Network Map' },
  { path: '/model', icon: Brain, label: 'Model & AI' },
  { path: '/predictions', icon: TrendingUp, label: 'Predictions', priority: true },
  { path: '/pipeline', icon: Activity, label: 'Pipeline Health' },
  { path: '/reports', icon: FileText, label: 'Reports' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-card border-r border-border z-40 flex flex-col transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-border">
        <div className="w-10 h-10 rounded-xl gradient-teal flex items-center justify-center flex-shrink-0 shadow-glow-teal">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="font-bold text-foreground leading-tight">ElasticGuard</h1>
            <span className="text-xs text-muted-foreground">AI Defense System</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
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
              {!collapsed && (
                <span className="truncate animate-fade-in">{item.label}</span>
              )}
              {item.badge && !collapsed && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full bg-destructive/10 text-destructive">
                  3
                </span>
              )}
              {item.badge && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive" />
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* University branding */}
      {!collapsed && (
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
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors shadow-soft"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
};

export default Sidebar;
