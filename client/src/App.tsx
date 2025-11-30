import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "@/pages/dashboard";
import MachinesPage from "@/pages/machines";
import OperatorsPage from "@/pages/operators";
import MaintenancePage from "@/pages/maintenance";
import ReportsPage from "@/pages/reports";
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
              <Button
                size="icon"
                variant="ghost"
                onClick={() => window.location.href = "/api/logout"}
                title="Sign out"
                data-testid="button-sign-out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/machines" component={MachinesPage} />
              <Route path="/operators" component={OperatorsPage} />
              <Route path="/maintenance" component={MaintenancePage} />
              <Route path="/reports" component={ReportsPage} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
