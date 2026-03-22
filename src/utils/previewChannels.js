// ─── Generate low-resolution preview channels for fast stretch preview ──────
// Downsamples each channel using block averaging. Used during slider drag
// for real-time preview; full-res render happens on slider release.

export function generatePreviewChannels(imageData) {
  const { width, height, depth, channels, bitpix } = imageData;

  // Choose downscale factor based on image size
  const maxDim = Math.max(width, height);
  let factor;
  if (maxDim > 2000) factor = 4;
  else if (maxDim > 1000) factor = 2;
  else return null; // no downsampling needed

  const pw = Math.floor(width / factor);
  const ph = Math.floor(height / factor);
  const previewChannels = [];

  for (let c = 0; c < depth; c++) {
    const src = channels[c];
    const dst = new Float32Array(pw * ph);
    const area = factor * factor;
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        let sum = 0;
        const sy0 = py * factor;
        const sx0 = px * factor;
        for (let dy = 0; dy < factor; dy++) {
          const rowOff = (sy0 + dy) * width + sx0;
          for (let dx = 0; dx < factor; dx++) {
            sum += src[rowOff + dx];
          }
        }
        dst[py * pw + px] = sum / area;
      }
    }
    previewChannels.push(dst);
  }

  return { width: pw, height: ph, depth, channels: previewChannels, bitpix };
}
