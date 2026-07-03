import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import {
  ScanLine, FileText, MessageSquare, Zap, Gift, Check,
  Mail, Shield, RefreshCw, Eye, EyeOff,
} from "lucide-react";

const FEATURES = [
  { icon: ScanLine,      title: "Smart Scanning",       desc: "Camera & upload with auto border detection" },
  { icon: FileText,      title: "Arabic + English OCR", desc: "Extract text from any document instantly" },
  { icon: MessageSquare, title: "AI Chat",               desc: "Ask questions about your documents" },
  { icon: Zap,           title: "AI Summarize",          desc: "Key points & smart summaries in seconds" },
];

type Step = "login" | "register" | "verify";

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail]         = useState("");
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [otp, setOtp]             = useState("");
  const [userId, setUserId]       = useState<number | null>(null);
  const [devCode, setDevCode]     = useState<string | null>(null);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) { setReferralCode(ref); setStep("register"); }
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        if (data.error === "email_not_verified") {
          setUserId(data.userId);
          setStep("verify");
          setSuccess("أرسلنا كود التحقق إلى بريدك. تحقق من الكونسول (dev mode).");
          return;
        }
        setError(data.error || "خطأ في تسجيل الدخول"); return;
      }
      localStorage.setItem("auth_user", JSON.stringify({ username: data.user.username }));
      await refresh();
      navigate("/");
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: email.trim(), password, referralCode: referralCode || undefined }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error || "Registration failed"); return; }
      setUserId(data.userId);
      setDevCode(data.devCode);
      setStep("verify");
      setSuccess(`تم إرسال كود التحقق إلى ${data.email}`);
      setResendCooldown(60);
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: otp.trim() }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error || "Invalid code"); return; }
      localStorage.setItem("auth_user", JSON.stringify({ username: data.user.username }));
      await refresh();
      navigate("/");
    } catch { setError("Connection failed."); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (!userId || resendCooldown > 0) return;
    setError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setDevCode(data.devCode);
      setSuccess("تم إعادة الإرسال.");
      setResendCooldown(60);
    } catch { setError("Failed to resend"); }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left feature panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-1/2 bg-gradient-to-br from-primary/5 via-primary/10 to-background border-r border-border">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">DS</div>
            <span className="text-2xl font-bold">DocScanner AI</span>
          </div>
          <p className="text-muted-foreground text-lg">The legendary document intelligence platform.</p>
        </div>
        <div className="space-y-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Free to start</span>
          </div>
          <p className="text-xs text-muted-foreground">20 free AI attempts on signup. Earn more by inviting friends.</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">DS</div>
            <span className="font-bold text-lg">DocScanner AI</span>
          </div>

          {/* Verify step */}
          {step === "verify" ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">تحقق من بريدك الإلكتروني</h1>
                  <p className="text-sm text-muted-foreground">أدخل كود التحقق المكون من 6 أرقام</p>
                </div>
              </div>

              {devCode && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-sm p-3 rounded-lg mb-4 flex gap-2">
                  <span>🔧 Dev mode — كودك:</span>
                  <span className="font-mono font-bold">{devCode}</span>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm p-3 rounded-lg mb-4">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" /><span>{success}</span>
                </div>
              )}
              {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>}

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>كود التحقق</Label>
                  <Input
                    placeholder="123456" value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="text-center text-2xl font-mono tracking-widest" maxLength={6} required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                  {loading ? "جارٍ التحقق…" : "تحقق وادخل"}
                </Button>
              </form>
              <div className="flex items-center justify-between mt-4 text-sm">
                <button onClick={() => { setStep("login"); setError(""); setSuccess(""); }} className="text-muted-foreground hover:text-foreground">
                  ← رجوع لتسجيل الدخول
                </button>
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="flex items-center gap-1 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resendCooldown > 0 ? `إعادة الإرسال (${resendCooldown}s)` : "إعادة الإرسال"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-1">
                {step === "login" ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-muted-foreground text-sm mb-8">
                {step === "login" ? "Sign in with your email." : "Join and get 20 free AI attempts."}
              </p>

              {success && (
                <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm p-3 rounded-lg mb-4">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" /><span>{success}</span>
                </div>
              )}
              {error && <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>}

              <form onSubmit={step === "login" ? handleLogin : handleRegister} className="space-y-4">
                {step === "register" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" placeholder="your_username" value={username}
                      onChange={e => setUsername(e.target.value)} required autoComplete="username" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@example.com"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="pl-9" required autoComplete="email" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPw ? "text" : "password"} placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="pr-10" required autoComplete={step === "login" ? "current-password" : "new-password"} />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {step === "register" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="refcode">
                      Referral Code <span className="text-muted-foreground font-normal text-xs">(optional, +20 bonus)</span>
                    </Label>
                    <Input id="refcode" placeholder="e.g. AB12CD34" value={referralCode}
                      onChange={e => setReferralCode(e.target.value.toUpperCase())} />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Please wait…" : step === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {step === "login" ? "Don't have an account? " : "Already have an account? "}
                <button
                  onClick={() => { setStep(step === "login" ? "register" : "login"); setError(""); setSuccess(""); }}
                  className="text-primary font-medium hover:underline"
                >
                  {step === "login" ? "Sign up" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
