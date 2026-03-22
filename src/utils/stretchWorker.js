// ─── Web Worker for full-resolution stretch rendering ───────────────────────
// Receives channel data + stretch params, returns RGBA ImageData buffer.

function mtf(m, x) {
  if (x <= 0) return 0; if (x >= 1) return 1; if (x === m) return 0.5;
  return ((m - 1) * x) / ((2 * m - 1) * x - m);
}

function stretchPixel(value, lo, hi, midtone) {
  const range = hi - lo || 1;
  return mtf(midtone, Math.max(0, Math.min(1, (value - lo) / range)));
}

// Keep channel data cached so we don't have to re-transfer it each time
let cachedChannels = null;
let cachedWidth = 0;
let cachedHeight = 0;
let cachedDepth = 0;

self.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    // Store channel data (copied once)
    cachedChannels = msg.channels.map(buf => new Float32Array(buf));
    cachedWidth = msg.width;
    cachedHeight = msg.height;
    cachedDepth = msg.depth;
    self.postMessage({ type: "ready" });
    return;
  }

  if (msg.type === "render") {
    const channels = cachedChannels;
    if (!channels) return;

    const width = cachedWidth;
    const height = cachedHeight;
    const depth = cachedDepth;
    const { lo, hi, midtone } = msg.stretchParams;
    const colorMap = msg.colorMap || "gray";
    const px = new Uint8ClampedArray(width * height * 4);

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
          if (colorMap === "gray") { px[di] = px[di + 1] = px[di + 2] = val; }
          else if (colorMap === "heat") {
            const t = val / 255;
            px[di] = Math.round(Math.min(1, t * 3) * 255);
            px[di + 1] = Math.round(Math.max(0, Math.min(1, (t - 0.33) * 3)) * 255);
            px[di + 2] = Math.round(Math.max(0, Math.min(1, (t - 0.66) * 3)) * 255);
          } else if (colorMap === "cool") {
            const t = val / 255;
            px[di] = Math.round((1 - t) * 128);
            px[di + 1] = Math.round(t * 200 + 55);
            px[di + 2] = Math.round(Math.min(1, t * 1.5) * 255);
          }
          px[di + 3] = 255;
        }
      }
    }

    // Transfer the buffer back (zero-copy)
    self.postMessage({ type: "result", imageData: px.buffer, width, height }, [px.buffer]);
  }
};
