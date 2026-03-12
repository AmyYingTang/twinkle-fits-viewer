import { stretchPixel } from "./stretch.js";

// ─── Render to Canvas ────────────────────────────────────────────────
export const COLORMAPS = ["gray", "heat", "cool"];

export function renderToCanvas(canvas, imageData, stretchParams, colorMap = "gray") {
  const { width, height, depth, channels } = imageData;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(width, height);
  const px = imgData.data;
  const { lo, hi, midtone } = stretchParams;

  if (depth >= 3) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (height - 1 - y) * width + x;
        const di = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const lc = Array.isArray(lo) ? lo[c] : lo;
          const hc = Array.isArray(hi) ? hi[c] : hi;
          const mc = Array.isArray(midtone) ? midtone[c] : midtone;
          px[di + c] = Math.round(stretchPixel(channels[c][si], lc, hc, mc) * 255);
        }
        px[di + 3] = 255;
      }
    }
  } else {
    const ch = channels[0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const si = (height - 1 - y) * width + x;
        const di = (y * width + x) * 4;
        const val = Math.round(stretchPixel(ch[si], lo, hi, midtone) * 255);
        if (colorMap === "gray") { px[di] = px[di+1] = px[di+2] = val; }
        else if (colorMap === "heat") {
          const t = val / 255;
          px[di] = Math.round(Math.min(1, t * 3) * 255);
          px[di+1] = Math.round(Math.max(0, Math.min(1, (t - 0.33) * 3)) * 255);
          px[di+2] = Math.round(Math.max(0, Math.min(1, (t - 0.66) * 3)) * 255);
        } else if (colorMap === "cool") {
          const t = val / 255;
          px[di] = Math.round((1-t) * 128); px[di+1] = Math.round(t * 200 + 55);
          px[di+2] = Math.round(Math.min(1, t * 1.5) * 255);
        }
        px[di + 3] = 255;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
