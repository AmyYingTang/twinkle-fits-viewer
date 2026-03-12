// ─── FITS Parser (pure JS, no dependencies) ───────────────────────────
export function parseFITS(arrayBuffer) {
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
