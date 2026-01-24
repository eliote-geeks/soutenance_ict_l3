import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Toaster } from '@/components/ui/sonner';

// Pages
import OverviewPage from '@/pages/OverviewPage';
import LiveStreamPage from '@/pages/LiveStreamPage';
import LogsExplorerPage from '@/pages/LogsExplorerPage';
import AlertsPage from '@/pages/AlertsPage';
import IncidentsPage from '@/pages/IncidentsPage';
import HostsPage from '@/pages/HostsPage';
import NetworkMapPage from '@/pages/NetworkMapPage';
import ModelPage from '@/pages/ModelPage';
import PredictionsPage from '@/pages/PredictionsPage';
import PipelinePage from '@/pages/PipelinePage';
import ReportsPage from '@/pages/ReportsPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/stream" element={<LiveStreamPage />} />
            <Route path="/logs" element={<LogsExplorerPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/hosts" element={<HostsPage />} />
            <Route path="/network" element={<NetworkMapPage />} />
            <Route path="/model" element={<ModelPage />} />
            <Route path="/predictions" element={<PredictionsPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Routes>
        </DashboardLayout>
        <Toaster position="bottom-right" />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
