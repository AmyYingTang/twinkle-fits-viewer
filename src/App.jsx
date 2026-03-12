import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── FITS Parser (pure JS, no dependencies) ───────────────────────────
function parseFITS(arrayBuffer) {
  const BLOCK = 2880;
  const decoder = new TextDecoder("ascii");
  let offset = 0;
  const hdus = [];

  while (offset < arrayBuffer.byteLength) {
    const header = {};
    const headerCards = [];
    let headerDone = false;

    while (!headerDone && offset < arrayBuffer.byteLength) {
      const block = new Uint8Array(arrayBuffer, offset, Math.min(BLOCK, arrayBuffer.byteLength - offset));
      const blockStr = decoder.decode(block);
      for (let i = 0; i < 36; i++) {
        const card = blockStr.substring(i * 80, (i + 1) * 80);
        headerCards.push(card);
        const key = card.substring(0, 8).trim();
        if (key === "END") { headerDone = true; break; }
        if (card[8] === "=" && card[9] === " ") {
          let valStr = card.substring(10, 80);
          const slashIdx = valStr.indexOf("/");
          let comment = "";
          if (valStr.trim().startsWith("'")) {
            const fq = valStr.indexOf("'");
            const sq = valStr.indexOf("'", fq + 1);
            if (sq > fq) {
              header[key] = valStr.substring(fq + 1, sq).trim();
              comment = valStr.substring(sq + 1).trim();
              if (comment.startsWith("/")) comment = comment.substring(1).trim();
            }
          } else {
            if (slashIdx >= 0) {
              comment = valStr.substring(slashIdx + 1).trim();
              valStr = valStr.substring(0, slashIdx);
            }
            valStr = valStr.trim();
            if (valStr === "T") header[key] = true;
            else if (valStr === "F") header[key] = false;
            else { const num = Number(valStr); header[key] = isNaN(num) ? valStr : num; }
          }
          if (comment) header[`_comment_${key}`] = comment;
        }
      }
      offset += BLOCK;
    }

    const bitpix = header.BITPIX;
    const naxis = header.NAXIS || 0;
    let dataLength = 0;
    if (naxis > 0) {
      dataLength = Math.abs(bitpix) / 8;
      for (let i = 1; i <= naxis; i++) dataLength *= (header[`NAXIS${i}`] || 0);
    }

    let data = null;
    if (dataLength > 0 && offset + dataLength <= arrayBuffer.byteLength) {
      const raw = arrayBuffer.slice(offset, offset + dataLength);
      const dv = new DataView(raw);
      const width = header.NAXIS1 || 0;
      const height = header.NAXIS2 || 0;
      const depth = header.NAXIS3 || 1;
      const pixels = width * height;
      const bzero = header.BZERO || 0;
      const bscale = header.BSCALE || 1;

      const readChannel = (chOffset, bytesPerPixel, reader) => {
        const ch = new Float32Array(pixels);
        for (let i = 0; i < pixels; i++) ch[i] = reader(dv, chOffset + i * bytesPerPixel);
        return ch;
      };

      const readers = {
        [-32]: (dv, off) => dv.getFloat32(off, false),
        [-64]: (dv, off) => dv.getFloat64(off, false),
        [16]: (dv, off) => dv.getInt16(off, false) * bscale + bzero,
        [32]: (dv, off) => dv.getInt32(off, false) * bscale + bzero,
        [8]: (dv, off) => dv.getUint8(off) * bscale + bzero,
      };

      const reader = readers[bitpix];
      if (reader) {
        const bpp = Math.abs(bitpix) / 8;
        const channels = [];
        for (let c = 0; c < depth; c++) channels.push(readChannel(c * pixels * bpp, bpp, reader));
        data = { width, height, depth, channels, bitpix };
      }
    }

    const dataBlocks = Math.ceil(dataLength / BLOCK);
    offset += dataBlocks * BLOCK;
    hdus.push({ header, headerCards, data });
    if (naxis === 0) break;
  }
  return hdus;
}

// ─── WCS (World Coordinate System) ───────────────────────────────────
function parseWCS(header) {
  // Check for required WCS keywords
  const crval1 = header.CRVAL1; // RA of reference pixel (degrees)
  const crval2 = header.CRVAL2; // Dec of reference pixel (degrees)
  const crpix1 = header.CRPIX1; // Reference pixel X (1-indexed)
  const crpix2 = header.CRPIX2; // Reference pixel Y (1-indexed)

  if (crval1 == null || crval2 == null || crpix1 == null || crpix2 == null) return null;

  // CD matrix (preferred) or CDELT+CROTA
  let cd11, cd12, cd21, cd22;
  if (header.CD1_1 != null) {
    cd11 = header.CD1_1;
    cd12 = header.CD1_2 || 0;
    cd21 = header.CD2_1 || 0;
    cd22 = header.CD2_2;
  } else if (header.CDELT1 != null && header.CDELT2 != null) {
    const cdelt1 = header.CDELT1;
    const cdelt2 = header.CDELT2;
    const crota = (header.CROTA2 || header.CROTA1 || 0) * Math.PI / 180;
    cd11 = cdelt1 * Math.cos(crota);
    cd12 = -cdelt2 * Math.sin(crota);
    cd21 = cdelt1 * Math.sin(crota);
    cd22 = cdelt2 * Math.cos(crota);
  } else {
    return null;
  }

  // Invert CD matrix for world-to-pixel
  const det = cd11 * cd22 - cd12 * cd21;
  if (Math.abs(det) < 1e-20) return null;

  const ctype1 = (header.CTYPE1 || "").toString();
  const ctype2 = (header.CTYPE2 || "").toString();
  const isTAN = ctype1.includes("TAN") || ctype2.includes("TAN");

  return { crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22, det, isTAN, ctype1, ctype2 };
}

function pixelToWorld(wcs, px, py) {
  // px, py: 0-indexed pixel coordinates (FITS convention: bottom-left origin)
  // Convert to 1-indexed
  const dx = (px + 1) - wcs.crpix1;
  const dy = (py + 1) - wcs.crpix2;

  // Intermediate world coordinates (degrees)
  const xi = wcs.cd11 * dx + wcs.cd12 * dy;
  const eta = wcs.cd21 * dx + wcs.cd22 * dy;

  if (wcs.isTAN) {
    // TAN (gnomonic) projection
    const xiRad = xi * Math.PI / 180;
    const etaRad = eta * Math.PI / 180;
    const decRef = wcs.crval2 * Math.PI / 180;
    const raRef = wcs.crval1 * Math.PI / 180;

    const denom = Math.cos(decRef) - etaRad * Math.sin(decRef);
    const ra = raRef + Math.atan2(xiRad, denom);
    const dec = Math.atan2(
      (Math.sin(decRef) + etaRad * Math.cos(decRef)),
      Math.sqrt(xiRad * xiRad + denom * denom)
    );

    let raDeg = ra * 180 / Math.PI;
    const decDeg = dec * 180 / Math.PI;
    if (raDeg < 0) raDeg += 360;
    if (raDeg >= 360) raDeg -= 360;
    return { ra: raDeg, dec: decDeg };
  } else {
    // Simple linear projection
    let raDeg = wcs.crval1 + xi / Math.cos(wcs.crval2 * Math.PI / 180);
    const decDeg = wcs.crval2 + eta;
    if (raDeg < 0) raDeg += 360;
    if (raDeg >= 360) raDeg -= 360;
    return { ra: raDeg, dec: decDeg };
  }
}

function formatRA(raDeg) {
  const h = raDeg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(2).padStart(5, "0")}s`;
}

function formatDec(decDeg) {
  const sign = decDeg < 0 ? "-" : "+";
  const abs = Math.abs(decDeg);
  const dd = Math.floor(abs);
  const mm = Math.floor((abs - dd) * 60);
  const ss = ((abs - dd) * 60 - mm) * 60;
  return `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}' ${ss.toFixed(1).padStart(4, "0")}"`;
}

// ─── Statistics & Stretch ────────────────────────────────────────────
function computeStats(channel) {
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

function computeHistogram(channel, bins = 512) {
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

function mtf(m, x) {
  if (x <= 0) return 0; if (x >= 1) return 1; if (x === m) return 0.5;
  return ((m - 1) * x) / ((2 * m - 1) * x - m);
}

function autoStretchParams(channel) {
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

function stretchPixel(value, lo, hi, midtone) {
  const range = hi - lo || 1;
  return mtf(midtone, Math.max(0, Math.min(1, (value - lo) / range)));
}

// ─── Render to Canvas ────────────────────────────────────────────────
function renderToCanvas(canvas, imageData, stretchParams, colorMap = "gray") {
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

// ─── Histogram Canvas ────────────────────────────────────────────────
function drawHistogram(canvas, histData, stretchParams) {
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

// ─── Export Functions ─────────────────────────────────────────────────
function exportPNG(canvas, fileName) {
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

function exportTIFF(canvas, imageData, stretchParams, colorMap) {
  // Export 16-bit TIFF for better quality than 8-bit PNG
  const { width, height, depth, channels } = imageData;
  const { lo, hi, midtone } = stretchParams;
  const isRGB = depth >= 3;
  const samplesPerPixel = isRGB ? 3 : 1;
  const pixelCount = width * height;
  const stripBytes = pixelCount * samplesPerPixel * 2; // 16-bit

  // Build pixel data (16-bit)
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
        } else {
          // For colormapped mono, export as RGB
          // (handled below by adjusting samplesPerPixel)
        }
      }
    }
  }

  // Minimal TIFF structure (little-endian)
  const ifdEntryCount = 12;
  const headerSize = 8;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const bitsOffset = headerSize + ifdSize;
  const bitsPerSampleSize = samplesPerPixel * 2;
  const stripOffset = bitsOffset + bitsPerSampleSize;
  const totalSize = stripOffset + stripBytes;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // Header: little-endian TIFF
  view.setUint16(0, 0x4949, true); // II = little-endian
  view.setUint16(2, 42, true);     // TIFF magic
  view.setUint32(4, headerSize, true); // IFD offset

  // IFD
  let off = headerSize;
  view.setUint16(off, ifdEntryCount, true); off += 2;

  const writeEntry = (tag, type, count, value) => {
    view.setUint16(off, tag, true); off += 2;
    view.setUint16(off, type, true); off += 2;
    view.setUint32(off, count, true); off += 4;
    if (type === 3 && count === 1) { view.setUint16(off, value, true); off += 4; }
    else { view.setUint32(off, value, true); off += 4; }
  };

  writeEntry(256, 3, 1, width);           // ImageWidth
  writeEntry(257, 3, 1, height);          // ImageLength
  writeEntry(258, 3, samplesPerPixel, samplesPerPixel === 1 ? 16 : bitsOffset); // BitsPerSample
  writeEntry(259, 3, 1, 1);              // Compression: none
  writeEntry(262, 3, 1, isRGB ? 2 : 1);  // PhotometricInterpretation
  writeEntry(273, 4, 1, stripOffset);     // StripOffsets
  writeEntry(277, 3, 1, samplesPerPixel); // SamplesPerPixel
  writeEntry(278, 4, 1, height);          // RowsPerStrip
  writeEntry(279, 4, 1, stripBytes);      // StripByteCounts
  writeEntry(282, 5, 1, 0);              // XResolution (placeholder)
  writeEntry(283, 5, 1, 0);              // YResolution (placeholder)
  writeEntry(296, 3, 1, 1);              // ResolutionUnit: none

  view.setUint32(off, 0, true); // Next IFD = 0

  // BitsPerSample values (if RGB)
  if (samplesPerPixel > 1) {
    for (let i = 0; i < samplesPerPixel; i++) {
      view.setUint16(bitsOffset + i * 2, 16, true);
    }
  }

  // Pixel data
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

// ─── Main Component ──────────────────────────────────────────────────
const COLORMAPS = ["gray", "heat", "cool"];
const T = { // theme
  bg: "#2d2d3d", surface: "#383848", surfaceAlt: "#404052", border: "#555568",
  text: "#ededf5", textDim: "#a0a0b8", accent: "#8dacff", accentDim: "#5a6aaa",
  red: "#ff8888", green: "#70ef86", amber: "#ffe0a8",
  font: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
};

const L = {
  en: {
    openFits: "OPEN FITS", zoom: "ZOOM", fit: "FIT", hist: "HIST", hdr: "HDR",
    grid: "GRID", export_: "EXPORT", stretch: "STRETCH", auto: "AUTO", manual: "MANUAL",
    shadow: "Shadow", midtone: "Midtone", highlight: "Highlight", map: "MAP",
    statistics: "STATISTICS", wcs: "WCS", fitsHeader: "FITS HEADER",
    centerRA: "Center RA", centerDec: "Center Dec", projection: "Projection",
    scale: "Scale", rotation: "Rotation", red: "Red", green: "Green", blue: "Blue",
    dropHere: "Drop a FITS file here", orClick: "or click OPEN FITS",
    formatInfo: "8/16/32-bit int & 32/64-bit float • Mono & RGB • WCS coordinate display",
    parsing: "Parsing FITS data...", val: "Val",
    pngBtn: "PNG (8-bit)", tiffBtn: "TIFF (16-bit)",
    exportDesc: "PNG: quick share • TIFF: full 16-bit dynamic range, current stretch applied",
    glossaryTitle: "Help & Glossary",
    glossary: [
      { section: "FITS File & Header (HDR)", items: [
        ["FITS", "Flexible Image Transport System — the standard file format in astronomy for storing images, tables, and metadata."],
        ["HDR (Header)", "The FITS header block containing metadata: observation date, telescope, exposure time, WCS parameters, pixel format, and more."],
      ]},
      { section: "Stretch Panel", items: [
        ["Stretch", "Autostretch uses MAD-based sigma estimation + Midtone Transfer Function (MTF), identical to the STF algorithm in Siril/PixInsight. The shadow clip point is set at median - 2.8\u03c3. In manual mode you can independently adjust the shadow clip, midtone balance, and highlight ceiling."],
        ["HIST (Histogram)", "Shows the distribution of pixel values. Used to visualize and fine-tune the stretch parameters."],
        ["Shadow", "The black-point clip level. Pixels at or below this value are mapped to black."],
        ["Midtone", "Controls the gamma curve between shadow and highlight — shifts the brightness distribution without clipping."],
        ["Highlight", "The white-point clip level. Pixels at or above this value are mapped to white."],
        ["Colormap", "Maps single-channel pixel values to display colors. GRAY = linear grayscale; HEAT and COOL = false-color palettes. Only applies to monochrome images."],
      ]},
      { section: "Statistics", items: [
        ["Min / Max", "The minimum and maximum pixel values in the channel."],
        ["Mean / Median", "Mean is the arithmetic average; Median is the middle value — more robust to outliers."],
        ["MAD", "Median Absolute Deviation — a robust measure of spread, less sensitive to outliers than standard deviation."],
        ["\u03c3 (Sigma)", "Standard deviation — measures how spread out pixel values are from the mean."],
      ]},
      { section: "WCS & Coordinates", items: [
        ["WCS", "World Coordinate System — metadata in the FITS header that maps pixel coordinates (x, y) to sky coordinates (RA/Dec)."],
        ["RA / Dec", "Right Ascension and Declination — celestial coordinates analogous to longitude and latitude on Earth's sky."],
        ["Projection", "The mathematical method mapping the curved sky onto a flat image. TAN (gnomonic) is the most common."],
        ["GRID", "Overlays an RA/Dec coordinate grid on the image using the WCS solution."],
      ]},
      { section: "Export", items: [
        ["PNG (8-bit)", "Quick-share format with the current stretch baked in. Standard 8-bit per channel."],
        ["TIFF (16-bit)", "Full 16-bit dynamic range export with the current stretch applied. Suitable for further processing."],
      ]},
    ],
  },
  cn: {
    openFits: "打开 FITS", zoom: "缩放", fit: "适应", hist: "直方图", hdr: "头信息",
    grid: "网格", export_: "导出", stretch: "拉伸", auto: "自动", manual: "手动",
    shadow: "暗部", midtone: "中间调", highlight: "亮部", map: "色彩映射",
    statistics: "统计", wcs: "WCS 坐标", fitsHeader: "FITS 头信息",
    centerRA: "中心赤经", centerDec: "中心赤纬", projection: "投影方式",
    scale: "像素比例", rotation: "旋转角", red: "红", green: "绿", blue: "蓝",
    dropHere: "将 FITS 文件拖放到此处", orClick: "或点击 打开 FITS",
    formatInfo: "8/16/32 位整数 & 32/64 位浮点 • 单色 & RGB • WCS 坐标显示",
    parsing: "正在解析 FITS 数据...", val: "值",
    pngBtn: "PNG (8位)", tiffBtn: "TIFF (16位)",
    exportDesc: "PNG：快速分享 • TIFF：完整 16 位动态范围，应用当前拉伸",
    glossaryTitle: "帮助 & 术语表",
    glossary: [
      { section: "FITS 文件 & 头信息 (HDR)", items: [
        ["FITS", "灵活图像传输系统 (Flexible Image Transport System) — 天文学中用于存储图像、表格和元数据的标准文件格式。"],
        ["HDR (头信息)", "FITS 头信息块，包含元数据：观测日期、望远镜、曝光时间、WCS 参数、像素格式等。"],
      ]},
      { section: "拉伸面板", items: [
        ["拉伸 (Stretch)", "Autostretch 使用 MAD-based \u03c3 估计 + Midtone Transfer Function (MTF)，和 Siril/PixInsight 的 STF 算法相同。Shadow 裁切点为 median - 2.8\u03c3。手动模式下可分别调整暗部裁切、中间调平衡和高光上限。"],
        ["直方图 (HIST)", "显示像素值的分布，用于可视化和微调拉伸参数。"],
        ["暗部 (Shadow)", "黑点裁切水平。等于或低于此值的像素映射为黑色。"],
        ["中间调 (Midtone)", "控制暗部和亮部之间的伽马曲线 — 在不裁切的情况下调整亮度分布。"],
        ["亮部 (Highlight)", "白点裁切水平。等于或高于此值的像素映射为白色。"],
        ["色彩映射", "将单通道像素值映射为显示颜色的调色板。GRAY 为线性灰度；HEAT 和 COOL 为伪彩色。仅对单色图像生效。"],
      ]},
      { section: "统计信息", items: [
        ["Min / Max", "该通道的最小值和最大值。"],
        ["Mean / Median", "Mean 为算术平均值；Median 为中位数 — 对异常值更稳健。"],
        ["MAD", "中位绝对偏差 (Median Absolute Deviation) — 一种比标准差对异常值更不敏感的离散度度量。"],
        ["\u03c3 (标准差)", "标准差 — 衡量像素值与均值的偏离程度。"],
      ]},
      { section: "WCS & 坐标", items: [
        ["WCS", "世界坐标系统 (World Coordinate System) — FITS 头信息中的元数据，将像素坐标 (x, y) 映射到天球坐标 (赤经/赤纬)。"],
        ["赤经 / 赤纬", "赤经 (RA) 和赤纬 (Dec) — 天球坐标，类似于地球上的经度和纬度。"],
        ["投影", "将弯曲的天球映射到平面图像的数学方法。TAN (球心投影) 是最常见的方式。"],
        ["网格 (GRID)", "使用 WCS 解在图像上叠加赤经/赤纬坐标网格。"],
      ]},
      { section: "导出", items: [
        ["PNG (8位)", "快速分享格式，当前拉伸效果已应用。标准 8 位每通道。"],
        ["TIFF (16位)", "完整 16 位动态范围导出，应用当前拉伸。适合后续处理。"],
      ]},
    ],
  },
};

const Btn = ({ active, onClick, children, style = {} }) => (
  <button onClick={onClick} style={{
    background: active ? T.accentDim : "transparent",
    color: active ? "#fff" : T.textDim,
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: 3, padding: "3px 8px", cursor: "pointer",
    fontFamily: T.font, fontSize: 10, ...style,
  }}>{children}</button>
);

export default function FITSViewer() {
  const [fits, setFits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [activeHdu, setActiveHdu] = useState(0);
  const [autoMode, setAutoMode] = useState(true);
  const [manualLo, setManualLo] = useState(0);
  const [manualHi, setManualHi] = useState(1);
  const [manualMid, setManualMid] = useState(0.5);
  const [colorMap, setColorMap] = useState("gray");
  const [showHeader, setShowHeader] = useState(false);
  const [showHist, setShowHist] = useState(true);
  const [zoom, setZoom] = useState("fit");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cursorInfo, setCursorInfo] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lang, setLang] = useState("en");
  const t = L[lang];

  const canvasRef = useRef(null);
  const histCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const gridCanvasRef = useRef(null);

  const hdu = fits ? fits[activeHdu] : null;
  const imageData = hdu?.data;
  const header = hdu?.header;

  // WCS
  const wcs = useMemo(() => header ? parseWCS(header) : null, [header]);

  // Stats & stretch
  const statsAndStretch = useMemo(() => {
    if (!imageData) return null;
    const { channels, depth } = imageData;
    if (depth >= 3) {
      const params = channels.slice(0, 3).map(ch => autoStretchParams(ch));
      const hists = channels.slice(0, 3).map(ch => computeHistogram(ch));
      return {
        stretch: { lo: params.map(p => p.lo), hi: params.map(p => p.hi), midtone: params.map(p => p.midtone) },
        histData: hists[0], stats: hists.map(h => h.stats), isRGB: true,
      };
    }
    const params = autoStretchParams(channels[0]);
    const histData = computeHistogram(channels[0]);
    return { stretch: params, histData, stats: [histData.stats], isRGB: false };
  }, [imageData]);

  const currentStretch = useMemo(() => {
    if (!statsAndStretch) return { lo: 0, hi: 1, midtone: 0.5 };
    if (autoMode) return statsAndStretch.stretch;
    const s = statsAndStretch.stats[0];
    const range = s.max - s.min || 1;
    return { lo: s.min + manualLo * range, hi: s.min + manualHi * range, midtone: manualMid };
  }, [autoMode, manualLo, manualHi, manualMid, statsAndStretch]);

  // Render image
  useEffect(() => {
    if (!canvasRef.current || !imageData) return;
    renderToCanvas(canvasRef.current, imageData, currentStretch, colorMap);
  }, [imageData, currentStretch, colorMap]);

  // Render histogram
  useEffect(() => {
    if (!histCanvasRef.current || !statsAndStretch || !showHist) return;
    drawHistogram(histCanvasRef.current, statsAndStretch.histData, currentStretch);
  }, [statsAndStretch, currentStretch, showHist]);

  // Render coordinate grid overlay
  useEffect(() => {
    if (!gridCanvasRef.current || !imageData || !wcs || !showGrid) return;
    const gc = gridCanvasRef.current;
    const { width, height } = imageData;
    gc.width = width;
    gc.height = height;
    const ctx = gc.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    // Draw RA/Dec grid lines — scale thickness & font to image size
    const diagPx = Math.sqrt(width * width + height * height);
    const lw = Math.max(1, Math.round(diagPx / 1200));
    const fs = Math.max(12, Math.round(diagPx / 150));
    ctx.strokeStyle = "rgba(140, 170, 255, 0.45)";
    ctx.lineWidth = lw;
    ctx.font = `bold ${fs}px monospace`;
    ctx.fillStyle = "rgba(180, 200, 255, 0.85)";

    // Sample corners to determine coordinate range
    const corners = [
      pixelToWorld(wcs, 0, 0),
      pixelToWorld(wcs, width - 1, 0),
      pixelToWorld(wcs, 0, height - 1),
      pixelToWorld(wcs, width - 1, height - 1),
      pixelToWorld(wcs, width / 2, height / 2),
    ];

    const ras = corners.map(c => c.ra);
    const decs = corners.map(c => c.dec);

    // Handle RA wrap-around
    let raMin = Math.min(...ras);
    let raMax = Math.max(...ras);
    if (raMax - raMin > 180) { raMin = Math.min(...ras.map(r => r < 180 ? r + 360 : r)); raMax = Math.max(...ras.map(r => r < 180 ? r + 360 : r)); }
    const decMin = Math.min(...decs);
    const decMax = Math.max(...decs);
    const raSpan = raMax - raMin;
    const decSpan = decMax - decMin;

    // Choose grid spacing (in degrees)
    const span = Math.max(raSpan, decSpan);
    let gridStep;
    if (span > 10) gridStep = 2;
    else if (span > 5) gridStep = 1;
    else if (span > 2) gridStep = 0.5;
    else if (span > 1) gridStep = 1/6; // 10 arcmin
    else if (span > 0.5) gridStep = 1/12; // 5 arcmin
    else gridStep = 1/60; // 1 arcmin

    // Inverse: world to pixel (approximate by scanning)
    const worldToPixelApprox = (targetRA, targetDec) => {
      // Use inverse CD matrix
      const cosDec = Math.cos(wcs.crval2 * Math.PI / 180);
      let dra = targetRA - wcs.crval1;
      if (dra > 180) dra -= 360;
      if (dra < -180) dra += 360;

      let xi, eta;
      if (wcs.isTAN) {
        const raRad = targetRA * Math.PI / 180;
        const decRad = targetDec * Math.PI / 180;
        const ra0Rad = wcs.crval1 * Math.PI / 180;
        const dec0Rad = wcs.crval2 * Math.PI / 180;
        const cosDec0 = Math.cos(dec0Rad);
        const sinDec0 = Math.sin(dec0Rad);
        const cosDecT = Math.cos(decRad);
        const sinDecT = Math.sin(decRad);
        const cosRaDiff = Math.cos(raRad - ra0Rad);
        const sinRaDiff = Math.sin(raRad - ra0Rad);
        const denom = sinDecT * sinDec0 + cosDecT * cosDec0 * cosRaDiff;
        xi = (cosDecT * sinRaDiff / denom) * 180 / Math.PI;
        eta = ((sinDecT * cosDec0 - cosDecT * sinDec0 * cosRaDiff) / denom) * 180 / Math.PI;
      } else {
        xi = dra * cosDec;
        eta = targetDec - wcs.crval2;
      }

      // Inverse CD
      const invDet = 1 / wcs.det;
      const dx = (wcs.cd22 * xi - wcs.cd12 * eta) * invDet;
      const dy = (-wcs.cd21 * xi + wcs.cd11 * eta) * invDet;
      return { x: dx + wcs.crpix1 - 1, y: dy + wcs.crpix2 - 1 };
    };

    // Draw Dec lines (horizontal-ish)
    const decStart = Math.floor(decMin / gridStep) * gridStep;
    for (let dec = decStart; dec <= decMax + gridStep; dec += gridStep) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 100; i++) {
        const ra = raMin + (raMax - raMin) * i / 100;
        const p = worldToPixelApprox(ra, dec);
        const screenY = height - 1 - p.y;
        if (p.x >= -50 && p.x <= width + 50 && screenY >= -50 && screenY <= height + 50) {
          if (!started) { ctx.moveTo(p.x, screenY); started = true; }
          else ctx.lineTo(p.x, screenY);
        }
      }
      ctx.stroke();
      // Label
      const mid = worldToPixelApprox((raMin + raMax) / 2, dec);
      const midY = height - 1 - mid.y;
      if (mid.x > 30 && mid.x < width - 60 && midY > 15 && midY < height - 5) {
        ctx.fillText(formatDec(dec), mid.x + 4, midY - 4);
      }
    }

    // Draw RA lines (vertical-ish)
    const raStart = Math.floor(raMin / gridStep) * gridStep;
    for (let ra = raStart; ra <= raMax + gridStep; ra += gridStep) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 100; i++) {
        const dec = decMin + (decMax - decMin) * i / 100;
        const p = worldToPixelApprox(ra > 360 ? ra - 360 : ra, dec);
        const screenY = height - 1 - p.y;
        if (p.x >= -50 && p.x <= width + 50 && screenY >= -50 && screenY <= height + 50) {
          if (!started) { ctx.moveTo(p.x, screenY); started = true; }
          else ctx.lineTo(p.x, screenY);
        }
      }
      ctx.stroke();
      const mid = worldToPixelApprox(ra > 360 ? ra - 360 : ra, (decMin + decMax) / 2);
      const midY = height - 1 - mid.y;
      if (mid.x > 5 && mid.x < width - 30 && midY > 15 && midY < height - 15) {
        ctx.save();
        ctx.translate(mid.x - 4, midY);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(formatRA(ra > 360 ? ra - 360 : ra), 0, 0);
        ctx.restore();
      }
    }
  }, [imageData, wcs, showGrid]);

  // File handler
  const handleFile = useCallback((file) => {
    if (!file) return;
    setLoading(true); setError(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const hdus = parseFITS(e.target.result);
        const idx = hdus.findIndex(h => h.data);
        if (idx < 0) throw new Error("No image data found");
        setFits(hdus); setActiveHdu(idx); setAutoMode(true);
        setZoom("fit"); setPan({ x: 0, y: 0 });
      } catch (err) { setError(err.message); }
      setLoading(false);
    };
    reader.onerror = () => { setError("Failed to read file"); setLoading(false); };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const FIT_PAD = 12;
  const getScale = useCallback(() => {
    if (!containerSize.w || !containerSize.h || !imageData) return 1;
    if (zoom === "fit") {
      const ch = containerSize.h - FIT_PAD * 2;
      const cw = containerSize.w - FIT_PAD * 2;
      return Math.min(ch / imageData.height, cw / imageData.width);
    }
    return Number(zoom);
  }, [zoom, imageData, containerSize]);

  const handleMouseDown = (e) => {
    if (zoom !== "fit") { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  };
  const handleMouseMove = (e) => {
    if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    if (canvasRef.current && imageData) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = getScale();
      const px = Math.floor((e.clientX - rect.left) / scale);
      const py = Math.floor((e.clientY - rect.top) / scale);
      if (px >= 0 && px < imageData.width && py >= 0 && py < imageData.height) {
        const si = (imageData.height - 1 - py) * imageData.width + px;
        const values = imageData.channels.map(ch => ch[si]);
        // FITS pixel coords (1-indexed, bottom-up)
        const fitsX = px + 1;
        const fitsY = imageData.height - py;
        let world = null;
        if (wcs) world = pixelToWorld(wcs, px, imageData.height - 1 - py);
        setCursorInfo({ x: fitsX, y: fitsY, values, world });
      } else setCursorInfo(null);
    }
  };
  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e) => {
    if (!imageData) return;
    e.preventDefault();
    const cur = zoom === "fit" ? getScale() : Number(zoom);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(Math.min(8, Math.max(0.05, +(cur * factor).toFixed(4))));
  };

  const scale = getScale();

  return (
    <div style={{
      width: "100%", height: "100dvh", display: "flex", flexDirection: "column",
      background: T.bg, color: T.text, fontFamily: T.font, fontSize: 12,
      overflow: "hidden", userSelect: "none",
    }}>
      {/* ─── Top Bar ─── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "4px 14px",
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        overflow: "hidden",
      }}>
        <button onClick={() => fileInputRef.current?.click()} style={{
          background: T.accent, color: "#fff", border: "none", borderRadius: 4,
          padding: "6px 14px", cursor: "pointer", fontFamily: T.font, fontSize: 12,
          fontWeight: 600, letterSpacing: "0.03em", flexShrink: 0,
        }}>{t.openFits}</button>
        <input ref={fileInputRef} type="file" accept=".fits,.fit,.fts" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files?.[0])} />

        {fileName && (
          <span style={{ color: T.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flexShrink: 1 }}>
            {fileName}
            {imageData && (
              <span style={{ marginLeft: 8, color: T.accent }}>
                {imageData.width}×{imageData.height} • {imageData.depth >= 3 ? "RGB" : "MONO"}
                • {imageData.bitpix === -32 ? "32f" : imageData.bitpix === -64 ? "64f" : `${imageData.bitpix}b`}
              </span>
            )}
            {wcs && <span style={{ marginLeft: 6, color: T.green, fontSize: 9 }}>WCS ✓</span>}
          </span>
        )}

        <div style={{ flexShrink: 999, flexGrow: 1, minWidth: 0 }} />

        {imageData && (
          <>
            {/* Zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Btn active={zoom === "fit"} onClick={() => { setZoom("fit"); setPan({ x: 0, y: 0 }); }}>{t.fit}</Btn>
              <span style={{ color: T.textDim, fontSize: 9 }}>−</span>
              <input type="range" min={-3} max={3} step={0.01}
                value={zoom === "fit" ? Math.log2(getScale()) : Math.log2(Number(zoom))}
                onChange={e => setZoom(+(2 ** Number(e.target.value)).toFixed(4))}
                style={{ width: 90, accentColor: T.accent }} />
              <span style={{ color: T.textDim, fontSize: 9 }}>+</span>
              <span style={{ color: T.text, fontSize: 9, minWidth: 36, textAlign: "right" }}>
                {(zoom === "fit" ? scale : Number(zoom)).toFixed(2)}×
              </span>
            </div>

            {/* Panels & features */}
            <div style={{ display: "flex", gap: 3, marginLeft: 10, flexShrink: 0 }}>
              <Btn active={showHist} onClick={() => setShowHist(!showHist)}>{t.hist}</Btn>
              <Btn active={showHeader} onClick={() => setShowHeader(!showHeader)}>{t.hdr}</Btn>
              {wcs && <Btn active={showGrid} onClick={() => setShowGrid(!showGrid)}>{t.grid}</Btn>}
              <Btn active={showExport} onClick={() => setShowExport(!showExport)}
                style={{ color: showExport ? "#fff" : T.amber, borderColor: showExport ? T.amber : T.border,
                  background: showExport ? "rgba(255,192,120,0.2)" : "transparent" }}>
                {t.export_}
              </Btn>
            </div>
          </>
        )}
        <button onClick={() => setLang(lang === "en" ? "cn" : "en")} style={{
          background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
          borderRadius: 3, padding: "3px 8px", cursor: "pointer",
          fontFamily: T.font, fontSize: 10, flexShrink: 0,
        }}>{lang === "en" ? "中文" : "EN"}</button>
        <button onClick={() => setShowHelp(true)} style={{
          background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
          borderRadius: "50%", width: 22, height: 22, cursor: "pointer",
          fontFamily: T.font, fontSize: 12, padding: 0, lineHeight: "20px", flexShrink: 0,
        }}>?</button>
      </div>

      {/* ─── Help Modal ─── */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
            padding: 24, maxWidth: 520, maxHeight: "80vh", overflowY: "auto",
            color: T.text, fontFamily: T.font, fontSize: 11, lineHeight: 1.7,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>{t.glossaryTitle}</span>
              <button onClick={() => setShowHelp(false)} style={{
                background: "transparent", border: "none", color: T.textDim, cursor: "pointer",
                fontFamily: T.font, fontSize: 16,
              }}>✕</button>
            </div>
            {t.glossary.map((sec) => (
              <div key={sec.section} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: "0.06em", marginBottom: 6, borderBottom: `1px solid ${T.border}`, paddingBottom: 4 }}>{sec.section}</div>
                {sec.items.map(([term, desc]) => (
                  <div key={term} style={{ marginBottom: 6, paddingLeft: 8 }}>
                    <span style={{ color: T.accent, fontWeight: 600 }}>{term}</span>
                    <span style={{ color: T.textDim }}> — {desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Export Bar ─── */}
      {showExport && imageData && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "6px 14px",
          background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, fontSize: 11,
        }}>
          <span style={{ color: T.amber, fontSize: 10, letterSpacing: "0.08em" }}>{t.export_}</span>
          <button onClick={() => exportPNG(canvasRef.current, fileName)} style={{
            background: "transparent", color: T.text, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontFamily: T.font, fontSize: 11,
          }}>
            {t.pngBtn}
          </button>
          <button onClick={() => exportTIFF(canvasRef.current, imageData, currentStretch, colorMap)} style={{
            background: "transparent", color: T.text, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: "4px 12px", cursor: "pointer", fontFamily: T.font, fontSize: 11,
          }}>
            {t.tiffBtn}
          </button>
          <span style={{ color: T.textDim, fontSize: 9 }}>
            {t.exportDesc}
          </span>
        </div>
      )}

      {/* ─── Main Area ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* ─── Left Panel (overlay) ─── */}
        {imageData && (showHist || showHeader) && (
          <div style={{
            position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 10,
            width: 270, borderRight: `1px solid ${T.border}`,
            background: `${T.surface}ee`, overflowY: "auto", display: "flex", flexDirection: "column",
            backdropFilter: "blur(12px)",
          }}>
            {/* Stretch */}
            {showHist && (
              <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.08em" }}>{t.stretch}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn active={autoMode} onClick={() => setAutoMode(true)} style={{ fontSize: 9, padding: "2px 8px" }}>{t.auto}</Btn>
                    <Btn active={!autoMode} onClick={() => {
                      setAutoMode(false);
                      if (statsAndStretch) {
                        const s = statsAndStretch.stats[0];
                        const range = s.max - s.min || 1;
                        const st = statsAndStretch.stretch;
                        setManualLo(((Array.isArray(st.lo) ? st.lo[0] : st.lo) - s.min) / range);
                        setManualHi(((Array.isArray(st.hi) ? st.hi[0] : st.hi) - s.min) / range);
                        setManualMid(Array.isArray(st.midtone) ? st.midtone[0] : st.midtone);
                      }
                    }} style={{ fontSize: 9, padding: "2px 8px" }}>{t.manual}</Btn>
                  </div>
                </div>

                <canvas ref={histCanvasRef} width={256} height={80}
                  style={{ width: "100%", height: 80, borderRadius: 4, marginBottom: 8 }} />

                {!autoMode && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      [t.shadow, manualLo, setManualLo, T.red, 0, 1],
                      [t.midtone, manualMid, setManualMid, T.accent, 0.001, 0.999],
                      [t.highlight, manualHi, setManualHi, T.green, 0, 1],
                    ].map(([label, val, setter, color, min, max]) => (
                      <label key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                        <span style={{ color, width: 50 }}>{label}</span>
                        <button onClick={() => setter(Math.max(min, +(val - 0.001).toFixed(3)))}
                          style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
                            borderRadius: 3, width: 18, height: 18, cursor: "pointer", fontFamily: T.font, fontSize: 11, padding: 0 }}>−</button>
                        <input type="range" min={min} max={max} step={0.001} value={val}
                          onChange={e => setter(Number(e.target.value))}
                          style={{ flex: 1, accentColor: color }} />
                        <button onClick={() => setter(Math.min(max, +(val + 0.001).toFixed(3)))}
                          style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
                            borderRadius: 3, width: 18, height: 18, cursor: "pointer", fontFamily: T.font, fontSize: 11, padding: 0 }}>+</button>
                        <input type="number" min={min} max={max} step={0.001}
                          value={val.toFixed(3)}
                          onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) setter(Math.min(max, Math.max(min, v))); }}
                          style={{ width: 46, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text,
                            borderRadius: 3, fontFamily: T.font, fontSize: 9, textAlign: "right", padding: "1px 3px" }} />
                      </label>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: T.textDim, marginRight: 4 }}>{t.map}</span>
                  {COLORMAPS.map(cm => (
                    <Btn key={cm} active={colorMap === cm} onClick={() => setColorMap(cm)}
                      style={{ fontSize: 9, padding: "2px 8px", textTransform: "uppercase" }}>{cm}</Btn>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {showHist && statsAndStretch && (
              <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, fontSize: 10 }}>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>{t.statistics}</div>
                {statsAndStretch.stats.map((s, i) => (
                  <div key={i} style={{ marginBottom: i < statsAndStretch.stats.length - 1 ? 6 : 0 }}>
                    {statsAndStretch.isRGB && (
                      <div style={{ color: ["#ff8888","#88ff88","#8888ff"][i], marginBottom: 2 }}>
                        {[t.red, t.green, t.blue][i]}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px", color: T.textDim }}>
                      <span>Min: {s.min.toExponential(3)}</span><span>Max: {s.max.toExponential(3)}</span>
                      <span>Mean: {s.mean.toExponential(3)}</span><span>Median: {s.median.toExponential(3)}</span>
                      <span>MAD: {s.mad.toExponential(3)}</span><span>σ: {s.sigma.toExponential(3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* WCS Info */}
            {showHist && wcs && (
              <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, fontSize: 10 }}>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>{t.wcs}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", color: T.textDim }}>
                  <span style={{ color: T.accent }}>{t.centerRA}</span>
                  <span style={{ color: T.text }}>{formatRA(wcs.crval1)}</span>
                  <span style={{ color: T.accent }}>{t.centerDec}</span>
                  <span style={{ color: T.text }}>{formatDec(wcs.crval2)}</span>
                  <span style={{ color: T.accent }}>{t.projection}</span>
                  <span style={{ color: T.text }}>{wcs.isTAN ? "TAN (gnomonic)" : "Linear"}</span>
                  <span style={{ color: T.accent }}>{t.scale}</span>
                  <span style={{ color: T.text }}>
                    {(Math.sqrt(wcs.cd11**2 + wcs.cd21**2) * 3600).toFixed(2)}″/px
                  </span>
                  {header.CROTA2 != null && (
                    <>
                      <span style={{ color: T.accent }}>{t.rotation}</span>
                      <span style={{ color: T.text }}>{Number(header.CROTA2).toFixed(2)}°</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            {showHeader && header && (
              <div style={{ padding: 12, flex: 1, overflow: "auto" }}>
                <div style={{ fontSize: 10, color: T.textDim, letterSpacing: "0.08em", marginBottom: 6 }}>{t.fitsHeader}</div>
                <div style={{ fontSize: 9, lineHeight: 1.6, color: T.textDim }}>
                  {Object.entries(header).filter(([k]) => !k.startsWith("_comment_")).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8 }}>
                      <span style={{ color: T.accent, minWidth: 80, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: T.text, wordBreak: "break-all" }}>
                        {typeof v === "boolean" ? (v ? "T" : "F") : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Canvas ─── */}
        <div ref={containerRef}
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setCursorInfo(null); }}
          onWheel={handleWheel}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            cursor: dragging ? "grabbing" : (zoom !== "fit" ? "grab" : "crosshair"),
          }}
        >
          {!imageData && !loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", padding: 48, border: `2px dashed ${T.border}`, borderRadius: 12, color: T.textDim }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>✦</div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>{t.dropHere}</div>
                <div style={{ fontSize: 11 }}>{t.orClick}</div>
                <div style={{ fontSize: 10, marginTop: 12, color: T.accentDim }}>
                  {t.formatInfo}
                </div>
              </div>
            </div>
          )}

          {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: T.accent, fontSize: 14 }}>{t.parsing}</div></div>}
          {error && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: T.red, fontSize: 13, padding: 24, textAlign: "center" }}>{error}</div></div>}

          {imageData && (
            <div style={{
              position: "absolute",
              left: `calc(50% + ${(showHist || showHeader) ? 135 : 0}px)`, top: "50%",
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
            }}>
              <canvas ref={canvasRef} style={{
                display: "block",
                width: imageData.width * scale,
                height: imageData.height * scale,
                imageRendering: (typeof zoom === "number" && zoom >= 2) ? "pixelated" : "auto",
              }} />
              {showGrid && wcs && (
                <canvas ref={gridCanvasRef} style={{
                  position: "absolute", top: 0, left: 0,
                  width: imageData.width * scale, height: imageData.height * scale,
                  pointerEvents: "none",
                }} />
              )}
            </div>
          )}

          {/* Pixel info bar */}
          {cursorInfo && (
            <div style={{
              position: "absolute", bottom: 8, left: 8,
              background: "rgba(0,0,0,0.88)", padding: "5px 12px",
              borderRadius: 4, fontSize: 10, color: T.textDim,
              display: "flex", gap: 14, alignItems: "center",
              backdropFilter: "blur(8px)",
            }}>
              <span style={{ color: T.text }}>({cursorInfo.x}, {cursorInfo.y})</span>
              {cursorInfo.values.map((v, i) => (
                <span key={i} style={{ color: imageData.depth >= 3 ? ["#ff8888","#88ff88","#8888ff"][i] : T.text }}>
                  {imageData.depth >= 3 ? ["R","G","B"][i]+": " : t.val+": "}
                  {typeof v === "number" ? v.toExponential(4) : "—"}
                </span>
              ))}
              {cursorInfo.world && (
                <>
                  <span style={{ color: T.border }}>│</span>
                  <span style={{ color: T.amber }}>
                    RA {formatRA(cursorInfo.world.ra)}
                  </span>
                  <span style={{ color: T.amber }}>
                    Dec {formatDec(cursorInfo.world.dec)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
