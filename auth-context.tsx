import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  emailVerified: boolean;
  aiAttempts: number;
  referralCode: string | null;
  referralCount: number;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const savedUser = localStorage.getItem("auth_user");
    if (!savedUser) { setUser(null); setIsLoading(false); return; }
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        localStorage.removeItem("auth_user");
        setUser(null);
      } else {
        const data = await res.json() as { user: AuthUser };
        setUser(data.user);
        localStorage.setItem("auth_user", JSON.stringify({ username: data.user.username }));
      }
    } catch {
      const parsed = JSON.parse(savedUser) as { username: string };
      setUser({ id: 0, username: parsed.username, email: null, emailVerified: false, aiAttempts: 0, referralCode: null, referralCount: 0 });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const logout = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    localStorage.removeItem("auth_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, refresh: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
