import { Switch, Route, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import MachinesPage from "@/pages/machines";
import CellsPage from "@/pages/cells";
import OperatorsPage from "@/pages/operators";
import MaintenancePage from "@/pages/maintenance";
import ReportsPage from "@/pages/reports";
import ProductionStatsPage from "@/pages/production-stats";
import DowntimePage from "@/pages/downtime";
import ScrapPage from "@/pages/scrap";
import EventsPage from "@/pages/events";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Unauthenticated: show landing page
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full">
        <Switch>
          <Route path="/" component={Landing} />
          <Route component={NotFound} />
        </Switch>
      </div>
    );
  }

  // Authenticated: show full app with sidebar
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/machines" component={MachinesPage} />
              <Route path="/cells" component={CellsPage} />
              <Route path="/operators" component={OperatorsPage} />
              <Route path="/maintenance" component={MaintenancePage} />
              <Route path="/reports" component={ReportsPage} />
              <Route path="/production-stats" component={ProductionStatsPage} />
              <Route path="/downtime" component={DowntimePage} />
              <Route path="/scrap" component={ScrapPage} />
              <Route path="/events" component={EventsPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  // Use Vite's BASE_URL (set from vite.config.ts base) so routes work under /CellStatus/
  const base = import.meta.env.BASE_URL || "/";
  return (
    <Router base={base}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </Router>
  );
}
