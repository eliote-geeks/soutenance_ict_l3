import { useState, useEffect } from 'react';
import { FileSearch, Search, Calendar, Download, ChevronDown, ChevronRight, Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { fetchLogs } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function LogsExplorerPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [logLevel, setLogLevel] = useState('all');
  const [filterChips, setFilterChips] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await fetchLogs({ timeRange, level: logLevel });
        setLogs(result.logs);
      } catch (error) {
        console.error('Failed to load logs:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [timeRange, logLevel]);

  const addFilterChip = (type, value) => {
    const chip = { type, value, id: Date.now() };
    if (!filterChips.some(c => c.type === type && c.value === value)) {
      setFilterChips([...filterChips, chip]);
    }
  };

  const removeFilterChip = (id) => {
    setFilterChips(filterChips.filter(c => c.id !== id));
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-destructive bg-destructive/10';
      case 'WARN': return 'text-warning bg-warning/10';
      case 'INFO': return 'text-primary bg-primary/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        log.source.toLowerCase().includes(query) ||
        JSON.stringify(log.fields).toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <LoadingSkeleton className="h-10 flex-1" />
          <LoadingSkeleton className="h-10 w-32" />
          <LoadingSkeleton className="h-10 w-32" />
        </div>
        <LoadingSkeleton variant="table" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and analyze security event logs
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Query Builder */}
      <Card className="border-border/50 shadow-soft">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search input */}
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder='Search logs... (e.g., source:firewall AND level:ERROR)'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 font-mono text-sm"
              />
            </div>

            {/* Time range */}
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="6h">Last 6 hours</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>

            {/* Log level */}
            <Select value={logLevel} onValueChange={setLogLevel}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
                <SelectItem value="WARN">Warning</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="DEBUG">Debug</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon">
              <Filter className="w-4 h-4" />
            </Button>
          </div>

          {/* Filter chips */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {filterChips.map(chip => (
                <Badge
                  key={chip.id}
                  variant="secondary"
                  className="gap-1.5 pr-1"
                >
                  <span className="text-muted-foreground">{chip.type}:</span>
                  <span className="font-mono">{chip.value}</span>
                  <button
                    onClick={() => removeFilterChip(chip.id)}
                    className="ml-1 p-0.5 rounded hover:bg-muted"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterChips([])}
                className="text-xs h-6"
              >
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Showing <span className="font-mono font-medium text-foreground">{filteredLogs.length}</span> results
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{timeRange}</span>
          <span>•</span>
          <span>Auto-refresh: 30s</span>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="border-border/50 shadow-soft">
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="divide-y divide-border">
              {filteredLogs.map((log, index) => (
                <Collapsible
                  key={log.id}
                  open={expandedLog === log.id}
                  onOpenChange={(open) => setExpandedLog(open ? log.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <div
                      className={cn(
                        "flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer",
                        "opacity-0 animate-slide-up"
                      )}
                      style={{ animationDelay: `${Math.min(index * 20, 500)}ms` }}
                    >
                      {/* Expand icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {expandedLog === log.id ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="flex-shrink-0 w-36">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>

                      {/* Level */}
                      <div className="flex-shrink-0 w-16">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          getLevelColor(log.level)
                        )}>
                          {log.level}
                        </span>
                      </div>

                      {/* Source */}
                      <div className="flex-shrink-0 w-32">
                        <span 
                          className="font-mono text-xs text-primary cursor-pointer hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            addFilterChip('source', log.source);
                          }}
                        >
                          {log.source}
                        </span>
                      </div>

                      {/* Message */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {log.message}
                        </p>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 ml-8">
                      <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
                        <h4 className="text-xs font-medium text-muted-foreground mb-3">
                          Event Details
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {Object.entries(log.fields).map(([key, value]) => (
                            <div key={key}>
                              <span className="text-xs text-muted-foreground block">
                                {key}
                              </span>
                              <span 
                                className="font-mono text-sm cursor-pointer hover:text-primary"
                                onClick={() => addFilterChip(key, String(value))}
                              >
                                {String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">
                            Raw Message
                          </h4>
                          <pre className="font-mono text-xs text-muted-foreground bg-background p-3 rounded overflow-x-auto">
                            {log.message}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
