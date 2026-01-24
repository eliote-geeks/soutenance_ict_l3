import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { cn } from '@/lib/utils';

export const DashboardLayout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background cyber-grid topo-pattern noise-overlay">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <TopBar sidebarCollapsed={sidebarCollapsed} />
      <main className={cn(
        "pt-16 min-h-screen transition-all duration-300",
        sidebarCollapsed ? "pl-[72px]" : "pl-64"
      )}>
        <div className="p-6 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
