import { useState, useEffect } from 'react';
import { Search, Sun, Moon, Bell, Settings, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

export const TopBar = ({ sidebarCollapsed }) => {
  const { theme, toggleTheme } = useTheme();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [environment, setEnvironment] = useState('prod');

  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatLastRefresh = () => {
    const seconds = Math.floor((new Date() - lastRefresh) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

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
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                3
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-destructive">Critical Alert</span>
              <span className="text-xs text-muted-foreground">Port scan detected from 45.33.32.156</span>
              <span className="text-xs text-muted-foreground">2 minutes ago</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-warning">High Alert</span>
              <span className="text-xs text-muted-foreground">Brute force attempt on srv-prod-01</span>
              <span className="text-xs text-muted-foreground">5 minutes ago</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-primary">Model Update</span>
              <span className="text-xs text-muted-foreground">ML model v3.2 deployed successfully</span>
              <span className="text-xs text-muted-foreground">15 minutes ago</span>
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

        {/* Settings */}
        <Button variant="ghost" size="icon">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
