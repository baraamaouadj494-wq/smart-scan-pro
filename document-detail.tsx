import { useState, useRef, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetDocument, useProcessDocument, useRunOcr, useExportPdf,
  useSummarizeDocument, useDeleteDocument, getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText, ArrowLeft, Download, MessageSquare, Wand2, Type, FileOutput,
  Loader2, Trash2, ChevronRight, Copy, Printer, Languages, ZoomIn, ZoomOut,
  RotateCcw, RotateCw, Sun, Contrast, Palette, SlidersHorizontal, Search,
  X, Check, Maximize2, RefreshCw, FlipHorizontal, Star, Volume2, VolumeX,
  FileDown, Tag, Plus, PenLine, Stamp, Crop, Share2, QrCode, BookOpen,
  Users, Hash, Calendar, Phone, Mail, MapPin, Building2, Lock, Unlock,
  FileSearch, ChevronDown, Archive, ArchiveRestore,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import SignaturePad from "@/components/signature-pad";
import DocumentCropper from "@/components/document-cropper";

const DOC_TYPE_ICONS: Record<string, string> = {
  invoice: "💰", receipt: "🧾", contract: "📝", report: "📊",
  letter: "✉️", academic: "🎓", form: "📋", book: "📚",
  id_card: "🪪", passport: "📘", medical: "🏥", legal: "⚖️",
  financial: "💹", news: "📰", certificate: "🏆", other: "📄",
};

const LANGUAGES: { code: string; name: string; nameAr: string }[] = [
  { code: "ar", name: "Arabic",   nameAr: "العربية" },
  { code: "en", name: "English",  nameAr: "الإنجليزية" },
  { code: "fr", name: "French",   nameAr: "الفرنسية" },
  { code: "es", name: "Spanish",  nameAr: "الإسبانية" },
  { code: "de", name: "German",   nameAr: "الألمانية" },
  { code: "it", name: "Italian",  nameAr: "الإيطالية" },
  { code: "tr", name: "Turkish",  nameAr: "التركية" },
  { code: "ru", name: "Russian",  nameAr: "الروسية" },
  { code: "zh", name: "Chinese",  nameAr: "الصينية" },
  { code: "ja", name: "Japanese", nameAr: "اليابانية" },
];

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [isProcessing, setIsProcessing] = useState(false);

  // Image editor
  const [rotation, setRotation]     = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast]     = useState(100);
  const [grayscale, setGrayscale]   = useState(false);
  const [flipH, setFlipH]           = useState(false);
  const [zoom, setZoom]             = useState(1);
  const [showEditor, setShowEditor] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sepia, setSepia]           = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [threshold, setThreshold]   = useState(false);

  // Dialogs
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [watermarkText, setWatermarkText]             = useState("CONFIDENTIAL");
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl]       = useState<string | null>(null);
  const [showReCropDialog, setShowReCropDialog]       = useState(false);
  const [recropKey, setRecropKey]                     = useState(0);
  const [showDeleteDialog, setShowDeleteDialog]       = useState(false);
  const [showPdfOptions, setShowPdfOptions]           = useState(false);
  const [showShareDialog, setShowShareDialog]         = useState(false);
  const [showQrDialog, setShowQrDialog]               = useState(false);
  const [showBookDialog, setShowBookDialog]           = useState(false);

  // PDF options
  const [pdfPassword, setPdfPassword]         = useState("");
  const [pdfCompress, setPdfCompress]         = useState<"none"|"medium"|"high">("none");
  const [pdfAddPageNumbers, setPdfPageNumbers] = useState(false);

  // Translation
  const [translatedText, setTranslatedText]   = useState<string | null>(null);
  const [translationLang, setTranslationLang] = useState("en");
  const [isTranslating, setIsTranslating]     = useState(false);

  // AI results
  const [classifyResult, setClassifyResult]   = useState<any>(null);
  const [classifying, setClassifying]         = useState(false);
  const [entities, setEntities]               = useState<Record<string, string[]> | null>(null);
  const [extractingEntities, setExtractingEntities] = useState(false);
  const [bookResult, setBookResult]           = useState<any>(null);
  const [detectingBook, setDetectingBook]     = useState(false);

  // Share
  const [shareUrl, setShareUrl]       = useState<string | null>(null);
  const [generatingShare, setGeneratingShare] = useState(false);

  // QR
  const [qrText, setQrText]           = useState("");
  const [qrImageUrl, setQrImageUrl]   = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);

  // TTS
  const [ttsPlaying, setTtsPlaying]   = useState(false);
  const ttsRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Text search/copy/tags
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied]           = useState(false);
  const [showTagInput, setShowTagInput]   = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");

  const { data: doc, isLoading } = useGetDocument(docId, {
    query: { enabled: !!docId, queryKey: getGetDocumentQueryKey(docId) },
  });
  const processDoc   = useProcessDocument();
  const runOcr       = useRunOcr();
  const exportPdf    = useExportPdf();
  const summarizeDoc = useSummarizeDocument();
  const deleteDoc    = useDeleteDocument();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetDocumentQueryKey(docId) });

  const handleProcess = async () => {
    try { setIsProcessing(true); await processDoc.mutateAsync({ id: docId, data: { enhance: true, autocrop: true } }); invalidate(); toast({ title: "Image Enhanced ✓" }); }
    catch { toast({ title: "Processing Failed", variant: "destructive" }); }
    finally { setIsProcessing(false); }
  };

  const handleOcr = async () => {
    try { setIsProcessing(true); await runOcr.mutateAsync({ id: docId, data: { language: "both" as const } }); invalidate(); toast({ title: "OCR Complete ✓" }); }
    catch { toast({ title: "OCR Failed", variant: "destructive" }); }
    finally { setIsProcessing(false); }
  };

  const handleSummarize = async () => {
    try { setIsProcessing(true); await summarizeDoc.mutateAsync({ id: docId, data: { language: "en" as const } }); invalidate(); toast({ title: "AI Summary Generated ✓" }); }
    catch { toast({ title: "Summarization Failed", variant: "destructive" }); }
    finally { setIsProcessing(false); }
  };

  const handleClassify = async () => {
    setClassifying(true);
    try {
      const res = await fetch(`/api/documents/${docId}/classify`, { method: "POST", credentials: "include" });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setClassifyResult(data);
      invalidate();
      toast({ title: `📂 تم التصنيف: ${data.type}`, description: data.subtype || "" });
    } catch { toast({ title: "فشل التصنيف", variant: "destructive" }); }
    finally { setClassifying(false); }
  };

  const handleExtractEntities = async () => {
    setExtractingEntities(true);
    try {
      const res = await fetch(`/api/documents/${docId}/extract-entities`, { method: "POST", credentials: "include" });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setEntities(data);
      toast({ title: "✅ تم استخراج البيانات المهمة" });
    } catch { toast({ title: "فشل الاستخراج", variant: "destructive" }); }
    finally { setExtractingEntities(false); }
  };

  const handleDetectBook = async () => {
    setDetectingBook(true);
    try {
      const res = await fetch(`/api/documents/${docId}/detect-book`, { method: "POST", credentials: "include" });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setBookResult(data);
      setShowBookDialog(true);
      if (data.isBook) { invalidate(); toast({ title: `📚 ${data.title ?? "كتاب مُكتشَف"}` }); }
      else toast({ title: "لم يُكتشَف كتاب في هذه الصورة" });
    } catch { toast({ title: "فشل الاكتشاف", variant: "destructive" }); }
    finally { setDetectingBook(false); }
  };

  const handleTranslate = async () => {
    if (!doc?.extractedText) return;
    setIsTranslating(true);
    try {
      const res = await fetch(`/api/documents/${docId}/translate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: translationLang }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setTranslatedText(data.translatedText);
      const langName = LANGUAGES.find(l => l.code === translationLang)?.name ?? translationLang;
      toast({ title: `Translation to ${langName} Complete ✓`, description: data.cached ? "From cache" : "Freshly translated" });
    } catch { toast({ title: "Translation Failed", variant: "destructive" }); }
    finally { setIsTranslating(false); }
  };

  const handleDownloadPdf = async (wm?: string, opts?: { password?: string; compress?: string; pageNumbers?: boolean }) => {
    try {
      setIsProcessing(true);
      await exportPdf.mutateAsync({ id: docId });
      const params = new URLSearchParams();
      if (wm) params.set("watermark", wm);
      if (opts?.password) params.set("password", opts.password);
      if (opts?.compress && opts.compress !== "none") params.set("compress", opts.compress);
      if (opts?.pageNumbers) params.set("pageNumbers", "true");
      const link = document.createElement("a");
      link.href = `/api/documents/${docId}/pdf/download?${params}`;
      link.download = `${doc?.title ?? "document"}.pdf`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast({ title: "PDF Downloaded ✓" });
    } catch { toast({ title: "PDF Export Failed", variant: "destructive" }); }
    finally { setIsProcessing(false); }
  };

  const handleShare = async () => {
    setGeneratingShare(true);
    try {
      const res = await fetch(`/api/documents/${docId}/share`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json() as any;
      setShareUrl(data.shareUrl);
      navigator.clipboard.writeText(data.shareUrl).catch(() => {});
      toast({ title: "🔗 تم نسخ رابط المشاركة!" });
    } catch { toast({ title: "فشل إنشاء الرابط", variant: "destructive" }); }
    finally { setGeneratingShare(false); }
  };

  const handleGenerateQr = async () => {
    if (!qrText.trim()) return;
    setGeneratingQr(true);
    try {
      const res = await fetch("/api/documents/qr/generate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: qrText, format: "png" }),
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      setQrImageUrl(URL.createObjectURL(blob));
    } catch { toast({ title: "فشل إنشاء QR", variant: "destructive" }); }
    finally { setGeneratingQr(false); }
  };

  const handleToggleArchive = async () => {
    await fetch(`/api/documents/${docId}/archive`, { method: "PATCH", credentials: "include" });
    invalidate();
    toast({ title: (doc as any)?.isArchived ? "استُعيد من الأرشيف" : "نُقل إلى الأرشيف" });
  };

  const handleToggleFavorite = async () => {
    await fetch(`/api/documents/${docId}/favorite`, { method: "PATCH", credentials: "include" });
    invalidate();
    toast({ title: doc?.isFavorite ? "Removed from favorites" : "Added to favorites ⭐" });
  };

  const handleCopyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied ✓" });
  };

  const handleTTS = (text?: string) => {
    if (ttsPlaying) { window.speechSynthesis.cancel(); setTtsPlaying(false); return; }
    const content = text || doc?.extractedText;
    if (!content) return;
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = doc?.language === "ar" ? "ar-SA" : "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => setTtsPlaying(false);
    utterance.onerror = () => setTtsPlaying(false);
    ttsRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setTtsPlaying(true);
  };

  const handlePrint = () => {
    const imageUrl = doc?.processedImageUrl || doc?.originalImageUrl;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${doc?.title}</title><style>body{margin:0;}img{max-width:100%;}pre{white-space:pre-wrap;font-size:12px;padding:20px;direction:auto;}</style></head><body>${imageUrl ? `<img src="${imageUrl}"/>` : ""}${doc?.extractedText ? `<pre>${doc.extractedText}</pre>` : ""}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const handleExportText = (format: "txt" | "md") => {
    const text = doc?.extractedText || "";
    const content = format === "md"
      ? `# ${doc?.title}\n\n**Date:** ${new Date(doc?.createdAt ?? "").toLocaleDateString()}\n\n---\n\n${text}${doc?.summary ? `\n\n## Summary\n\n${doc.summary}` : ""}`
      : text;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${doc?.title ?? "doc"}.${format}`; a.click();
    toast({ title: `Exported as .${format.toUpperCase()} ✓` });
  };

  const handleAddTag = async (tag: string) => {
    if (!tag.trim() || !doc) return;
    const current: string[] = (() => { try { return JSON.parse(doc.tags || "[]"); } catch { return []; } })();
    if (current.includes(tag.trim())) return;
    await fetch(`/api/documents/${docId}/tags`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [...current, tag.trim()] }),
    });
    invalidate(); setTagInputValue(""); setShowTagInput(false);
  };

  const handleRemoveTag = async (tag: string) => {
    if (!doc) return;
    const current: string[] = (() => { try { return JSON.parse(doc.tags || "[]"); } catch { return []; } })();
    await fetch(`/api/documents/${docId}/tags`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: current.filter(t => t !== tag) }),
    });
    invalidate();
  };

  const handleReCropApply = async (correctedDataUrl: string) => {
    const res = await fetch(`/api/documents/${docId}/update-image`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: correctedDataUrl }),
    });
    if (res.ok) { invalidate(); toast({ title: "Image updated ✓" }); }
    setShowReCropDialog(false);
  };

  const handleDelete = async () => {
    await deleteDoc.mutateAsync({ id: docId });
    toast({ title: "Document Deleted" });
    setLocation("/documents");
  };

  const resetImageEditor = () => { setRotation(0); setBrightness(100); setContrast(100); setGrayscale(false); setFlipH(false); setZoom(1); setSepia(0); setSaturation(100); setThreshold(false); };

  const highlightText = useCallback((text: string) => {
    if (!searchQuery.trim()) return text;
    const esc = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${esc})`, "gi"), `<mark class="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">$1</mark>`);
  }, [searchQuery]);

  const wordCount = doc?.extractedText ? doc.extractedText.trim().split(/\s+/).filter(Boolean).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const tags: string[] = (() => { try { return JSON.parse(doc?.tags || "[]"); } catch { return []; } })();
  const filterParts = [`brightness(${brightness}%)`, `contrast(${contrast}%)`, (grayscale || threshold) ? "grayscale(100%)" : "", threshold ? "contrast(400%) brightness(160%)" : "", sepia > 0 && !grayscale && !threshold ? `sepia(${sepia}%)` : "", saturation !== 100 && !grayscale && !threshold ? `saturate(${saturation}%)` : ""].filter(Boolean).join(" ");
  const imageStyle: React.CSSProperties = { transform: `rotate(${rotation}deg) scale(${zoom}) scaleX(${flipH ? -1 : 1})`, filter: filterParts, transition: "transform 0.3s ease, filter 0.3s ease", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const };

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!doc) return <div className="p-8 text-center text-muted-foreground">Document not found</div>;

  const imageUrl = doc.processedImageUrl || doc.originalImageUrl;
  const isArchived = (doc as any).isArchived as boolean | undefined;

  return (
    <div className="flex flex-col h-full bg-muted/5">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-card shadow-sm shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/documents">
            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="font-semibold text-sm line-clamp-1">{doc.title}</h1>
              {doc.docType && doc.docType !== "other" && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{DOC_TYPE_ICONS[doc.docType]} {doc.docType}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
              <Badge variant="outline" className="text-[10px] py-0 h-4">{doc.status}</Badge>
              {doc.language && <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">{doc.language}</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 flex-wrap shrink-0">
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${doc.isFavorite ? "text-yellow-500" : "text-muted-foreground"}`} onClick={handleToggleFavorite}>
            <Star className="w-4 h-4" fill={doc.isFavorite ? "currentColor" : "none"} />
          </Button>
          {doc.extractedText && (
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${ttsPlaying ? "text-primary animate-pulse" : "text-muted-foreground"}`} onClick={() => handleTTS()}>
              {ttsPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => { setShowShareDialog(true); handleShare(); }}>
            <Share2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => { setShowQrDialog(true); if (doc.extractedText) setQrText(doc.extractedText.substring(0, 300)); }}>
            <QrCode className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${isArchived ? "text-amber-500" : "text-muted-foreground"}`} onClick={handleToggleArchive} title={isArchived ? "استعادة من الأرشيف" : "أرشفة"}>
            {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </Button>
          {doc.extractedText && (
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => handleCopyText(doc.extractedText!)}>
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Copy</span>
            </Button>
          )}
          {doc.extractedText && <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => handleExportText("txt")}><FileDown className="w-3.5 h-3.5" /><span className="hidden sm:inline">TXT</span></Button>}
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={handlePrint}><Printer className="w-3.5 h-3.5" /><span className="hidden md:inline">Print</span></Button>
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowPdfOptions(true)} disabled={isProcessing}><Download className="w-3.5 h-3.5" /><span className="hidden md:inline">PDF</span></Button>
          {doc.status === "ocr_done" && (
            <Link href={`/chat/${doc.id}`}>
              <Button size="sm" className="gap-1.5 h-8 text-xs bg-primary/90"><MessageSquare className="w-3.5 h-3.5" /><span className="hidden sm:inline">Chat AI</span></Button>
            </Link>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Tags bar */}
      {(tags.length > 0 || doc.status === "ocr_done") && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/10 flex-wrap shrink-0">
          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
              {tag}
              <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {showTagInput ? (
            <form onSubmit={e => { e.preventDefault(); handleAddTag(tagInputValue); }} className="flex items-center gap-1">
              <input autoFocus value={tagInputValue} onChange={e => setTagInputValue(e.target.value)}
                onKeyDown={e => e.key === "Escape" && setShowTagInput(false)} placeholder="Add tag..."
                className="text-xs bg-background border border-border rounded-full px-2.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
              <button type="submit" className="text-primary"><Check className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => setShowTagInput(false)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
            </form>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
              <Plus className="w-3 h-3" /> Add tag
            </button>
          )}
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* LEFT: Image Viewer */}
        <div className="flex-1 flex flex-col bg-black/40 dark:bg-black/60 overflow-hidden min-h-[280px] md:min-h-0">
          {/* Image Toolbar */}
          <div className="flex items-center gap-1 px-3 py-2 bg-black/30 backdrop-blur-sm border-b border-white/10 shrink-0 flex-wrap">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}><ZoomIn className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}><ZoomOut className="w-4 h-4" /></Button>
            <span className="text-xs text-white/50 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setRotation(r => r - 90)}><RotateCcw className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setRotation(r => r + 90)}><RotateCw className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setFlipH(f => !f)}><FlipHorizontal className="w-4 h-4" /></Button>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <Button variant="ghost" size="sm" className={`h-7 text-xs gap-1.5 ${showEditor ? "text-primary bg-primary/20" : "text-white/70 hover:text-white hover:bg-white/10"}`} onClick={() => setShowEditor(e => !e)}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Adjust
            </Button>
            {imageUrl && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-white/70 hover:text-white hover:bg-white/10" onClick={() => { setRecropKey(k => k + 1); setShowReCropDialog(true); }}>
                <Crop className="w-3.5 h-3.5" /> Re-crop
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setShowWatermarkDialog(true)}>
              <Stamp className="w-3.5 h-3.5" /> Watermark
            </Button>
            <Button variant="ghost" size="sm" className={`h-7 text-xs gap-1.5 ${signatureDataUrl ? "text-green-400 bg-green-400/20" : "text-white/70 hover:text-white hover:bg-white/10"}`} onClick={() => setShowSignatureDialog(true)}>
              <PenLine className="w-3.5 h-3.5" /> Sign
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/10 ml-auto" onClick={() => setFullscreen(true)}>
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            {imageUrl ? (
              <>
                <img src={imageUrl} alt={doc.title} style={imageStyle} />
                {signatureDataUrl && (
                  <img src={signatureDataUrl} alt="Signature" className="absolute bottom-8 right-8 w-40 h-auto opacity-80 pointer-events-none" style={{ mixBlendMode: "multiply" }} />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/30">
                <FileText className="w-16 h-16" />
                <p className="text-sm">No image</p>
              </div>
            )}
          </div>

          {showEditor && (
            <div className="shrink-0 bg-black/50 backdrop-blur border-t border-white/10 p-4 space-y-4 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/80">Image Adjustments</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1" onClick={resetImageEditor}>
                  <RefreshCw className="w-3 h-3" /> Reset
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Brightness", icon: <Sun className="w-3 h-3"/>, val: brightness, set: setBrightness, min: 20, max: 200, cls: "" },
                  { label: "Contrast",   icon: <Contrast className="w-3 h-3"/>, val: contrast, set: setContrast, min: 20, max: 200, cls: "" },
                  { label: "Sepia",      icon: "🌅", val: sepia, set: (v: number) => { setSepia(v); if (v>0){setGrayscale(false);setThreshold(false);} }, min: 0, max: 100, cls: "[&_[role=slider]]:bg-amber-500" },
                  { label: "Saturation", icon: "🎨", val: saturation, set: (v: number) => { setSaturation(v); if (v!==100){setGrayscale(false);setThreshold(false);} }, min: 0, max: 300, cls: "[&_[role=slider]]:bg-emerald-500" },
                ].map(({ label, icon, val, set, min, max, cls }) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-white/60 flex items-center gap-1">{typeof icon === "string" ? icon : icon} {label}</label>
                      <span className="text-xs text-white/40">{val}%</span>
                    </div>
                    <Slider value={[val]} onValueChange={([v]) => set(v)} min={min} max={max} step={5} className={`[&_[role=slider]]:bg-primary ${cls}`} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: "Grayscale",      icon: <Palette className="w-3.5 h-3.5"/>, active: grayscale, cls: grayscale ? "border-primary bg-primary/20 text-primary" : "", onClick: () => setGrayscale(g => { if (!g){setThreshold(false);setSepia(0);} return !g; }) },
                  { label: "B&W Doc",        icon: "🖨", active: threshold, cls: threshold ? "border-orange-400 bg-orange-400/20 text-orange-300" : "", onClick: () => setThreshold(t => { if (!t){setGrayscale(false);setSepia(0);} return !t; }) },
                  { label: "Auto Enhance",   icon: <Wand2 className="w-3.5 h-3.5"/>, active: false, cls: "", onClick: () => { setBrightness(130);setContrast(150);setGrayscale(false);setSepia(0);setSaturation(100);setThreshold(false); } },
                  { label: "Document Mode",  icon: "📄", active: false, cls: "", onClick: () => { setBrightness(100);setContrast(130);setGrayscale(true);setSepia(0);setSaturation(100);setThreshold(false); } },
                  { label: "Vintage",        icon: "📜", active: false, cls: "", onClick: () => { setBrightness(100);setContrast(100);setSepia(30);setSaturation(80);setGrayscale(false);setThreshold(false); } },
                ].map(({ label, icon, cls, onClick }) => (
                  <button key={label} onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${cls || "border-white/20 text-white/60 hover:border-white/40 hover:text-white/80"}`}>
                    {typeof icon === "string" ? icon : icon} {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Content Panel */}
        <div className="w-full md:w-[480px] lg:w-[540px] shrink-0 flex flex-col bg-card border-l border-border overflow-hidden">
          {/* Action Buttons */}
          <div className="p-3 border-b border-border bg-muted/20 grid grid-cols-3 gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleProcess} disabled={isProcessing || doc.status !== "uploaded"} className="w-full justify-start gap-1.5 text-xs">
              <Wand2 className="w-3.5 h-3.5 text-primary shrink-0" /> تحسين
            </Button>
            <Button variant="outline" size="sm" onClick={handleOcr} disabled={isProcessing || !["uploaded","processed"].includes(doc.status)} className="w-full justify-start gap-1.5 text-xs">
              <Type className="w-3.5 h-3.5 text-primary shrink-0" /> OCR
            </Button>
            <Button variant="outline" size="sm" onClick={handleSummarize} disabled={isProcessing || doc.status !== "ocr_done"} className="w-full justify-start gap-1.5 text-xs">
              <FileOutput className="w-3.5 h-3.5 text-primary shrink-0" /> ملخص AI
            </Button>
            <Button variant="outline" size="sm" onClick={handleClassify} disabled={classifying} className="w-full justify-start gap-1.5 text-xs">
              {classifying ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <FileSearch className="w-3.5 h-3.5 text-violet-500 shrink-0" />} تصنيف
            </Button>
            <Button variant="outline" size="sm" onClick={handleExtractEntities} disabled={extractingEntities || !doc.extractedText} className="w-full justify-start gap-1.5 text-xs">
              {extractingEntities ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Hash className="w-3.5 h-3.5 text-teal-500 shrink-0" />} بيانات
            </Button>
            <Button variant="outline" size="sm" onClick={handleDetectBook} disabled={detectingBook} className="w-full justify-start gap-1.5 text-xs">
              {detectingBook ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <BookOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />} كتاب؟
            </Button>
          </div>

          {/* Word count */}
          {doc.extractedText && (
            <div className="px-4 py-1.5 border-b border-border bg-muted/10 flex items-center gap-3 text-xs text-muted-foreground shrink-0 flex-wrap">
              <span>{wordCount.toLocaleString()} كلمة</span>
              <span className="text-border">•</span>
              <span>{doc.extractedText.length.toLocaleString()} حرف</span>
              <span className="text-border">•</span>
              <span>~{readingTime} دقيقة</span>
              {ttsPlaying && <span className="text-primary animate-pulse flex items-center gap-1"><Volume2 className="w-3 h-3" /> يقرأ…</span>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue={doc.summary ? "summary" : "text"} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-4 w-auto">
                <TabsTrigger value="text"       className="text-xs">النص</TabsTrigger>
                <TabsTrigger value="translate"  className="text-xs">ترجمة</TabsTrigger>
                <TabsTrigger value="entities"   className="text-xs" disabled={!entities}>بيانات</TabsTrigger>
                <TabsTrigger value="summary"    className="text-xs" disabled={!doc.summary}>AI</TabsTrigger>
              </TabsList>

              {/* Text tab */}
              <TabsContent value="text" className="flex-1 overflow-hidden flex flex-col mt-0 px-4 pb-4">
                {doc.extractedText ? (
                  <>
                    <div className="relative my-3 shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="بحث في النص…"
                        className="w-full pl-8 pr-8 py-2 text-sm bg-muted/50 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary" />
                      {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="prose prose-sm dark:prose-invert max-w-none font-mono whitespace-pre-wrap text-sm leading-relaxed p-3 bg-muted/20 rounded-lg border border-border" dir="auto"
                        dangerouslySetInnerHTML={{ __html: highlightText(doc.extractedText) }} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                    <Type className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">لم يُستخرج نص بعد</p>
                    <p className="text-sm mt-1">اضغط "OCR" لاستخراج النص</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={handleOcr} disabled={isProcessing}>
                      <Type className="w-3.5 h-3.5" /> استخراج النص
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Translation tab */}
              <TabsContent value="translate" className="flex-1 overflow-hidden flex flex-col mt-0 px-4 pb-4">
                <div className="py-3 shrink-0 space-y-2">
                  <div className="flex gap-2">
                    <select value={translationLang} onChange={e => { setTranslationLang(e.target.value); setTranslatedText(null); }}
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm">
                      {LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>{l.nameAr} ({l.name})</option>
                      ))}
                    </select>
                    <Button onClick={handleTranslate} disabled={isTranslating || !doc.extractedText} className="gap-1.5 shrink-0">
                      {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                      ترجم
                    </Button>
                  </div>
                  {!doc.extractedText && <p className="text-xs text-muted-foreground">شغّل OCR أولاً لاستخراج النص</p>}
                </div>
                {translatedText ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium">ترجمة إلى {LANGUAGES.find(l => l.code === translationLang)?.nameAr}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleCopyText(translatedText)}><Copy className="w-3 h-3" /> نسخ</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleTTS(translatedText)}><Volume2 className="w-3 h-3" /> استمع</Button>
                      </div>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed p-3 bg-primary/5 rounded-lg border border-primary/20" dir="auto">
                      {translatedText}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-6">
                    <Languages className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">اختر لغة واضغط "ترجم"</p>
                  </div>
                )}
              </TabsContent>

              {/* Entities tab */}
              <TabsContent value="entities" className="flex-1 overflow-y-auto mt-0 px-4 pb-4">
                {entities ? (
                  <div className="mt-3 space-y-3">
                    {[
                      { key: "names",         label: "الأسماء",     icon: <Users className="w-3.5 h-3.5 text-blue-400" /> },
                      { key: "dates",         label: "التواريخ",    icon: <Calendar className="w-3.5 h-3.5 text-green-400" /> },
                      { key: "amounts",       label: "المبالغ",     icon: <Hash className="w-3.5 h-3.5 text-yellow-400" /> },
                      { key: "phones",        label: "الهواتف",     icon: <Phone className="w-3.5 h-3.5 text-purple-400" /> },
                      { key: "emails",        label: "الإيميلات",   icon: <Mail className="w-3.5 h-3.5 text-red-400" /> },
                      { key: "addresses",     label: "العناوين",    icon: <MapPin className="w-3.5 h-3.5 text-orange-400" /> },
                      { key: "ids",           label: "الأرقام",     icon: <Hash className="w-3.5 h-3.5 text-teal-400" /> },
                      { key: "organizations", label: "الجهات",      icon: <Building2 className="w-3.5 h-3.5 text-indigo-400" /> },
                    ].map(({ key, label, icon }) => {
                      const vals = entities[key] ?? [];
                      if (!vals.length) return null;
                      return (
                        <Card key={key} className="border-border/50">
                          <CardHeader className="pb-1 pt-3">
                            <CardTitle className="text-xs flex items-center gap-1.5">{icon} {label} <span className="text-muted-foreground">({vals.length})</span></CardTitle>
                          </CardHeader>
                          <CardContent className="pb-3">
                            <div className="flex flex-wrap gap-1.5">
                              {vals.map((v, i) => (
                                <button key={i} onClick={() => handleCopyText(v)}
                                  className="text-xs px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border/50 transition-colors"
                                  title="Click to copy">
                                  {v}
                                </button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                    <Hash className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">لم تُستخرج البيانات بعد</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={handleExtractEntities} disabled={extractingEntities || !doc.extractedText}>
                      {extractingEntities ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hash className="w-3.5 h-3.5" />} استخراج البيانات
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* AI Analysis tab */}
              <TabsContent value="summary" className="flex-1 overflow-y-auto mt-0 px-4 pb-4 space-y-4">
                {classifyResult && (
                  <Card className="border-violet-500/20 bg-violet-500/5 mt-3">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{DOC_TYPE_ICONS[classifyResult.type] ?? "📄"}</span>
                        <div>
                          <p className="text-sm font-semibold capitalize">{classifyResult.type}</p>
                          {classifyResult.subtype && <p className="text-xs text-muted-foreground">{classifyResult.subtype}</p>}
                        </div>
                        <span className="ml-auto text-xs text-muted-foreground">{Math.round((classifyResult.confidence ?? 0.5) * 100)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {doc.summary ? (
                  <div className="space-y-4">
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-2 pt-4"><CardTitle className="text-xs text-primary flex items-center gap-2"><FileOutput className="w-3.5 h-3.5" /> الملخص</CardTitle></CardHeader>
                      <CardContent className="pb-4"><p className="text-sm leading-relaxed" dir="auto">{doc.summary}</p></CardContent>
                    </Card>
                    {doc.keyPoints && (() => {
                      try {
                        const points: string[] = JSON.parse(doc.keyPoints);
                        return (
                          <Card>
                            <CardHeader className="pb-2 pt-4"><CardTitle className="text-xs flex items-center gap-2"><ChevronRight className="w-3.5 h-3.5 text-primary" /> النقاط الرئيسية</CardTitle></CardHeader>
                            <CardContent className="pb-4">
                              <ul className="space-y-2">
                                {points.map((p, i) => (
                                  <li key={i} className="flex items-start text-sm gap-2" dir="auto">
                                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                                    <span>{p}</span>
                                  </li>
                                ))}
                              </ul>
                            </CardContent>
                          </Card>
                        );
                      } catch { return null; }
                    })()}
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => handleCopyText(doc.summary!)}><Copy className="w-3 h-3" /> نسخ الملخص</Button>
                      <Link href={`/chat/${doc.id}`}><Button size="sm" className="gap-2 text-xs"><MessageSquare className="w-3 h-3" /> محادثة</Button></Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground py-8">
                    <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">لا يوجد تحليل بعد</p>
                    <p className="text-sm mt-1">شغّل OCR ثم اضغط "ملخص AI"</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Fullscreen */}
      {fullscreen && imageUrl && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setFullscreen(false)}>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white hover:bg-white/10" onClick={() => setFullscreen(false)}><X className="w-6 h-6" /></Button>
          <img src={imageUrl} alt={doc.title} style={imageStyle} className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* PDF Options Dialog */}
      <Dialog open={showPdfOptions} onOpenChange={setShowPdfOptions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> خيارات PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="pageNums" checked={pdfAddPageNumbers} onChange={e => setPdfPageNumbers(e.target.checked)} />
              <label htmlFor="pageNums" className="text-sm">إضافة أرقام الصفحات</label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> كلمة مرور (اختياري)</label>
              <Input type="password" placeholder="اتركه فارغاً بدون تشفير" value={pdfPassword} onChange={e => setPdfPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">مستوى الضغط</label>
              <select value={pdfCompress} onChange={e => setPdfCompress(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                <option value="none">بدون ضغط</option>
                <option value="medium">ضغط متوسط</option>
                <option value="high">ضغط عالي</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowPdfOptions(false)}>إلغاء</Button>
              <Button onClick={() => { setShowPdfOptions(false); handleDownloadPdf(undefined, { password: pdfPassword || undefined, compress: pdfCompress, pageNumbers: pdfAddPageNumbers }); }} className="gap-2">
                <Download className="w-4 h-4" /> تحميل PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Watermark Dialog */}
      <Dialog open={showWatermarkDialog} onOpenChange={setShowWatermarkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stamp className="w-4 h-4" /> إضافة علامة مائية</DialogTitle>
            <DialogDescription>أدخل نص العلامة المائية على PDF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="مثل: سري، مسودة، لا للنشر"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="p-3 bg-muted/30 rounded-lg border border-border text-center">
              <span className="text-2xl font-bold text-muted-foreground/40 select-none">{watermarkText || "WATERMARK"}</span>
              <p className="text-xs text-muted-foreground mt-1">معاينة (قطري على الصفحة)</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowWatermarkDialog(false)}>إلغاء</Button>
              <Button onClick={() => { handleDownloadPdf(watermarkText); setShowWatermarkDialog(false); }} disabled={!watermarkText.trim() || isProcessing} className="gap-2">
                <Download className="w-4 h-4" /> تحميل مع العلامة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 className="w-4 h-4" /> مشاركة المستند</DialogTitle>
            <DialogDescription>رابط مباشر للمشاركة مع الآخرين (للقراءة فقط)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {generatingShare && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ إنشاء الرابط…</div>}
            {shareUrl && (
              <div className="flex gap-2">
                <input readOnly value={shareUrl} className="flex-1 px-3 py-2 border border-border rounded-lg bg-muted/30 text-xs font-mono" />
                <Button size="sm" onClick={() => navigator.clipboard.writeText(shareUrl)} className="gap-1"><Copy className="w-3.5 h-3.5" /> نسخ</Button>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="destructive" size="sm" onClick={async () => {
                await fetch(`/api/documents/${docId}/share`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revoke: true }) });
                setShareUrl(null); toast({ title: "تم إلغاء الرابط" });
              }}>إلغاء الرابط</Button>
              <Button variant="outline" onClick={() => setShowShareDialog(false)}>إغلاق</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="w-4 h-4" /> إنشاء QR Code</DialogTitle>
            <DialogDescription>حوّل أي نص إلى رمز QR قابل للمسح</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <textarea value={qrText} onChange={e => setQrText(e.target.value)} rows={4} placeholder="أدخل النص أو الرابط…"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            <Button onClick={handleGenerateQr} disabled={generatingQr || !qrText.trim()} className="w-full gap-2">
              {generatingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} إنشاء QR
            </Button>
            {qrImageUrl && (
              <div className="flex flex-col items-center gap-3">
                <img src={qrImageUrl} alt="QR Code" className="w-48 h-48 rounded-xl border border-border" />
                <a href={qrImageUrl} download={`qr_${docId}.png`}>
                  <Button variant="outline" size="sm" className="gap-2"><Download className="w-3.5 h-3.5" /> تحميل QR</Button>
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Book Detection Dialog */}
      <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> اكتشاف الكتاب</DialogTitle>
          </DialogHeader>
          {bookResult && (
            <div className="space-y-3 mt-2">
              {bookResult.isBook ? (
                <>
                  <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="text-3xl">📚</span>
                    <div>
                      <p className="font-semibold">{bookResult.title ?? "كتاب مجهول"}</p>
                      <p className="text-sm text-muted-foreground">{bookResult.author ?? "مؤلف غير معروف"}</p>
                    </div>
                  </div>
                  {[
                    { label: "الناشر", val: bookResult.publisher },
                    { label: "سنة النشر", val: bookResult.year },
                    { label: "النوع", val: bookResult.genre },
                    { label: "اللغة", val: bookResult.language },
                    { label: "ISBN", val: bookResult.isbn },
                  ].filter(r => r.val).map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}:</span>
                      <span className="font-medium">{val}</span>
                    </div>
                  ))}
                  {bookResult.summary && <p className="text-sm text-muted-foreground border-t border-border pt-3">{bookResult.summary}</p>}
                </>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-4xl mb-2">🔍</p>
                  <p>لم يُكتشَف كتاب في هذه الصورة</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <Dialog open={showSignatureDialog} onOpenChange={setShowSignatureDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PenLine className="w-4 h-4" /> التوقيع الإلكتروني</DialogTitle>
            <DialogDescription>ارسم توقيعك أدناه. سيظهر فوق صورة المستند.</DialogDescription>
          </DialogHeader>
          <SignaturePad
            onSave={(url) => { setSignatureDataUrl(url); setShowSignatureDialog(false); toast({ title: "تم إضافة التوقيع ✓" }); }}
            onClose={() => setShowSignatureDialog(false)}
          />
          {signatureDataUrl && (
            <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => { setSignatureDataUrl(null); setShowSignatureDialog(false); }}>حذف التوقيع الحالي</Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Re-Crop Dialog */}
      <Dialog open={showReCropDialog} onOpenChange={setShowReCropDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crop className="w-4 h-4" /> إعادة القص وتصحيح المنظور</DialogTitle>
            <DialogDescription>اسحب الزوايا لمحاذاة حواف المستند.</DialogDescription>
          </DialogHeader>
          {imageUrl && <DocumentCropper key={recropKey} imageDataUrl={imageUrl} onApply={handleReCropApply} onSkip={() => setShowReCropDialog(false)} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف المستند</DialogTitle>
            <DialogDescription>هل تريد حذف "{doc.title}"؟ لا يمكن التراجع.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteDoc.isPending}>
              {deleteDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />} حذف
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
