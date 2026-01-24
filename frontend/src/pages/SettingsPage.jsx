import { useEffect, useState } from 'react';
import { Bell, Clock, Database, Gauge, LayoutPanelTop, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';

const STORAGE_KEY = 'elasticguard-settings';

const DEFAULT_SETTINGS = {
  autoRefresh: true,
  refreshInterval: '5s',
  liveStream: true,
  alertSound: true,
  anomalySensitivity: 72,
  predictionWindow: 12,
  retentionDays: '30',
  showMitre: true,
};

const readSettings = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(readSettings);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.success('Settings reset to defaults.');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Control data refresh, anomaly detection, and reporting preferences.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset}>
          Reset defaults
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutPanelTop className="h-4 w-4 text-primary" />
              Dashboard behavior
            </CardTitle>
            <CardDescription>Adjust refresh and live monitoring behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto refresh</Label>
                <p className="text-xs text-muted-foreground">Keep live widgets up to date.</p>
              </div>
              <Switch
                checked={settings.autoRefresh}
                onCheckedChange={(value) => setSettings((prev) => ({ ...prev, autoRefresh: value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Refresh interval</Label>
              <Select
                value={settings.refreshInterval}
                onValueChange={(value) => setSettings((prev) => ({ ...prev, refreshInterval: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5s">Every 5 seconds</SelectItem>
                  <SelectItem value="10s">Every 10 seconds</SelectItem>
                  <SelectItem value="30s">Every 30 seconds</SelectItem>
                  <SelectItem value="60s">Every 1 minute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Live stream overlay</Label>
                <p className="text-xs text-muted-foreground">Show real-time packet feed.</p>
              </div>
              <Switch
                checked={settings.liveStream}
                onCheckedChange={(value) => setSettings((prev) => ({ ...prev, liveStream: value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">MITRE ATT&CK overlay</Label>
                <p className="text-xs text-muted-foreground">Display tactics on incidents view.</p>
              </div>
              <Switch
                checked={settings.showMitre}
                onCheckedChange={(value) => setSettings((prev) => ({ ...prev, showMitre: value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-warning" />
              Detection tuning
            </CardTitle>
            <CardDescription>Configure AI sensitivity and forecasting horizon.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm">Anomaly sensitivity</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[settings.anomalySensitivity]}
                  max={100}
                  step={1}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, anomalySensitivity: value[0] }))}
                />
                <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                  {settings.anomalySensitivity}%
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Prediction horizon</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[settings.predictionWindow]}
                  min={6}
                  max={24}
                  step={1}
                  onValueChange={(value) => setSettings((prev) => ({ ...prev, predictionWindow: value[0] }))}
                />
                <span className="text-xs font-mono text-muted-foreground w-10 text-right">
                  {settings.predictionWindow}h
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-destructive" />
              Alerting
            </CardTitle>
            <CardDescription>Control how alerts reach operators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Sound notifications</Label>
                <p className="text-xs text-muted-foreground">Play sound for critical alerts.</p>
              </div>
              <Switch
                checked={settings.alertSound}
                onCheckedChange={(value) => setSettings((prev) => ({ ...prev, alertSound: value }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Quiet hours</Label>
                <p className="text-xs text-muted-foreground">Pause sound alerts after hours.</p>
              </div>
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4" />
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-soft">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Data retention
            </CardTitle>
            <CardDescription>Set how long events and logs are stored.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm">Retention period</Label>
              <Select
                value={settings.retentionDays}
                onValueChange={(value) => setSettings((prev) => ({ ...prev, retentionDays: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>AI snapshots stored in cold tier.</span>
              </div>
              <Button variant="ghost" size="sm">Review</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
