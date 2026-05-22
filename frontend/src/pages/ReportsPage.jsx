import { useState } from 'react';
import { FileText, Download, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { exportReport } from '@/lib/api';
import { cn } from '@/lib/utils';

const reportTypes = [
  { id: 'executive', name: 'Executive Summary', description: 'High-level overview for leadership' },
  { id: 'technical', name: 'Technical Report', description: 'Detailed technical analysis' },
  { id: 'compliance', name: 'Compliance Report', description: 'Regulatory compliance status' },
  { id: 'incident', name: 'Incident Report', description: 'Detailed incident analysis' },
  { id: 'threat', name: 'Threat Intelligence', description: 'Threat landscape analysis' },
];

const scheduledReports = [
  { name: 'Weekly Executive Summary', schedule: 'Every Monday 9:00 AM', format: 'PDF' },
  { name: 'Daily Threat Report', schedule: 'Every day 6:00 AM', format: 'PDF' },
  { name: 'Monthly Compliance', schedule: 'First of month', format: 'PDF' },
];

const formatRelative = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
};

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState('executive');
  const [dateRange, setDateRange] = useState('7d');
  const [format, setFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [generatedReports, setGeneratedReports] = useState([]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportReport(selectedReport, { dateRange, format });
      const reportType = reportTypes.find((r) => r.id === selectedReport);
      setGeneratedReports((prev) => [
        {
          id: `rpt-${Date.now()}`,
          name: `${reportType?.name} — ${new Date().toLocaleDateString('fr-FR')}`,
          generatedAt: new Date().toISOString(),
          format: format.toUpperCase(),
          type: selectedReport,
          dateRange,
        },
        ...prev,
      ]);
      toast.success('Report exported', { description: 'Your report is ready for download' });
    } catch {
      toast.error('Export failed', { description: 'Please try again later' });
    } finally {
      setIsExporting(false);
    }
  };

  const lastGenerated = generatedReports[0]
    ? formatRelative(generatedReports[0].generatedAt)
    : 'Never';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate technical, incident and executive reports from detections
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report Generator */}
        <Card className="border-border/50 shadow-soft lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Generate Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {reportTypes.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={cn(
                    'p-4 rounded-xl border cursor-pointer transition-all',
                    selectedReport === report.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/30',
                  )}
                >
                  <h4 className="font-medium text-sm">{report.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="custom">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="csv">CSV Export</SelectItem>
                    <SelectItem value="json">JSON Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="invisible">Action</Label>
                <Button
                  className="w-full gap-2"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? 'Generating...' : 'Export Report'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Stats */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Session Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Generated this session</span>
              <span className="font-mono font-medium">{generatedReports.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Scheduled active</span>
              <span className="font-mono font-medium text-success">{scheduledReports.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last generated</span>
              <span className="text-sm">{lastGenerated}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled Reports */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Scheduled Reports
          </CardTitle>
          <Button variant="outline" size="sm">
            Add Schedule
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scheduledReports.map((report, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50',
                  'opacity-0 animate-slide-up',
                )}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">{report.name}</h4>
                    <p className="text-xs text-muted-foreground">{report.schedule}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="outline">{report.format}</Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Generated Reports (session) */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Reports Generated This Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          {generatedReports.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No reports generated yet. Use the form above to create your first report.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {generatedReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{report.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(report.generatedAt)} · {report.dateRange}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{report.format}</Badge>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
