import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import NotFound from "@/pages/not-found";

import Layout from "@/components/layout";
import Home from "@/pages/home";
import Scanner from "@/pages/scanner";
import Documents from "@/pages/documents";
import DocumentDetail from "@/pages/document-detail";
import Chat from "@/pages/chat";
import AuthPage from "@/pages/AuthPage";
import ProfilePage from "@/pages/profile";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">DS</div>
          <p className="text-muted-foreground animate-pulse text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route>
        {!user ? (
          <Redirect to="/auth" />
        ) : (
          <Layout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/scan" component={Scanner} />
              <Route path="/documents" component={Documents} />
              <Route path="/documents/:id" component={DocumentDetail} />
              <Route path="/chat/:id" component={Chat} />
              <Route path="/profile" component={ProfilePage} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        )}
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="docscanner-theme">
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
