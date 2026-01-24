import { useState } from 'react';
import { FileText, Download, Calendar, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  { name: 'Weekly Executive Summary', schedule: 'Every Monday 9:00 AM', format: 'PDF', status: 'active' },
  { name: 'Daily Threat Report', schedule: 'Every day 6:00 AM', format: 'PDF', status: 'active' },
  { name: 'Monthly Compliance', schedule: 'First of month', format: 'PDF', status: 'active' },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState('executive');
  const [dateRange, setDateRange] = useState('7d');
  const [format, setFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportReport(selectedReport, { dateRange, format });
      toast.success('Report exported', { description: 'Your report is ready for download' });
    } catch (error) {
      toast.error('Export failed', { description: 'Please try again later' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and schedule security reports
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
            {/* Report type selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {reportTypes.map((report) => (
                <div
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={cn(
                    "p-4 rounded-xl border cursor-pointer transition-all",
                    selectedReport === report.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  )}
                >
                  <h4 className="font-medium text-sm">{report.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                </div>
              ))}
            </div>

            {/* Options */}
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

        {/* Quick Stats */}
        <Card className="border-border/50 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Report Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reports generated</span>
              <span className="font-mono font-medium">247</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">This month</span>
              <span className="font-mono font-medium">23</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Scheduled active</span>
              <span className="font-mono font-medium text-success">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last generated</span>
              <span className="text-sm">2 hours ago</span>
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
                  "flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50",
                  "opacity-0 animate-slide-up"
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

      {/* Recent Reports */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { name: 'Executive Summary - Week 4', date: 'Jan 28, 2025', format: 'PDF', size: '2.4 MB' },
              { name: 'Daily Threat Report', date: 'Jan 27, 2025', format: 'PDF', size: '1.1 MB' },
              { name: 'Incident Analysis - INC-00097', date: 'Jan 26, 2025', format: 'PDF', size: '856 KB' },
              { name: 'Compliance Report - Q4', date: 'Jan 20, 2025', format: 'PDF', size: '4.2 MB' },
            ].map((report, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{report.name}</p>
                    <p className="text-xs text-muted-foreground">{report.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{report.size}</span>
                  <Button variant="ghost" size="sm">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
