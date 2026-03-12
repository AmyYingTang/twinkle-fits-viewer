// ─── Histogram Canvas ────────────────────────────────────────────────
export function drawHistogram(canvas, histData, stretchParams) {
  if (!canvas || !histData) return;
  const { hist, lo: hLo, hi: hHi } = histData;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = "#0a0a0f"; ctx.fillRect(0, 0, W, H);
  const sorted = [...hist].sort((a, b) => b - a);
  const maxVal = sorted[Math.floor(sorted.length * 0.005)] || 1;
  const barW = W / hist.length;
  ctx.fillStyle = "#8ab4f8";
  for (let i = 0; i < hist.length; i++) {
    const h = Math.min(1, hist[i] / maxVal) * (H - 20);
    ctx.fillRect(i * barW, H - 10 - h, Math.max(1, barW - 0.5), h);
  }
  const { lo, hi } = stretchParams;
  const range = hHi - hLo || 1;
  const loX = ((Array.isArray(lo) ? lo[0] : lo) - hLo) / range * W;
  const hiX = ((Array.isArray(hi) ? hi[0] : hi) - hLo) / range * W;
  ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ff6b6b"; ctx.beginPath(); ctx.moveTo(loX, 0); ctx.lineTo(loX, H); ctx.stroke();
  ctx.strokeStyle = "#51cf66"; ctx.beginPath(); ctx.moveTo(hiX, 0); ctx.lineTo(hiX, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#666"; ctx.font = "10px monospace";
  ctx.textAlign = "left"; ctx.fillText(hLo.toExponential(2), 4, H - 1);
  ctx.textAlign = "right"; ctx.fillText(hHi.toExponential(2), W - 4, H - 1);
  ctx.textAlign = "left";
}
