import React from "react";
import { Switch, Route, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import Dashboard from "@/pages/dashboard-vsm";
import Machines from "@/pages/machines";
import VSMBuilder from "@/pages/vsm-builder";
import NotFound from "@/pages/not-found";


import PasswordScreen from "@/pages/password-screen";
import { setApiPassword } from "./lib/queryClient";


function AppContent() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  React.useEffect(() => {
    const pw = sessionStorage.getItem("apiPassword");
    console.log("[App] Restoring password from sessionStorage:", pw);
    if (pw) {
      setApiPassword(pw);
      setAuthenticated(true);
    } else {
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  // Store password and authenticate
  const handlePasswordSuccess = (password: string) => {
    setApiPassword(password);
    sessionStorage.setItem("apiPassword", password);
    setAuthenticated(true);
  };

  if (loading) return null;
  if (!authenticated) {
    return <PasswordScreen onSuccess={handlePasswordSuccess} />;
  }

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
              <Route path="/machines" component={Machines} />
              <Route path="/vsm-builder" component={VSMBuilder} />
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
