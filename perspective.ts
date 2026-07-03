// Perspective transform — backward mapping with bilinear interpolation

export type Pt = { x: number; y: number };

function gaussianElim(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / pivot;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Compute H so that H * srcPts[i] ≈ dstPts[i] (homogeneous)
function computeH(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  const h = gaussianElim(A, b);
  return [...h, 1];
}

function dist(a: Pt, b: Pt) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Warp srcCanvas using 4 corners [TL, TR, BR, BL] → rectangular output
export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  corners: [Pt, Pt, Pt, Pt],   // TL, TR, BR, BL in src image coords
): HTMLCanvasElement {
  const [TL, TR, BR, BL] = corners;
  const outW = Math.round(Math.max(dist(TL, TR), dist(BL, BR)));
  const outH = Math.round(Math.max(dist(TL, BL), dist(TR, BR)));

  const dstCorners: [Pt, Pt, Pt, Pt] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];

  // Backward mapping: for each output pixel, compute source pixel
  const H = computeH(dstCorners, corners);
  const [h00, h01, h02, h10, h11, h12, h20, h21] = H;

  const srcCtx = srcCanvas.getContext("2d")!;
  const { width: srcW, height: srcH } = srcCanvas;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d")!;
  const outImg = outCtx.createImageData(outW, outH);
  const out = outImg.data;

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const w = h20 * ox + h21 * oy + 1;
      const sx = (h00 * ox + h01 * oy + h02) / w;
      const sy = (h10 * ox + h11 * oy + h12) / w;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = x0 + 1, y1 = y0 + 1;
      const fx = sx - x0, fy = sy - y0;
      const oi = (oy * outW + ox) * 4;
      if (x0 < 0 || y0 < 0 || x1 >= srcW || y1 >= srcH) {
        out[oi] = 255; out[oi + 1] = 255; out[oi + 2] = 255; out[oi + 3] = 255;
        continue;
      }
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      for (let c = 0; c < 3; c++) {
        out[oi + c] = Math.round(
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
          srcData[i10 + c] * fx * (1 - fy) +
          srcData[i01 + c] * (1 - fx) * fy +
          srcData[i11 + c] * fx * fy,
        );
      }
      out[oi + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}
