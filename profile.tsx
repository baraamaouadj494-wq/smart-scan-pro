import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap, Copy, Gift, Users, Shield, LogOut, Lock, TrendingUp, Star,
  Check, Loader2, ClipboardList, Bitcoin, ChevronDown, ChevronUp,
  BookOpen, Plus, Trash2, Monitor, Clock, FileText, BarChart3, Globe,
} from "lucide-react";

const PACKAGES = [
  { id: "starter",  label: "Starter",  attempts: 50,  usdt: 3,  popular: false },
  { id: "standard", label: "Standard", attempts: 120, usdt: 7,  popular: true  },
  { id: "pro",      label: "Pro",      attempts: 300, usdt: 15, popular: false },
];

const WALLETS = [
  { id: "usdt_trc20", name: "USDT (TRC-20)", network: "Tron Network",     color: "text-green-500",  bg: "bg-green-500/10",  address: "TMDQE4bbxu2jSugbrNdUKb9jbHQUaAXreE" },
  { id: "btc",        name: "Bitcoin",        network: "Bitcoin Network",   color: "text-orange-500", bg: "bg-orange-500/10", address: "bc1qt6xwdylvj2s00ty3e8cdyug50n7etav6qywu62" },
];

interface VocabWord { id: number; word: string; translation: string | null; language: string | null; notes: string | null; createdAt: string; }
interface LoginEntry { id: number; ip: string | null; userAgent: string | null; createdAt: string; }
interface Stats { total: number; processed: number; ocrDone: number; totalPages: number; favorites: number; archived: number; languageBreakdown: { ar: number; en: number; both: number }; docTypes: Record<string, number>; }

const LANG_NAMES: Record<string, string> = {
  en: "English", ar: "العربية", fr: "Français", es: "Español",
  de: "Deutsch", it: "Italiano", tr: "Türkçe", ru: "Русский", zh: "中文", ja: "日本語",
};

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const { toast } = useToast();

  // Payment
  const [selectedPkg,    setSelectedPkg]    = useState("standard");
  const [selectedWallet, setSelectedWallet] = useState("usdt_trc20");
  const [txHash,         setTxHash]         = useState("");
  const [submitLoading,  setSubmitLoading]  = useState(false);
  const [submitted,      setSubmitted]      = useState(false);
  const [verifyResult,   setVerifyResult]   = useState<{ verified: boolean; reason: string; attemptsAdded?: number } | null>(null);
  const [showWallets,    setShowWallets]    = useState(false);

  // Security
  const [pwLoading,  setPwLoading]  = useState(false);
  const [currentPw,  setCurrentPw]  = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");

  // Vocabulary
  const [vocab,        setVocab]        = useState<VocabWord[]>([]);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [newWord,      setNewWord]      = useState("");
  const [newTrans,     setNewTrans]     = useState("");
  const [newLang,      setNewLang]      = useState("en");
  const [newNotes,     setNewNotes]     = useState("");
  const [addingWord,   setAddingWord]   = useState(false);
  const [showAddWord,  setShowAddWord]  = useState(false);

  // Login history
  const [loginHistory,    setLoginHistory]    = useState<LoginEntry[]>([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);

  // Stats
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchVocab = async () => {
    setVocabLoading(true);
    const res = await fetch("/api/vocabulary", { credentials: "include" });
    if (res.ok) setVocab(await res.json() as VocabWord[]);
    setVocabLoading(false);
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/auth/login-history", { credentials: "include" });
    if (res.ok) setLoginHistory(await res.json() as LoginEntry[]);
    setHistoryLoading(false);
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    const res = await fetch("/api/documents/stats", { credentials: "include" });
    if (res.ok) setStats(await res.json() as Stats);
    setStatsLoading(false);
  };

  if (!user) return null;

  const appUrl    = window.location.origin;
  const referralLink = `${appUrl}?ref=${user.referralCode ?? ""}`;
  const attemptsPercent = Math.min(100, Math.round((user.aiAttempts / 40) * 100));
  const barColor  = user.aiAttempts >= 20 ? "bg-green-500" : user.aiAttempts >= 8 ? "bg-yellow-500" : "bg-red-500";
  const initials  = user.username.slice(0, 2).toUpperCase();
  const gradients = ["from-violet-500 to-fuchsia-500","from-cyan-500 to-blue-500","from-orange-400 to-rose-500","from-emerald-400 to-teal-500"];
  const grad      = gradients[user.id % gradients.length];
  const chosenPkg    = PACKAGES.find(p => p.id === selectedPkg)!;
  const chosenWallet = WALLETS.find(w => w.id === selectedWallet)!;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} تم النسخ` }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = txHash.trim();
    if (!hash) { toast({ title: "أدخل رقم المعاملة (TxID)", variant: "destructive" }); return; }
    setSubmitLoading(true); setVerifyResult(null);
    try {
      const canAutoVerify = selectedWallet === "usdt_trc20" || selectedWallet === "btc";
      if (canAutoVerify) {
        const res = await fetch("/api/payments/verify-tx", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: hash, pkg: selectedPkg, network: selectedWallet }),
        });
        const data = await res.json() as any;
        if (res.status === 409) { toast({ title: "⚠️ تم معالجة هذه المعاملة مسبقاً", variant: "destructive" }); return; }
        setVerifyResult(data);
        if (data.verified) {
          setSubmitted(true); setTxHash("");
          await refresh();
          toast({ title: `🎉 تم التحقق وإضافة ${data.attemptsAdded} محاولة!`, description: data.reason });
          return;
        }
        toast({ title: "لم يتم التحقق التلقائي", description: "سيتم مراجعة طلبك يدوياً.", variant: "default" });
      }
      const res2 = await fetch("/api/payments/submit", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pkg: selectedPkg, reference: hash }),
      });
      const d2 = await res2.json() as any;
      if (!res2.ok) throw new Error(d2.error);
      setSubmitted(true); setTxHash("");
      toast({ title: "✅ تم إرسال طلبك!", description: "سيتم التحقق وإضافة المحاولات خلال 24 ساعة." });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setSubmitLoading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { toast({ title: "كلمتا المرور غير متطابقتين", variant: "destructive" }); return; }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      toast({ title: "✅ تم تغيير كلمة المرور!" });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally { setPwLoading(false); }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) return;
    setAddingWord(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: newWord.trim(), translation: newTrans || undefined, language: newLang, notes: newNotes || undefined }),
      });
      if (res.ok) {
        await fetchVocab();
        setNewWord(""); setNewTrans(""); setNewNotes(""); setShowAddWord(false);
        toast({ title: "✅ تمت إضافة الكلمة" });
      }
    } finally { setAddingWord(false); }
  };

  const handleDeleteWord = async (id: number) => {
    await fetch(`/api/vocabulary/${id}`, { method: "DELETE", credentials: "include" });
    setVocab(v => v.filter(w => w.id !== id));
    toast({ title: "تم الحذف" });
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4 animate-in fade-in duration-500">

      {/* Header */}
      <Card className="border-border/50 overflow-hidden">
        <div className={`h-20 bg-gradient-to-r ${grad} opacity-20`} />
        <CardContent className="pt-0 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-9">
            <div className={`w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-xl shadow-lg border-4 border-background shrink-0`}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{user.username}</h1>
              <p className="text-muted-foreground text-sm">{user.email ?? "DocScanner AI Member"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-2 shrink-0">
              <LogOut className="w-4 h-4" /> تسجيل الخروج
            </Button>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground"><Zap className="w-3.5 h-3.5" /> المحاولات المتبقية</span>
              <span className="font-bold">{user.aiAttempts}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${attemptsPercent}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="payments">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="payments"  className="text-xs py-2">💳 شحن</TabsTrigger>
          <TabsTrigger value="referral"  className="text-xs py-2">🎁 دعوة</TabsTrigger>
          <TabsTrigger value="vocab"     className="text-xs py-2" onClick={fetchVocab}>📖 معجمي</TabsTrigger>
          <TabsTrigger value="stats"     className="text-xs py-2" onClick={fetchStats}>📊 إحصاء</TabsTrigger>
          <TabsTrigger value="security"  className="text-xs py-2" onClick={fetchHistory}>🔒 أمان</TabsTrigger>
        </TabsList>

        {/* ── PAYMENTS ── */}
        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Package selection */}
          <Card className="border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-sm">اختر الباقة</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {PACKAGES.map(pkg => (
                <div key={pkg.id} onClick={() => setSelectedPkg(pkg.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedPkg === pkg.id ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/30"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedPkg === pkg.id ? "border-primary" : "border-muted-foreground/40"}`}>
                      {selectedPkg === pkg.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{pkg.label}</span>
                        {pkg.popular && <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded-full font-medium">مميز</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{pkg.attempts} محاولة AI</span>
                    </div>
                  </div>
                  <span className="font-bold text-sm">${pkg.usdt} USDT</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Wallet selection */}
          <Card className="border-border/50">
            <CardContent className="pt-4">
              <button onClick={() => setShowWallets(v => !v)} className="flex items-center justify-between w-full text-sm font-medium mb-3">
                <span className="flex items-center gap-2"><Bitcoin className="w-4 h-4 text-orange-500" /> عنوان الدفع</span>
                {showWallets ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {WALLETS.map(w => (
                  <div key={w.id} onClick={() => setSelectedWallet(w.id)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedWallet === w.id ? "border-primary bg-primary/5" : "border-border/50"}`}>
                    <p className={`text-xs font-semibold ${w.color}`}>{w.name}</p>
                    <p className="text-[10px] text-muted-foreground">{w.network}</p>
                  </div>
                ))}
              </div>
              {showWallets && (
                <div className={`p-3 rounded-xl ${chosenWallet.bg} border border-border/30`}>
                  <p className="text-xs text-muted-foreground mb-1">{chosenWallet.name} — {chosenWallet.network}</p>
                  <div className="flex items-center gap-2">
                    <p className={`font-mono text-xs break-all ${chosenWallet.color} flex-1`}>{chosenWallet.address}</p>
                    <button onClick={() => copyText(chosenWallet.address, chosenWallet.name)} className={`shrink-0 p-1.5 rounded-lg ${chosenWallet.bg} ${chosenWallet.color}`}>
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-bold">المبلغ: {chosenPkg.usdt} USDT / ${chosenPkg.usdt}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TxID submission */}
          {submitted && verifyResult?.verified ? (
            <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 text-green-500 rounded-xl p-4">
              <Check className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">🎉 تم التحقق وإضافة {verifyResult.attemptsAdded} محاولة فوراً!</p>
                <p className="text-xs opacity-80 mt-0.5">{verifyResult.reason}</p>
              </div>
            </div>
          ) : submitted ? (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-xl p-4">
              <Check className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">تم استلام طلبك ✅</p>
                <p className="text-xs opacity-80">سيتم مراجعة المعاملة وإضافة {chosenPkg.attempts} محاولة خلال 24 ساعة.</p>
              </div>
            </div>
          ) : (
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <form onSubmit={handleSubmit} className="space-y-3">
                  {verifyResult && !verifyResult.verified && (
                    <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl p-3 text-xs">
                      <span className="shrink-0 font-bold mt-0.5">⚠</span>
                      <p>{verifyResult.reason} — تم حفظ طلبك للمراجعة اليدوية.</p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" /> رقم المعاملة (TxID)
                    </Label>
                    <Input placeholder="a1b2c3d4e5f6…" value={txHash} onChange={e => setTxHash(e.target.value)} className="font-mono text-xs" required />
                    <p className="text-xs text-muted-foreground">
                      {selectedWallet === "usdt_trc20" || selectedWallet === "btc"
                        ? "🤖 سيتم التحقق تلقائياً بالذكاء الاصطناعي خلال ثوانٍ"
                        : "ستجد هذا الرقم في محفظتك بعد إتمام الإرسال."}
                    </p>
                  </div>
                  <Button type="submit" className="w-full gap-2" disabled={submitLoading}>
                    {submitLoading ? <><Loader2 className="w-4 h-4 animate-spin" />جارٍ التحقق…</> : <><Zap className="w-4 h-4" />تحقق وأضف المحاولات</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── REFERRAL ── */}
        <TabsContent value="referral" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">برنامج الإحالة</p>
                  <p className="text-xs text-muted-foreground">+20 محاولة لكل صديق يسجل بكودك</p>
                </div>
                <span className="ml-auto text-green-500 font-bold">+20</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">كود الإحالة الخاص بك</p>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border/50">
                  <code className="flex-1 font-mono text-sm font-bold tracking-widest">{user.referralCode ?? "—"}</code>
                  <button onClick={() => copyText(user.referralCode ?? "", "الكود")} className="p-1.5 rounded-lg hover:bg-muted"><Copy className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">رابط الإحالة</p>
                <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border/50">
                  <p className="flex-1 text-xs truncate font-mono text-muted-foreground">{referralLink}</p>
                  <button onClick={() => copyText(referralLink, "الرابط")} className="p-1.5 rounded-lg hover:bg-muted"><Copy className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                <Users className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{user.referralCount} صديق مُحال</p>
                  <p className="text-xs text-muted-foreground">= {user.referralCount * 20} محاولة مضافة</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VOCABULARY ── */}
        <TabsContent value="vocab" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">معجمي الشخصي</h2>
              <p className="text-xs text-muted-foreground">الكلمات الصعبة التي تعلمتها</p>
            </div>
            <Button size="sm" onClick={() => setShowAddWord(v => !v)} className="gap-2">
              <Plus className="w-4 h-4" /> إضافة كلمة
            </Button>
          </div>

          {showAddWord && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">الكلمة</Label>
                    <Input placeholder="word" value={newWord} onChange={e => setNewWord(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">الترجمة</Label>
                    <Input placeholder="الترجمة" value={newTrans} onChange={e => setNewTrans(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">اللغة</Label>
                    <select value={newLang} onChange={e => setNewLang(e.target.value)} className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
                      {Object.entries(LANG_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ملاحظات (اختياري)</Label>
                    <Input placeholder="سياق الكلمة…" value={newNotes} onChange={e => setNewNotes(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2" onClick={handleAddWord} disabled={addingWord || !newWord.trim()}>
                    {addingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddWord(false)}>إلغاء</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {vocabLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : vocab.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>معجمك فارغ</p>
              <p className="text-xs mt-1">أضف كلمات صعبة من الترجمة أو يدوياً</p>
            </div>
          ) : (
            <div className="space-y-2">
              {vocab.map(word => (
                <Card key={word.id} className="border-border/50 hover:border-primary/20 transition-colors">
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{word.word}</span>
                        {word.language && (
                          <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{LANG_NAMES[word.language] ?? word.language}</span>
                        )}
                      </div>
                      {word.translation && <p className="text-sm text-muted-foreground">{word.translation}</p>}
                      {word.notes && <p className="text-xs text-muted-foreground/60 mt-0.5 italic">{word.notes}</p>}
                    </div>
                    <button onClick={() => handleDeleteWord(word.id)} className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── STATS ── */}
        <TabsContent value="stats" className="space-y-4 mt-4">
          {statsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "إجمالي المستندات", val: stats.total,     icon: <FileText className="w-4 h-4 text-primary" /> },
                  { label: "معالَجة بـ OCR",    val: stats.ocrDone,   icon: <Zap className="w-4 h-4 text-green-500" /> },
                  { label: "الصفحات الكلية",    val: stats.totalPages, icon: <BarChart3 className="w-4 h-4 text-blue-500" /> },
                  { label: "المفضلة",           val: stats.favorites, icon: <Star className="w-4 h-4 text-yellow-500" /> },
                  { label: "الأرشيف",           val: stats.archived,  icon: <FileText className="w-4 h-4 text-amber-500" /> },
                  { label: "محاولاتي",          val: user.aiAttempts, icon: <Zap className="w-4 h-4 text-primary" /> },
                ].map(({ label, val, icon }) => (
                  <Card key={label} className="border-border/50">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
                      <p className="text-2xl font-bold">{val}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Globe className="w-4 h-4" />توزيع اللغات</CardTitle></CardHeader>
                <CardContent className="pb-4 space-y-2">
                  {[
                    { label: "عربي", val: stats.languageBreakdown.ar,   color: "bg-green-500" },
                    { label: "إنجليزي", val: stats.languageBreakdown.en, color: "bg-blue-500" },
                    { label: "مختلط", val: stats.languageBreakdown.both, color: "bg-purple-500" },
                  ].map(({ label, val, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{label}</span><span>{val}</span></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: stats.total ? `${(val / stats.total) * 100}%` : "0%" }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {Object.keys(stats.docTypes).length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">أنواع المستندات</CardTitle></CardHeader>
                  <CardContent className="pb-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.docTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded-lg">
                          <span className="text-sm">{({ invoice:"💰", receipt:"🧾", contract:"📝", report:"📊", book:"📚", id_card:"🪪", other:"📄" } as Record<string,string>)[type] ?? "📄"}</span>
                          <span className="text-xs">{type}</span>
                          <span className="text-xs font-bold text-muted-foreground">({count})</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>لا توجد إحصاءات بعد</p>
            </div>
          )}
        </TabsContent>

        {/* ── SECURITY ── */}
        <TabsContent value="security" className="space-y-4 mt-4">
          {/* Change password */}
          <Card className="border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> تغيير كلمة المرور</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">كلمة المرور الحالية</Label>
                  <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">كلمة المرور الجديدة</Label>
                  <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">تأكيد كلمة المرور</Label>
                  <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={pwLoading}>
                  {pwLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />جارٍ الحفظ…</> : "تحديث كلمة المرور"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Login history */}
          <Card className="border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> سجل تسجيل الدخول</CardTitle></CardHeader>
            <CardContent className="pb-4">
              {historyLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : loginHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا يوجد سجل</p>
              ) : (
                <div className="space-y-2">
                  {loginHistory.map(entry => (
                    <div key={entry.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      <Monitor className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-foreground">{entry.ip ?? "IP غير معروف"}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.userAgent?.split(" ").slice(0, 3).join(" ") ?? "متصفح غير معروف"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0 ml-auto">{new Date(entry.createdAt).toLocaleString("ar-EG")}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
