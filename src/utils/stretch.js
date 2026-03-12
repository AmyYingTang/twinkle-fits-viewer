// ─── Statistics & Stretch ────────────────────────────────────────────
export function computeStats(channel) {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  for (let i = 0; i < channel.length; i++) {
    const v = channel[i];
    if (!isFinite(v)) continue;
    if (v < min) min = v; if (v > max) max = v;
    sum += v; count++;
  }
  const mean = sum / count;
  const sampleSize = Math.min(100000, channel.length);
  const step = Math.max(1, Math.floor(channel.length / sampleSize));
  const samples = [];
  for (let i = 0; i < channel.length; i += step) if (isFinite(channel[i])) samples.push(channel[i]);
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const absDevs = samples.map(v => Math.abs(v - median));
  absDevs.sort((a, b) => a - b);
  const mad = absDevs[Math.floor(absDevs.length / 2)];
  const sigma = mad * 1.4826;
  return { min, max, mean, median, mad, sigma, count };
}

export function computeHistogram(channel, bins = 512) {
  const stats = computeStats(channel);
  const lo = Math.max(stats.min, stats.median - 5 * stats.sigma);
  const hi = Math.min(stats.max, stats.median + 5 * stats.sigma);
  const range = hi - lo || 1;
  const hist = new Uint32Array(bins);
  for (let i = 0; i < channel.length; i++) {
    const v = channel[i];
    if (!isFinite(v)) continue;
    hist[Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / range) * bins)))]++;
  }
  return { hist, lo, hi, stats };
}

export function mtf(m, x) {
  if (x <= 0) return 0; if (x >= 1) return 1; if (x === m) return 0.5;
  return ((m - 1) * x) / ((2 * m - 1) * x - m);
}

export function autoStretchParams(channel) {
  const stats = computeStats(channel);
  const lo = Math.max(stats.min, stats.median - 2.8 * stats.sigma);
  const hi = Math.min(stats.max, stats.median + 10 * stats.sigma);
  const range = hi - lo || 1;
  const normMedian = (stats.median - lo) / range;
  const target = 0.25;
  const midtone = normMedian === 0 ? 0.5 :
    target * normMedian / (target * normMedian - normMedian + 1 - target) || 0.5;
  return { lo, hi, midtone: Math.max(0.001, Math.min(0.999, midtone)) };
}

export function stretchPixel(value, lo, hi, midtone) {
  const range = hi - lo || 1;
  return mtf(midtone, Math.max(0, Math.min(1, (value - lo) / range)));
}
