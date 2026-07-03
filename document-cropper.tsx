import { useState, useRef, useEffect, useCallback } from "react";
import { warpPerspective, type Pt } from "@/lib/perspective";
import { Button } from "@/components/ui/button";
import { Crop, SkipForward, RotateCcw } from "lucide-react";

interface Props {
  imageDataUrl: string;
  onApply: (correctedDataUrl: string) => void;
  onSkip: () => void;
}

const HANDLE_R = 14;
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
const LABELS = ["TL", "TR", "BR", "BL"];

export default function DocumentCropper({ imageDataUrl, onApply, onSkip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [displayRect, setDisplayRect] = useState({ left: 0, top: 0, w: 1, h: 1 });
  const [dragging, setDragging] = useState<number | null>(null);

  // Corners in normalized coords [0..1]
  const [corners, setCorners] = useState<[Pt, Pt, Pt, Pt]>([
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ]);

  const updateDisplayRect = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.min(cw / nw, ch / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    setDisplayRect({
      left: (cw - dw) / 2,
      top: (ch - dh) / 2,
      w: dw,
      h: dh,
    });
  }, []);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setNaturalW(e.currentTarget.naturalWidth);
    setNaturalH(e.currentTarget.naturalHeight);
    setTimeout(updateDisplayRect, 50);
  };

  useEffect(() => {
    window.addEventListener("resize", updateDisplayRect);
    return () => window.removeEventListener("resize", updateDisplayRect);
  }, [updateDisplayRect]);

  // Convert normalized → SVG display coords
  const toDisplay = (pt: Pt) => ({
    x: displayRect.left + pt.x * displayRect.w,
    y: displayRect.top + pt.y * displayRect.h,
  });

  const toNorm = (clientX: number, clientY: number): Pt => {
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - displayRect.left) / displayRect.w;
    const y = (clientY - rect.top - displayRect.top) / displayRect.h;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const onPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(idx);
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (dragging === null) return;
    const pt = toNorm(e.clientX, e.clientY);
    setCorners(prev => {
      const next = [...prev] as [Pt, Pt, Pt, Pt];
      next[dragging] = pt;
      return next;
    });
  };

  const onPointerUp = () => setDragging(null);

  const reset = () =>
    setCorners([
      { x: 0.05, y: 0.05 },
      { x: 0.95, y: 0.05 },
      { x: 0.95, y: 0.95 },
      { x: 0.05, y: 0.95 },
    ]);

  const apply = () => {
    const img = imgRef.current!;
    const canvas = document.createElement("canvas");
    canvas.width = naturalW;
    canvas.height = naturalH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, naturalW, naturalH);

    const imgCorners: [Pt, Pt, Pt, Pt] = corners.map(c => ({
      x: c.x * naturalW,
      y: c.y * naturalH,
    })) as [Pt, Pt, Pt, Pt];

    const warped = warpPerspective(canvas, imgCorners);
    onApply(warped.toDataURL("image/jpeg", 0.92));
  };

  const svgCorners = corners.map(toDisplay);
  const poly = svgCorners.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">تعديل حدود المستند</h3>
          <p className="text-xs text-muted-foreground mt-0.5">اسحب النقاط الملونة لضبط حواف الورقة</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-xs">
          <RotateCcw className="w-3.5 h-3.5" /> إعادة ضبط
        </Button>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl bg-black/80 border border-border"
        style={{ height: "55vh" }}
      >
        <img
          ref={imgRef}
          src={imageDataUrl}
          alt="Document to crop"
          onLoad={onImageLoad}
          className="absolute inset-0 m-auto object-contain w-full h-full"
          style={{ pointerEvents: "none" }}
        />

        {displayRect.w > 1 && (
          <svg
            className="absolute inset-0 w-full h-full"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Dark overlay outside the selected quad */}
            <defs>
              <mask id="crop-mask">
                <rect width="100%" height="100%" fill="white" />
                <polygon points={poly} fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#crop-mask)" />

            {/* Selection quad outline */}
            <polygon points={poly} fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth="2" strokeDasharray="6 3" />

            {/* Edge lines */}
            {[0, 1, 2, 3].map(i => {
              const a = svgCorners[i];
              const b = svgCorners[(i + 1) % 4];
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS[i]} strokeWidth="1.5" opacity="0.7" />;
            })}

            {/* Corner handles */}
            {svgCorners.map((pt, i) => (
              <g key={i} onPointerDown={onPointerDown(i)} style={{ cursor: "grab", touchAction: "none" }}>
                <circle cx={pt.x} cy={pt.y} r={HANDLE_R + 6} fill="transparent" />
                <circle cx={pt.x} cy={pt.y} r={HANDLE_R} fill={COLORS[i]} stroke="white" strokeWidth="2.5" opacity="0.92" />
                <text x={pt.x} y={pt.y + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold" style={{ pointerEvents: "none" }}>
                  {LABELS[i]}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onSkip} className="flex-1 gap-2">
          <SkipForward className="w-4 h-4" /> تخطي
        </Button>
        <Button onClick={apply} className="flex-1 gap-2">
          <Crop className="w-4 h-4" /> تطبيق القص والتصحيح
        </Button>
      </div>
    </div>
  );
}
