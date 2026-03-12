import { stretchPixel } from "./stretch.js";

// ─── Export Functions ─────────────────────────────────────────────────
export function exportPNG(canvas, fileName) {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.(fits|fit|fts)$/i, "") + "_stretched.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function exportTIFF(canvas, imageData, stretchParams, colorMap) {
  const { width, height, depth, channels } = imageData;
  const { lo, hi, midtone } = stretchParams;
  const isRGB = depth >= 3;
  const samplesPerPixel = isRGB ? 3 : 1;
  const pixelCount = width * height;
  const stripBytes = pixelCount * samplesPerPixel * 2;

  const pixelData = new Uint16Array(pixelCount * samplesPerPixel);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (height - 1 - y) * width + x;
      const di = (y * width + x) * samplesPerPixel;
      if (isRGB) {
        for (let c = 0; c < 3; c++) {
          const lc = Array.isArray(lo) ? lo[c] : lo;
          const hc = Array.isArray(hi) ? hi[c] : hi;
          const mc = Array.isArray(midtone) ? midtone[c] : midtone;
          pixelData[di + c] = Math.round(stretchPixel(channels[c][si], lc, hc, mc) * 65535);
        }
      } else {
        const val = stretchPixel(channels[0][si], lo, hi, midtone);
        if (colorMap === "gray") {
          pixelData[di] = Math.round(val * 65535);
        }
      }
    }
  }

  const ifdEntryCount = 12;
  const headerSize = 8;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const bitsOffset = headerSize + ifdSize;
  const bitsPerSampleSize = samplesPerPixel * 2;
  const stripOffset = bitsOffset + bitsPerSampleSize;
  const totalSize = stripOffset + stripBytes;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, headerSize, true);

  let off = headerSize;
  view.setUint16(off, ifdEntryCount, true); off += 2;

  const writeEntry = (tag, type, count, value) => {
    view.setUint16(off, tag, true); off += 2;
    view.setUint16(off, type, true); off += 2;
    view.setUint32(off, count, true); off += 4;
    if (type === 3 && count === 1) { view.setUint16(off, value, true); off += 4; }
    else { view.setUint32(off, value, true); off += 4; }
  };

  writeEntry(256, 3, 1, width);
  writeEntry(257, 3, 1, height);
  writeEntry(258, 3, samplesPerPixel, samplesPerPixel === 1 ? 16 : bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, isRGB ? 2 : 1);
  writeEntry(273, 4, 1, stripOffset);
  writeEntry(277, 3, 1, samplesPerPixel);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, stripBytes);
  writeEntry(282, 5, 1, 0);
  writeEntry(283, 5, 1, 0);
  writeEntry(296, 3, 1, 1);

  view.setUint32(off, 0, true);

  if (samplesPerPixel > 1) {
    for (let i = 0; i < samplesPerPixel; i++) {
      view.setUint16(bitsOffset + i * 2, 16, true);
    }
  }

  for (let i = 0; i < pixelData.length; i++) {
    view.setUint16(stripOffset + i * 2, pixelData[i], true);
  }

  const blob = new Blob([buf], { type: "image/tiff" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export_16bit.tiff";
  a.click();
  URL.revokeObjectURL(url);
}
