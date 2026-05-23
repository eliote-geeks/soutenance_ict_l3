import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ScopeProvider } from '@/context/ScopeContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ProtectedLayout } from '@/components/auth/ProtectedLayout';
import { Toaster } from '@/components/ui/sonner';
import AIAssistant from '@/components/shared/AIAssistant';

// ─── Active pages ────────────────────────────────────────────────────────────
import OverviewPage      from '@/pages/OverviewPage';
import LiveStreamPage    from '@/pages/LiveStreamPage';
import LogsExplorerPage  from '@/pages/LogsExplorerPage';
import AlertsPage        from '@/pages/AlertsPage';
import IncidentsPage     from '@/pages/IncidentsPage';
import HostsPage         from '@/pages/HostsPage';
import AgentsPage        from '@/pages/AgentsPage';
import ModelPage         from '@/pages/ModelPage';
import PipelinePage      from '@/pages/PipelinePage';
import ReportsPage       from '@/pages/ReportsPage';
import UserGuidePage     from '@/pages/UserGuidePage';

// ─── Auth pages ─────────────────────────────────────────────────────────────
import LoginPage         from '@/pages/auth/LoginPage';
import RegisterPage      from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

// ─── Removed pages ──────────────────────────────────────────────────────────
// NetworkMapPage   → 100% fake/hardcoded data, misleads the jury
// PredictionsPage  → claims LSTM which is not implemented
// UsersPage        → no user management backend
// ProfilePage      → hardcoded mock data
// SettingsPage     → no backend for settings

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ScopeProvider>
          <BrowserRouter>
            <Routes>
              {/* ── Auth routes (no sidebar) ────────────────────────────── */}
              <Route element={<AuthLayout />}>
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot"   element={<ForgotPasswordPage />} />
              </Route>

              {/* ── Protected routes (with sidebar) ─────────────────────── */}
              <Route element={<ProtectedLayout />}>
                <Route path="/"          element={<OverviewPage />} />
                <Route path="/stream"    element={<LiveStreamPage />} />
                <Route path="/logs"      element={<LogsExplorerPage />} />
                <Route path="/alerts"    element={<AlertsPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/hosts"     element={<HostsPage />} />
                <Route path="/agents"    element={<AgentsPage />} />
                <Route path="/model"     element={<ModelPage />} />
                <Route path="/pipeline"  element={<PipelinePage />} />
                <Route path="/reports"   element={<ReportsPage />} />
                <Route path="/guide"     element={<UserGuidePage />} />

                {/* Redirect old routes to home instead of 404 */}
                <Route path="/network"     element={<Navigate to="/" replace />} />
                <Route path="/predictions" element={<Navigate to="/" replace />} />
                <Route path="/profile"     element={<Navigate to="/" replace />} />
                <Route path="/users"       element={<Navigate to="/" replace />} />
                <Route path="/settings"    element={<Navigate to="/" replace />} />

                {/* Catch-all → home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>

            <Toaster position="bottom-right" />
            <AIAssistant />
          </BrowserRouter>
        </ScopeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;