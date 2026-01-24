import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ProtectedLayout } from '@/components/auth/ProtectedLayout';
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
import UsersPage from '@/pages/UsersPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/SettingsPage';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot" element={<ForgotPasswordPage />} />
            </Route>
            <Route element={<ProtectedLayout />}>
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
              <Route path="/users" element={<UsersPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
          <Toaster position="bottom-right" />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
