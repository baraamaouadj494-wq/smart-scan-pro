import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText, Search, Loader2, Grid3X3, List,
  Star, Trash2, MessageSquare, Check, ScanLine, FileOutput,
  FolderPlus, Folder, FolderOpen, Archive, ArchiveRestore,
  Tag, X, Plus, MoreVertical, Share2, BookOpen,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

type ViewMode = "grid" | "list";
type SortKey = "newest" | "oldest" | "name" | "status";

interface DocRow {
  id: number; title: string; status: string; language: string;
  isFavorite: boolean; isArchived: boolean; folderId: number | null;
  docType: string | null; tags: string | null; createdAt: string;
  processedImageUrl: string | null; originalImageUrl: string | null;
  extractedText: string | null; summary: string | null;
}

interface FolderRow { id: number; name: string; color: string; icon: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  uploaded:   { label: "Uploaded",   color: "bg-gray-500/20 text-gray-400" },
  processing: { label: "Processing", color: "bg-blue-500/20 text-blue-400" },
  processed:  { label: "Processed",  color: "bg-purple-500/20 text-purple-400" },
  ocr_done:   { label: "Ready",      color: "bg-green-500/20 text-green-400" },
  error:      { label: "Error",      color: "bg-red-500/20 text-red-400" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "فاتورة", receipt: "إيصال", contract: "عقد", id_card: "هوية",
  passport: "جواز", letter: "رسالة", report: "تقرير", academic: "أكاديمي",
  book: "كتاب", news: "أخبار", medical: "طبي", legal: "قانوني",
  financial: "مالي", form: "نموذج", certificate: "شهادة", other: "أخرى",
};

const FOLDER_COLORS = ["#6366f1","#ec4899","#f97316","#22c55e","#06b6d4","#eab308","#8b5cf6","#ef4444"];

export default function Documents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [docs, setDocs]           = useState<DocRow[]>([]);
  const [folders, setFolders]     = useState<FolderRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("newest");
  const [viewMode, setViewMode]   = useState<ViewMode>("grid");
  const [selected, setSelected]   = useState<Set<number>>(new Set());
  const [showFavOnly, setShowFavOnly]   = useState(false);
  const [showArchive, setShowArchive]   = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [newFolderName, setNewFolderName]   = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [showNewFolder, setShowNewFolder]   = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (showFavOnly) params.set("favorites", "true");
      if (showArchive) params.set("archived", "true");
      else params.set("archived", "false");
      if (activeFolderId !== "all" && activeFolderId !== "none") params.set("folderId", activeFolderId);
      else if (activeFolderId === "none") params.set("folderId", "none");

      const res = await fetch(`/api/documents?${params}`, { credentials: "include" });
      if (res.ok) setDocs(await res.json() as DocRow[]);
    } finally { setLoading(false); }
  };

  const fetchFolders = async () => {
    const res = await fetch("/api/folders", { credentials: "include" });
    if (res.ok) setFolders(await res.json() as FolderRow[]);
  };

  useEffect(() => { fetchDocs(); }, [debouncedSearch, showFavOnly, showArchive, activeFolderId]);
  useEffect(() => { if (user) fetchFolders(); }, [user]);

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => {
      if (sortKey === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortKey === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortKey === "name") return a.title.localeCompare(b.title);
      if (sortKey === "status") return a.status.localeCompare(b.status);
      return 0;
    });
  }, [docs, sortKey]);

  const toggleSelect = (id: number) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleFavorite = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    await fetch(`/api/documents/${id}/favorite`, { method: "PATCH", credentials: "include" });
    fetchDocs();
  };

  const toggleArchive = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    await fetch(`/api/documents/${id}/archive`, { method: "PATCH", credentials: "include" });
    fetchDocs();
    toast({ title: showArchive ? "استُعيد من الأرشيف" : "نُقل إلى الأرشيف" });
  };

  const shareDoc = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const res = await fetch(`/api/documents/${id}/share`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json() as any;
    if (data.shareUrl) {
      navigator.clipboard.writeText(data.shareUrl);
      toast({ title: "🔗 تم نسخ رابط المشاركة!" });
    }
  };

  const deleteDoc = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("حذف هذا المستند نهائياً؟")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "include" });
    fetchDocs();
    toast({ title: "تم الحذف" });
  };

  const bulkDelete = async () => {
    if (!confirm(`حذف ${selected.size} مستند؟`)) return;
    await fetch("/api/documents/bulk", {
      method: "DELETE", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    fetchDocs();
    toast({ title: "تم الحذف" });
  };

  const mergePDF = async () => {
    const ids = [...selected];
    if (ids.length < 2) { toast({ title: "اختر مستندين على الأقل", variant: "destructive" }); return; }
    const res = await fetch("/api/documents/merge-pdf", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds: ids, addPageNumbers: true }),
    });
    if (!res.ok) { toast({ title: "فشل الدمج", variant: "destructive" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `merged_${Date.now()}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    toast({ title: "✅ تم دمج المستندات وتحميل PDF!" });
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    const res = await fetch("/api/folders", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim(), color: newFolderColor }),
    });
    if (res.ok) {
      await fetchFolders();
      setNewFolderName(""); setShowNewFolder(false);
      toast({ title: "✅ تم إنشاء المجلد" });
    }
    setCreatingFolder(false);
  };

  const deleteFolder = async (id: number) => {
    if (!confirm("حذف هذا المجلد؟ المستندات لن تُحذف.")) return;
    await fetch(`/api/folders/${id}`, { method: "DELETE", credentials: "include" });
    fetchFolders();
    if (activeFolderId === String(id)) setActiveFolderId("all");
  };

  const thumb = (doc: DocRow) => doc.processedImageUrl || doc.originalImageUrl || null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-52 border-r border-border/50 bg-card/30 py-4 gap-1 shrink-0 overflow-y-auto">
        <div className="px-3 mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">المجلدات</p>
        </div>

        {[
          { id: "all",  label: "كل المستندات", icon: <FileText className="w-4 h-4" /> },
          { id: "none", label: "بدون مجلد",    icon: <FileText className="w-4 h-4 opacity-40" /> },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveFolderId(item.id); setShowArchive(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg mx-2 text-sm transition-colors ${activeFolderId === item.id && !showArchive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            {item.icon} {item.label}
          </button>
        ))}

        <div className="mx-2 my-1 border-t border-border/40" />

        {folders.map(folder => (
          <div key={folder.id} className="relative group flex items-center mx-2">
            <button
              onClick={() => { setActiveFolderId(String(folder.id)); setShowArchive(false); }}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolderId === String(folder.id) && !showArchive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <Folder className="w-4 h-4 shrink-0" style={{ color: folder.color }} />
              <span className="truncate">{folder.name}</span>
            </button>
            <button onClick={() => deleteFolder(folder.id)} className="opacity-0 group-hover:opacity-100 absolute right-1 p-1 hover:text-destructive text-muted-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {showNewFolder ? (
          <div className="mx-2 mt-1 p-2 space-y-2 border border-border/50 rounded-lg bg-muted/30">
            <Input placeholder="اسم المجلد" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              className="h-7 text-xs" onKeyDown={e => e.key === "Enter" && createFolder()} autoFocus />
            <div className="flex gap-1 flex-wrap">
              {FOLDER_COLORS.map(c => (
                <button key={c} onClick={() => setNewFolderColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${newFolderColor === c ? "scale-125 ring-2 ring-white/50" : ""}`}
                  style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? <Loader2 className="w-3 h-3 animate-spin" /> : "إنشاء"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNewFolder(false)}>إلغاء</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg mx-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <FolderPlus className="w-4 h-4" /> مجلد جديد
          </button>
        )}

        <div className="mx-2 my-1 border-t border-border/40" />
        <button
          onClick={() => { setShowArchive(v => !v); setActiveFolderId("all"); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg mx-2 text-sm transition-colors ${showArchive ? "bg-amber-500/10 text-amber-500" : "text-muted-foreground hover:bg-muted/50"}`}
        >
          <Archive className="w-4 h-4" /> الأرشيف
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border/50 px-6 py-4 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                {showArchive ? <><Archive className="w-5 h-5 text-amber-500" />الأرشيف</> :
                  activeFolderId === "all" ? "مستنداتي" :
                  activeFolderId === "none" ? "بدون مجلد" :
                  <><FolderOpen className="w-5 h-5 text-primary" />{folders.find(f => String(f.id) === activeFolderId)?.name ?? "مجلد"}</>
                }
              </h1>
              {docs.length > 0 && <p className="text-sm text-muted-foreground">{docs.length} مستند</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowFavOnly(v => !v)} size="sm" variant={showFavOnly ? "default" : "outline"} className="gap-1.5">
                <Star className={`w-4 h-4 ${showFavOnly ? "fill-current" : ""}`} />
                <span className="hidden sm:inline">المفضلة</span>
              </Button>
              <Button asChild size="sm">
                <Link href="/scan"><ScanLine className="w-4 h-4 mr-1.5" />مسح جديد</Link>
              </Button>
            </div>
          </div>

          {/* Search + sort + view */}
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث ذكي في العنوان والنص والملخص…" value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                className="px-3 py-1.5 rounded-md border border-border bg-background text-sm">
                <option value="newest">الأحدث</option>
                <option value="oldest">الأقدم</option>
                <option value="name">الاسم</option>
                <option value="status">الحالة</option>
              </select>
              <div className="flex border border-border rounded-md overflow-hidden">
                <button onClick={() => setViewMode("grid")}
                  className={`p-2 ${viewMode === "grid" ? "bg-muted" : "hover:bg-muted/50"}`}><Grid3X3 className="w-4 h-4" /></button>
                <button onClick={() => setViewMode("list")}
                  className={`p-2 ${viewMode === "list" ? "bg-muted" : "hover:bg-muted/50"}`}><List className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-primary/5 border-b border-border/50 shrink-0">
            <span className="text-sm font-medium">{selected.size} محدد</span>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>إلغاء</Button>
            {selected.size >= 2 && (
              <Button size="sm" variant="outline" onClick={mergePDF} className="gap-1.5">
                <FileOutput className="w-4 h-4" />دمج PDF ({selected.size})
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={bulkDelete} className="gap-1.5">
              <Trash2 className="w-4 h-4" />حذف ({selected.size})
            </Button>
          </div>
        )}

        {/* Document grid/list */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              {showArchive ? <Archive className="w-12 h-12 text-muted-foreground/30 mb-4" /> : <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />}
              <p className="text-lg font-medium text-muted-foreground">
                {showArchive ? "لا توجد مستندات مؤرشفة" : search ? "لا نتائج مطابقة" : "لا توجد مستندات"}
              </p>
              {!showArchive && !search && (
                <Button asChild className="mt-4"><Link href="/scan">ابدأ المسح</Link></Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {sorted.map(doc => (
                <DocCard key={doc.id} doc={doc} selected={selected.has(doc.id)}
                  onSelect={() => toggleSelect(doc.id)}
                  onFav={e => toggleFavorite(doc.id, e)}
                  onArchive={e => toggleArchive(doc.id, e)}
                  onShare={e => shareDoc(doc.id, e)}
                  onDelete={e => deleteDoc(doc.id, e)}
                  showArchive={showArchive} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(doc => (
                <DocListRow key={doc.id} doc={doc} selected={selected.has(doc.id)}
                  onSelect={() => toggleSelect(doc.id)}
                  onFav={e => toggleFavorite(doc.id, e)}
                  onArchive={e => toggleArchive(doc.id, e)}
                  onShare={e => shareDoc(doc.id, e)}
                  onDelete={e => deleteDoc(doc.id, e)}
                  showArchive={showArchive} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DocCardProps {
  doc: DocRow; selected: boolean; showArchive: boolean;
  onSelect: () => void; onFav: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void; onShare: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function DocCard({ doc, selected, showArchive, onSelect, onFav, onArchive, onShare, onDelete }: DocCardProps) {
  const tags: string[] = (() => { try { return JSON.parse(doc.tags ?? "[]"); } catch { return []; } })();
  const imgSrc = doc.processedImageUrl || doc.originalImageUrl;
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.uploaded;
  const typeLabel = DOC_TYPE_LABELS[doc.docType ?? "other"] ?? "مستند";

  return (
    <div className="relative group">
      <Link href={`/documents/${doc.id}`}>
        <Card className={`overflow-hidden transition-all border-2 cursor-pointer hover:shadow-lg ${selected ? "border-primary" : "border-border/50 hover:border-primary/30"}`}>
          {/* Thumbnail */}
          <div className="aspect-[3/4] bg-muted relative overflow-hidden">
            {imgSrc ? (
              <img src={imgSrc} alt={doc.title} className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full">
                <FileText className="w-10 h-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            {/* Badges */}
            <div className="absolute top-2 left-2 right-2 flex justify-between">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${status.color}`}>{status.label}</span>
              {doc.docType && doc.docType !== "other" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-black/40 text-white/80">{typeLabel}</span>
              )}
            </div>
            {/* Select checkbox */}
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
              className={`absolute bottom-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selected ? "bg-primary border-primary" : "bg-black/20 border-white/50 opacity-0 group-hover:opacity-100"}`}>
              {selected && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>
          <CardContent className="p-2">
            <p className="text-xs font-medium truncate">{doc.title}</p>
            <p className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString("ar-EG")}</p>
          </CardContent>
        </Card>
      </Link>
      {/* Action buttons */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onFav} className={`w-7 h-7 rounded-lg flex items-center justify-center bg-black/60 backdrop-blur-sm ${doc.isFavorite ? "text-yellow-400" : "text-white/70 hover:text-yellow-400"}`}>
          <Star className={`w-3.5 h-3.5 ${doc.isFavorite ? "fill-current" : ""}`} />
        </button>
        <button onClick={onShare} className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/60 backdrop-blur-sm text-white/70 hover:text-blue-400">
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onArchive} className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/60 backdrop-blur-sm text-white/70 hover:text-amber-400">
          {showArchive ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center bg-black/60 backdrop-blur-sm text-white/70 hover:text-red-400">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DocListRow({ doc, selected, showArchive, onSelect, onFav, onArchive, onShare, onDelete }: DocCardProps) {
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.uploaded;
  const typeLabel = DOC_TYPE_LABELS[doc.docType ?? "other"] ?? "";
  const imgSrc = doc.processedImageUrl || doc.originalImageUrl;

  return (
    <Link href={`/documents/${doc.id}`}>
      <div className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${selected ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/20 bg-card"}`}>
        <button onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-border"}`}>
          {selected && <Check className="w-3 h-3 text-white" />}
        </button>
        {imgSrc ? (
          <img src={imgSrc} alt={doc.title} className="w-10 h-12 object-cover rounded-lg shrink-0" />
        ) : (
          <div className="w-10 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{doc.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
            {typeLabel && <span className="text-xs text-muted-foreground">{typeLabel}</span>}
            <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString("ar-EG")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onFav} className={`p-1.5 rounded hover:bg-muted ${doc.isFavorite ? "text-yellow-400" : "text-muted-foreground"}`}>
            <Star className={`w-4 h-4 ${doc.isFavorite ? "fill-current" : ""}`} />
          </button>
          <button onClick={onShare} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-blue-400">
            <Share2 className="w-4 h-4" />
          </button>
          <button onClick={onArchive} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-amber-400">
            {showArchive ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Link>
  );
}
