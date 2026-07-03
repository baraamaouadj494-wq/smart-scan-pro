import React from "react";
import { Link, useLocation } from "wouter";
import { ScanLine, FileText, LayoutDashboard, Moon, Sun, Zap, UserCircle } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { useAuth } from "@/contexts/auth-context";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();

  const navItems = [
    { href: "/",          label: "Dashboard", icon: LayoutDashboard },
    { href: "/scan",      label: "Scanner",   icon: ScanLine        },
    { href: "/documents", label: "Library",   icon: FileText        },
  ];

  const attempts = user?.aiAttempts ?? 0;
  const badgeColor = attempts >= 15 ? "bg-green-500/15 text-green-400 border-green-500/20"
    : attempts >= 5 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/20"
    : "bg-red-500/15 text-red-400 border-red-500/20 animate-pulse";

  const initials = user ? user.username.slice(0, 2).toUpperCase() : "?";
  const gradients = ["from-violet-500 to-fuchsia-500", "from-cyan-500 to-blue-500", "from-orange-400 to-rose-500", "from-emerald-400 to-teal-500"];
  const grad = user ? gradients[user.id % gradients.length] : gradients[0];

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      {/* Sidebar — Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar shrink-0">
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-border">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-mono font-bold shrink-0">DS</div>
          <span className="font-bold text-lg tracking-tight">DocScanner AI</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Icon className="w-4 h-4" />{item.label}
              </Link>
            );
          })}
        </nav>

        {/* Attempts badge */}
        {user && (
          <div className="mx-4 mb-3">
            <Link href="/profile">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${badgeColor}`}>
                <Zap className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{attempts} AI attempts left</p>
                  <div className="mt-1 w-full h-1 rounded-full bg-current/20 overflow-hidden">
                    <div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.min(100, (attempts / 20) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Bottom: user + theme */}
        <div className="p-4 border-t border-border flex items-center gap-2">
          <Link href="/profile" className="flex items-center gap-2 flex-1 min-w-0 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
            <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
              {initials}
            </div>
            <span className="text-sm font-medium truncate">{user?.username ?? "Profile"}</span>
          </Link>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto">{children}</div>

        {/* Mobile tab bar */}
        <nav className="md:hidden flex items-center justify-around p-2 border-t border-border bg-sidebar pb-safe shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center gap-1 p-2 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <Link href="/profile" className={`flex flex-col items-center gap-1 p-2 ${location === "/profile" ? "text-primary" : "text-muted-foreground"}`}>
            <UserCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium">Profile</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}
