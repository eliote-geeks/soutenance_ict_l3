import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Bell, Settings, RefreshCw, Wifi, WifiOff, LogOut, User, Users, CheckCheck, RotateCcw } from 'lucide-react';
import { ResetAppDialog } from '@/components/shared/ResetAppDialog';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fetchAlerts } from '@/lib/api';

const SEVERITY_COLOR = { critical: 'text-destructive', high: 'text-warning', medium: 'text-yellow-500' };
const SEVERITY_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium' };

const relativeTime = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export const TopBar = ({ sidebarCollapsed }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { scope, setScope, options } = useScope();
  const navigate = useNavigate();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [environment, setEnvironment] = useState('prod');
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nst-read-notif') || '[]')); } catch { return new Set(); }
  });

  const loadNotifications = useCallback(async () => {
    try {
      const result = await fetchAlerts();
      const alerts = (result?.alerts || [])
        .filter(a => ['critical', 'high', 'medium'].includes(a.severity))
        .sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2 };
          return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
        })
        .slice(0, 8);
      setNotifications(alerts);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(() => {
      setLastRefresh(new Date());
      loadNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const markAllRead = () => {
    const all = new Set(notifications.map(n => n.id));
    setReadIds(all);
    try { localStorage.setItem('nst-read-notif', JSON.stringify([...all])); } catch {}
  };

  const markRead = (id) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('nst-read-notif', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const formatLastRefresh = () => {
    const seconds = Math.floor((new Date() - lastRefresh) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  const initials = user?.name
    ? user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'U';
  const isAdmin = user?.role === 'admin';
  const scopeProfiles = Array.isArray(options.profiles) ? options.profiles : [];
  const scopeAssets = Array.isArray(options.assets) ? options.assets : [];

  return (
    <header className={cn(
      "fixed top-0 right-0 h-16 bg-card/80 backdrop-blur-md border-b border-border z-30 flex items-center gap-4 px-6 transition-all duration-300",
      sidebarCollapsed ? "left-[72px]" : "left-64"
    )}>
      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search... (KQL: severity:critical AND source:firewall)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-background/50 border-border/50 focus:bg-background transition-colors"
        />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        <Select value={environment} onValueChange={setEnvironment}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="prod">Production</SelectItem>
            <SelectItem value="dev">Development</SelectItem>
            <SelectItem value="lab">Lab</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={scope.mode}
          onValueChange={(value) => setScope((prev) => ({
            ...prev,
            mode: value,
            profileId: value === 'profile' ? (prev.profileId || scopeProfiles[0]?.id || '') : '',
            assetId: value === 'asset' ? (prev.assetId || scopeAssets[0]?.id || '') : '',
          }))}
        >
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assets</SelectItem>
            <SelectItem value="profile">Profile</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
          </SelectContent>
        </Select>

        {scope.mode === 'profile' && (
          <Select
            value={scope.profileId || (scopeProfiles[0]?.id ?? '')}
            onValueChange={(value) => setScope((prev) => ({ ...prev, profileId: value }))}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Select profile" />
            </SelectTrigger>
            <SelectContent>
              {scopeProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {scope.mode === 'asset' && (
          <Select
            value={scope.assetId || (scopeAssets[0]?.id ?? '')}
            onValueChange={(value) => setScope((prev) => ({ ...prev, assetId: value }))}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Select asset" />
            </SelectTrigger>
            <SelectContent>
              {scopeAssets.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Badge variant="outline" className="h-7 px-2.5 gap-1.5 cursor-pointer hover:bg-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
          Critical
        </Badge>
        <Badge variant="outline" className="h-7 px-2.5 gap-1.5 cursor-pointer hover:bg-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
          High
        </Badge>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Live status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/20">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-success" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-destructive" />
          )}
          <span className="text-xs font-mono font-medium text-success">LIVE</span>
        </div>

        {/* Last refresh */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
          <span className="font-mono">{formatLastRefresh()}</span>
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={markAllRead}>
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No alerts</div>
            ) : (
              notifications.map((notif) => {
                const isUnread = !readIds.has(notif.id);
                return (
                  <DropdownMenuItem
                    key={notif.id}
                    className={cn(
                      "flex flex-col items-start gap-0.5 py-3 cursor-pointer",
                      isUnread && "bg-accent/30"
                    )}
                    onClick={() => {
                      markRead(notif.id);
                      navigate('/alerts');
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn("font-semibold text-xs", SEVERITY_COLOR[notif.severity])}>
                        {SEVERITY_LABEL[notif.severity] || notif.severity} — {notif.id}
                      </span>
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                    </div>
                    <span className="text-sm text-foreground leading-snug">{notif.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {notif.sourceIP} → {notif.hostname} · {relativeTime(notif.timestamp)}
                    </span>
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-xs text-primary font-medium" onClick={() => navigate('/alerts')}>
              View all alerts →
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start text-left leading-tight">
                <span className="text-xs font-semibold text-foreground">{user?.name}</span>
                <span className="text-[11px] text-muted-foreground">{user?.role}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="w-4 h-4" />
              Profile
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/users')}>
                <Users className="w-4 h-4" />
                Users
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ResetAppDialog
              trigger={
                <DropdownMenuItem
                  onSelect={e => e.preventDefault()}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset App
                </DropdownMenuItem>
              }
            />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;
