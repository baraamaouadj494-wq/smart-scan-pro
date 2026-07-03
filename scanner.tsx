import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Camera, Upload, Image as ImageIcon, X, Loader2, Zap, Crop } from "lucide-react";
import { useUploadDocument, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import DocumentCropper from "@/components/document-cropper";

type DocType = "other" | "invoice" | "receipt" | "contract" | "report" | "letter" | "academic" | "form";
type BatchFile = { id: string; preview: string; mimeType: string; base64: string; docType: DocType; name: string };
type Step = "capture" | "crop" | "ready";

const DOC_TYPES: { value: DocType; label: string; icon: string }[] = [
  { value: "other",    label: "General",  icon: "📄" },
  { value: "invoice",  label: "Invoice",  icon: "💰" },
  { value: "receipt",  label: "Receipt",  icon: "🧾" },
  { value: "contract", label: "Contract", icon: "📝" },
  { value: "report",   label: "Report",   icon: "📊" },
  { value: "letter",   label: "Letter",   icon: "✉️" },
  { value: "academic", label: "Academic", icon: "🎓" },
  { value: "form",     label: "Form",     icon: "📋" },
];

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const [header, base64] = result.split(",");
      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : file.type || "image/jpeg";
      resolve({ base64: result, mimeType, preview: result });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Scanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"camera" | "upload">("upload");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("capture");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // image waiting for crop
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<DocType>("other");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const uploadDoc = useUploadDocument();

  useEffect(() => {
    if (mode === "camera" && step === "capture" && !pendingImage) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [mode, step, pendingImage]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch {
      toast({ title: "لا يمكن الوصول للكاميرا", variant: "destructive" });
      setMode("upload");
    }
  };

  const stopCamera = () => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(v, 0, 0);
        const dataUrl = c.toDataURL("image/jpeg", 0.92);
        setPendingImage(dataUrl);
        setStep("crop");
      }
    }
  };

  const handleCropApply = (correctedDataUrl: string) => {
    setCapturedImage(correctedDataUrl);
    setPendingImage(null);
    setStep("ready");
  };

  const handleCropSkip = () => {
    setCapturedImage(pendingImage);
    setPendingImage(null);
    setStep("ready");
  };

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 10);
    if (!arr.length) { toast({ title: "الصور فقط مدعومة", variant: "destructive" }); return; }

    if (arr.length === 1) {
      // Single image → go to crop step
      const { base64, mimeType, preview } = await fileToBase64(arr[0]);
      setPendingImage(base64 || preview);
      setStep("crop");
      return;
    }

    // Multiple images → skip crop, go to batch
    const parsed = await Promise.all(arr.map(async (f) => {
      const { base64, mimeType, preview } = await fileToBase64(f);
      return { id: Math.random().toString(36).slice(2), preview, mimeType, base64, docType: selectedDocType, name: f.name } as BatchFile;
    }));
    setBatchFiles(prev => [...prev, ...parsed].slice(0, 10));
    setStep("ready");
  }, [selectedDocType, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeBatchFile = (id: string) => setBatchFiles(prev => prev.filter(f => f.id !== id));
  const updateBatchDocType = (id: string, docType: DocType) =>
    setBatchFiles(prev => prev.map(f => f.id === id ? { ...f, docType } : f));

  const resetAll = () => {
    setCapturedImage(null);
    setPendingImage(null);
    setBatchFiles([]);
    setStep("capture");
  };

  const handleBatchUpload = async () => {
    const files = batchFiles.length > 0
      ? batchFiles
      : capturedImage
        ? [{ id: "cap", base64: capturedImage, mimeType: "image/jpeg", preview: capturedImage, docType: selectedDocType, name: "Camera scan" }]
        : [];
    if (!files.length) return;

    setUploadProgress({ current: 0, total: files.length });
    let lastDocId: number | null = null;

    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      try {
        const [header] = files[i].base64.split(",");
        const mimeMatch = header.match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : files[i].mimeType;
        const doc = await uploadDoc.mutateAsync({
          data: { imageData: files[i].base64, mimeType, title: `Scan ${new Date().toLocaleString()}`, language: "both", docType: files[i].docType },
        });
        lastDocId = doc.id;
      } catch {
        toast({ title: `فشل رفع الملف ${i + 1}`, variant: "destructive" });
      }
    }

    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    setUploadProgress(null);
    resetAll();

    if (files.length === 1 && lastDocId) {
      toast({ title: "تم رفع المستند ✓" });
      setLocation(`/documents/${lastDocId}`);
    } else {
      toast({ title: `تم رفع ${files.length} مستندات ✓` });
      setLocation("/documents");
    }
  };

  const hasPending = batchFiles.length > 0 || capturedImage !== null;

  // ── Crop step ──────────────────────────────────────────────────────────────
  if (step === "crop" && pendingImage) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-8 bg-muted/5">
        <div className="w-full max-w-2xl mx-auto">
          <DocumentCropper
            imageDataUrl={pendingImage}
            onApply={handleCropApply}
            onSkip={handleCropSkip}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center p-4 md:p-8 bg-muted/5 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-5">

        {/* Mode Toggle */}
        <div className="flex bg-muted/50 p-1 rounded-xl backdrop-blur border border-border">
          {(["camera", "upload"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); resetAll(); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${mode === m ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "camera" ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              {m === "camera" ? "كاميرا" : "رفع ملف"}
            </button>
          ))}
        </div>

        {/* Camera Mode */}
        {mode === "camera" && step === "capture" && (
          <Card className="overflow-hidden border-border/50 shadow-2xl">
            <CardContent className="p-0">
              <div className="relative bg-black overflow-hidden" style={{ minHeight: "360px" }}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full object-cover" style={{ minHeight: "360px" }} />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-0 right-0 h-0.5 bg-primary/80 shadow-[0_0_12px_2px_rgba(139,92,246,0.6)] animate-scan-line z-10" />
                  <div className="absolute inset-8 border-2 border-transparent">
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  </div>
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <span className="text-xs text-white/60 bg-black/40 px-3 py-1 rounded-full backdrop-blur flex items-center gap-1.5">
                      <Crop className="w-3 h-3" /> ضع الورقة داخل الإطار
                    </span>
                  </div>
                </div>
                <div className="absolute bottom-12 left-0 right-0 flex justify-center">
                  <button onClick={captureImage} className="w-16 h-16 rounded-full border-4 border-white/60 flex items-center justify-center hover:bg-white/10 transition-all active:scale-95">
                    <div className="w-12 h-12 bg-white rounded-full shadow-lg" />
                  </button>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </CardContent>
          </Card>
        )}

        {/* Captured image preview (ready step from camera) */}
        {mode === "camera" && step === "ready" && capturedImage && (
          <Card className="overflow-hidden border-border/50 shadow-2xl">
            <CardContent className="p-0">
              <div className="relative bg-black">
                <img src={capturedImage} alt="Captured" className="w-full object-contain max-h-[60vh]" />
                <Button variant="destructive" size="icon" className="absolute top-3 right-3 rounded-full shadow-lg" onClick={resetAll}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Mode */}
        {mode === "upload" && batchFiles.length === 0 && step === "capture" && (
          <div
            className={`relative border-2 border-dashed rounded-2xl transition-all duration-300 p-10 text-center ${isDragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-muted/10 hover:border-primary/40"}`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
          >
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-colors ${isDragOver ? "bg-primary/20" : "bg-muted"}`}>
              <Upload className={`w-9 h-9 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <h3 className="font-semibold text-xl mb-2">{isDragOver ? "أفلت هنا!" : "رفع مستندات"}</h3>
            <p className="text-muted-foreground text-sm mb-6">سحب وإفلات الصور أو اختيارها. حتى 10 ملفات. صورة واحدة = خطوة قص تلقائية.</p>
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <ImageIcon className="w-4 h-4" /> اختر صوراً
            </Button>
            <p className="text-xs text-muted-foreground mt-4">JPG، PNG، WebP، HEIC</p>
          </div>
        )}

        {/* Batch File Previews */}
        {batchFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{batchFiles.length} ملف جاهز</h3>
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-xs">
                <Upload className="w-3.5 h-3.5" /> إضافة المزيد
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {batchFiles.map((file) => (
                <div key={file.id} className="relative group rounded-xl overflow-hidden border border-border bg-card">
                  <div className="aspect-[3/4] relative overflow-hidden bg-muted">
                    <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeBatchFile(file.id)}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-2">
                    <select
                      value={file.docType}
                      onChange={(e) => updateBatchDocType(file.id, e.target.value as DocType)}
                      className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doc Type selector (camera capture) */}
        {step === "ready" && capturedImage && mode === "camera" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">نوع المستند</label>
            <div className="grid grid-cols-4 gap-2">
              {DOC_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setSelectedDocType(t.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-xs font-medium transition-all ${selectedDocType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                >
                  <span className="text-lg">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-xl border border-primary/20">
            <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">جارٍ الرفع…</span>
                <span className="text-xs text-muted-foreground">{uploadProgress.current}/{uploadProgress.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {hasPending && !uploadProgress && (
          <Button size="lg" className="w-full font-semibold gap-2 h-12 shadow-lg shadow-primary/20" onClick={handleBatchUpload} disabled={uploadDoc.isPending}>
            {uploadDoc.isPending
              ? <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ المعالجة...</>
              : <><Zap className="w-5 h-5" /> رفع {batchFiles.length > 1 ? `${batchFiles.length} مستندات` : "وتحليل"}</>}
          </Button>
        )}

        {/* Tips */}
        {!hasPending && step === "capture" && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { icon: "🎯", title: "كشف تلقائي", desc: "الذكاء الاصطناعي يكشف نوع المستند" },
              { icon: "✂️", title: "قص وتصحيح", desc: "اضبط الحواف الأربعة يدوياً" },
              { icon: "⚡", title: "OCR سريع", desc: "عربي وإنجليزي بدقة عالية" },
            ].map((tip, i) => (
              <div key={i} className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
                <div className="text-2xl mb-1">{tip.icon}</div>
                <p className="text-xs font-medium">{tip.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{tip.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
