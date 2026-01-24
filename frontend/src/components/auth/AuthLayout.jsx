import { Navigate, Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const AuthLayout = () => {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background cyber-grid topo-pattern noise-overlay flex items-center justify-center p-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 right-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-8 left-8 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl gradient-teal flex items-center justify-center flex-shrink-0 shadow-glow-teal">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">ElasticGuard</h1>
            <p className="text-xs text-muted-foreground">AI Defense System</p>
          </div>
        </div>
        <Outlet />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo workspace for Universite de Yaounde I - Network specialty
        </p>
      </div>
    </div>
  );
};

export default AuthLayout;
