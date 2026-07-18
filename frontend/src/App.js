import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { ScopeProvider } from '@/context/ScopeContext';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ProtectedLayout } from '@/components/auth/ProtectedLayout';
import { Toaster } from '@/components/ui/sonner';
import AIAssistant from '@/components/shared/AIAssistant';
import SetupPage from '@/pages/SetupPage';
import { getApiBaseUrl } from '@/lib/api';

// ─── Active pages ────────────────────────────────────────────────────────────
import OverviewPage      from '@/pages/OverviewPage';
import LiveStreamPage    from '@/pages/LiveStreamPage';
import LogsExplorerPage  from '@/pages/LogsExplorerPage';
import AlertsPage        from '@/pages/AlertsPage';
import IncidentsPage     from '@/pages/IncidentsPage';
import HostsPage         from '@/pages/HostsPage';
import AgentsPage        from '@/pages/AgentsPage';
import ResolutionPage    from '@/pages/ResolutionPage';
import ModelPage         from '@/pages/ModelPage';
import NetworkMapPage    from '@/pages/NetworkMapPage';
import PipelinePage      from '@/pages/PipelinePage';
import ReportsPage       from '@/pages/ReportsPage';
import UserGuidePage     from '@/pages/UserGuidePage';
import ResetPage         from '@/pages/ResetPage';

// ─── Auth pages ─────────────────────────────────────────────────────────────
import LoginPage         from '@/pages/auth/LoginPage';
import RegisterPage      from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

// ─── Removed pages ──────────────────────────────────────────────────────────
// NetworkMapPage   → removed: static network diagram, not backed by Elastic
// PredictionsPage  → claims LSTM which is not implemented
// UsersPage        → no user management backend
// ProfilePage      → removed: no backend-backed profile data
// SettingsPage     → no backend for settings

function SetupGuard({ children }) {
  const [checked, setChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/setup/status`)
      .then(r => r.json())
      .then(d => { setNeedsSetup(!d.configured); setChecked(true); })
      .catch(() => setChecked(true)); // backend unreachable → skip guard, show normal app
  }, []);

  if (!checked) return null; // brief blank while checking
  if (needsSetup) return <Navigate to="/setup" replace />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ScopeProvider>
          <BrowserRouter>
            <Routes>
              {/* ── Setup wizard (public, no auth, no sidebar) ──────────── */}
              <Route path="/setup" element={<SetupPage />} />

              {/* ── Auth routes (no sidebar) ────────────────────────────── */}
              <Route element={<AuthLayout />}>
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot"   element={<ForgotPasswordPage />} />
              </Route>

              {/* ── Protected routes (with sidebar) ─────────────────────── */}
              <Route element={<SetupGuard><ProtectedLayout /></SetupGuard>}>
                <Route path="/"          element={<OverviewPage />} />
                <Route path="/stream"    element={<LiveStreamPage />} />
                <Route path="/network"   element={<NetworkMapPage />} />
                <Route path="/logs"      element={<LogsExplorerPage />} />
                <Route path="/alerts"    element={<AlertsPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/hosts"     element={<HostsPage />} />
                <Route path="/agents"    element={<AgentsPage />} />
                <Route path="/resolution" element={<ResolutionPage />} />
                <Route path="/model"     element={<ModelPage />} />
                <Route path="/pipeline"  element={<PipelinePage />} />
                <Route path="/reports"   element={<ReportsPage />} />
                <Route path="/guide"     element={<UserGuidePage />} />
                <Route path="/reset"     element={<ResetPage />} />

                {/* Redirect old routes to home instead of 404 */}
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
