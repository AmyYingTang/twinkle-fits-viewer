// ─── WCS (World Coordinate System) ───────────────────────────────────
export function parseWCS(header) {
  const crval1 = header.CRVAL1;
  const crval2 = header.CRVAL2;
  const crpix1 = header.CRPIX1;
  const crpix2 = header.CRPIX2;

  if (crval1 == null || crval2 == null || crpix1 == null || crpix2 == null) return null;

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

  const det = cd11 * cd22 - cd12 * cd21;
  if (Math.abs(det) < 1e-20) return null;

  const ctype1 = (header.CTYPE1 || "").toString();
  const ctype2 = (header.CTYPE2 || "").toString();
  const isTAN = ctype1.includes("TAN") || ctype2.includes("TAN");

  return { crval1, crval2, crpix1, crpix2, cd11, cd12, cd21, cd22, det, isTAN, ctype1, ctype2 };
}

export function pixelToWorld(wcs, px, py) {
  const dx = (px + 1) - wcs.crpix1;
  const dy = (py + 1) - wcs.crpix2;
  const xi = wcs.cd11 * dx + wcs.cd12 * dy;
  const eta = wcs.cd21 * dx + wcs.cd22 * dy;

  if (wcs.isTAN) {
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
    let raDeg = wcs.crval1 + xi / Math.cos(wcs.crval2 * Math.PI / 180);
    const decDeg = wcs.crval2 + eta;
    if (raDeg < 0) raDeg += 360;
    if (raDeg >= 360) raDeg -= 360;
    return { ra: raDeg, dec: decDeg };
  }
}

export function formatRA(raDeg) {
  const h = raDeg / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}h ${String(mm).padStart(2, "0")}m ${ss.toFixed(2).padStart(5, "0")}s`;
}

export function formatDec(decDeg) {
  const sign = decDeg < 0 ? "-" : "+";
  const abs = Math.abs(decDeg);
  const dd = Math.floor(abs);
  const mm = Math.floor((abs - dd) * 60);
  const ss = ((abs - dd) * 60 - mm) * 60;
  return `${sign}${String(dd).padStart(2, "0")}° ${String(mm).padStart(2, "0")}' ${ss.toFixed(1).padStart(4, "0")}"`;
}
