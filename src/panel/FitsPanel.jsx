import { useState, useRef, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { parseFITS } from "../utils/fitsParser.js";
import { parseWCS, pixelToWorld, formatRA, formatDec } from "../utils/wcs.js";
import { computeStats, computeHistogram, autoStretchParams } from "../utils/stretch.js";
import { renderToCanvas, COLORMAPS } from "../utils/renderCanvas.js";
import { drawHistogram } from "../utils/drawHistogram.js";
import { exportPNG, exportTIFF } from "../utils/exportFits.js";
import { T } from "../theme.js";
import { L } from "../i18n.js";
import { Btn } from "../components/Btn.jsx";
import { useWorkspace } from "../workspace/WorkspaceContext.js";

const FitsPanel = forwardRef(function FitsPanel({ id, lang = "en" }, ref) {
  const t = L[lang];
  const workspace = useWorkspace();
  const isMobile = workspace?.isMobile;

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
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);       // 0, 90, 180, 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [infoPanelPos, setInfoPanelPos] = useState({ x: 0, y: 0 });
  const [infoDragging, setInfoDragging] = useState(false);
  const [longPressInfo, setLongPressInfo] = useState(null); // mobile long-press pixel info
  const infoDragStart = useRef({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const histCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const touchStateRef = useRef({ initialDist: null, initialZoom: null, lastPanPos: null });
  const longPressTimerRef = useRef(null);

  const hdu = fits ? fits[activeHdu] : null;
  const imageData = hdu?.data;
  const header = hdu?.header;

  const wcs = useMemo(() => header ? parseWCS(header) : null, [header]);

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

  // Expose internals for InfoPanel via ref
  useImperativeHandle(ref, () => ({
    getImageData: () => imageData,
    getHeader: () => header,
    getWcs: () => wcs,
    getStatsAndStretch: () => statsAndStretch,
    getCurrentStretch: () => currentStretch,
    getColorMap: () => colorMap,
    getFileName: () => fileName,
    getCanvasRef: () => canvasRef.current,
    getShowHist: () => showHist,
    getShowHeader: () => showHeader,
    getShowGrid: () => showGrid,
    getShowExport: () => showExport,
    getAutoMode: () => autoMode,
    getManualLo: () => manualLo,
    getManualHi: () => manualHi,
    getManualMid: () => manualMid,
    setAutoMode, setManualLo, setManualHi, setManualMid,
    setColorMap, setShowHeader, setShowHist, setShowGrid, setShowExport,
  }));

  // Render image (containerSize dep ensures re-draw when panel becomes visible)
  useEffect(() => {
    if (!canvasRef.current || !imageData || !containerSize.w) return;
    renderToCanvas(canvasRef.current, imageData, currentStretch, colorMap);
  }, [imageData, currentStretch, colorMap, containerSize.w]);

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

    const diagPx = Math.sqrt(width * width + height * height);
    const lw = Math.max(1, Math.round(diagPx / 1200));
    const fs = Math.max(12, Math.round(diagPx / 150));
    ctx.strokeStyle = "rgba(140, 170, 255, 0.45)";
    ctx.lineWidth = lw;
    ctx.font = `bold ${fs}px monospace`;
    ctx.fillStyle = "rgba(180, 200, 255, 0.85)";

    const corners = [
      pixelToWorld(wcs, 0, 0),
      pixelToWorld(wcs, width - 1, 0),
      pixelToWorld(wcs, 0, height - 1),
      pixelToWorld(wcs, width - 1, height - 1),
      pixelToWorld(wcs, width / 2, height / 2),
    ];

    const ras = corners.map(c => c.ra);
    const decs = corners.map(c => c.dec);

    let raMin = Math.min(...ras);
    let raMax = Math.max(...ras);
    if (raMax - raMin > 180) { raMin = Math.min(...ras.map(r => r < 180 ? r + 360 : r)); raMax = Math.max(...ras.map(r => r < 180 ? r + 360 : r)); }
    const decMin = Math.min(...decs);
    const decMax = Math.max(...decs);
    const raSpan = raMax - raMin;
    const decSpan = decMax - decMin;

    const span = Math.max(raSpan, decSpan);
    let gridStep;
    if (span > 10) gridStep = 2;
    else if (span > 5) gridStep = 1;
    else if (span > 2) gridStep = 0.5;
    else if (span > 1) gridStep = 1/6;
    else if (span > 0.5) gridStep = 1/12;
    else gridStep = 1/60;

    const worldToPixelApprox = (targetRA, targetDec) => {
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

      const invDet = 1 / wcs.det;
      const dx = (wcs.cd22 * xi - wcs.cd12 * eta) * invDet;
      const dy = (-wcs.cd21 * xi + wcs.cd11 * eta) * invDet;
      return { x: dx + wcs.crpix1 - 1, y: dy + wcs.crpix2 - 1 };
    };

    // Draw Dec lines
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
      const mid = worldToPixelApprox((raMin + raMax) / 2, dec);
      const midY = height - 1 - mid.y;
      if (mid.x > 30 && mid.x < width - 60 && midY > 15 && midY < height - 5) {
        ctx.fillText(formatDec(dec), mid.x + 4, midY - 4);
      }
    }

    // Draw RA lines
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

  // Listen for mobile file open event (panel-1 only)
  useEffect(() => {
    if (id !== "panel-1") return;
    const handler = (e) => handleFile(e.detail);
    window.addEventListener("mobile-open-fits", handler);
    return () => window.removeEventListener("mobile-open-fits", handler);
  }, [id, handleFile]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const FIT_PAD = 12;
  const syncZoomPan = workspace?.state?.syncZoomPan;
  const syncCursor = workspace?.state?.syncCursor;
  const dispatch = workspace?.dispatch;

  // Effective zoom/pan — use shared values when sync is enabled
  const effectiveZoom = (syncZoomPan && workspace?.state?.sharedZoom !== "fit")
    ? workspace.state.sharedZoom : zoom;
  const effectivePan = syncZoomPan ? pan : pan; // pan is always local; synced via FITS coords

  // Sync incoming pan from workspace (FITS pixel center coords → screen coords)
  useEffect(() => {
    if (!syncZoomPan || !imageData || !workspace?.state?.sharedPan) return;
    const sp = workspace.state.sharedPan;
    if (sp._sourcePanel === id) return; // don't apply our own broadcast
    const s = effectiveZoom === "fit" ? (() => {
      if (!containerSize.w || !containerSize.h) return 1;
      const ch = containerSize.h - FIT_PAD * 2;
      const cw = containerSize.w - FIT_PAD * 2;
      return Math.min(ch / imageData.height, cw / imageData.width);
    })() : Number(effectiveZoom);
    setPan({
      x: (imageData.width / 2 - sp.x) * s,
      y: (imageData.height / 2 - sp.y) * s,
    });
  }, [workspace?.state?.sharedPan, syncZoomPan, imageData, id]);

  // Sync incoming zoom from workspace
  useEffect(() => {
    if (!syncZoomPan || !workspace?.state?.sharedZoom) return;
    const sz = workspace.state.sharedZoom;
    if (sz !== "fit") setZoom(sz);
  }, [workspace?.state?.sharedZoom, syncZoomPan]);

  const getScale = useCallback(() => {
    if (!containerSize.w || !containerSize.h || !imageData) return 1;
    const z = effectiveZoom;
    if (z === "fit") {
      const ch = containerSize.h - FIT_PAD * 2;
      const cw = containerSize.w - FIT_PAD * 2;
      return Math.min(ch / imageData.height, cw / imageData.width);
    }
    return Number(z);
  }, [effectiveZoom, imageData, containerSize]);

  const handleMouseDown = (e) => {
    if (effectiveZoom !== "fit") { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  };
  const handleMouseMove = (e) => {
    if (dragging) {
      const newPan = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
      setPan(newPan);
      // Broadcast pan as FITS pixel center coords
      if (syncZoomPan && imageData && dispatch) {
        const s = getScale();
        dispatch({ type: "SET_SHARED_PAN", pan: {
          x: imageData.width / 2 - newPan.x / s,
          y: imageData.height / 2 - newPan.y / s,
          _sourcePanel: id,
        }});
      }
    }
    if (canvasRef.current && imageData) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scale = getScale();
      const px = Math.floor((e.clientX - rect.left) / scale);
      const py = Math.floor((e.clientY - rect.top) / scale);
      if (px >= 0 && px < imageData.width && py >= 0 && py < imageData.height) {
        const si = (imageData.height - 1 - py) * imageData.width + px;
        const values = imageData.channels.map(ch => ch[si]);
        const fitsX = px + 1;
        const fitsY = imageData.height - py;
        let world = null;
        if (wcs) world = pixelToWorld(wcs, px, imageData.height - 1 - py);
        setCursorInfo({ x: fitsX, y: fitsY, values, world });
        // Broadcast cursor position for crosshair sync
        if (syncCursor && dispatch) {
          dispatch({ type: "SET_CURSOR_POS", cursorFitsPos: { x: fitsX, y: fitsY }, sourcePanel: id });
        }
      } else {
        setCursorInfo(null);
        if (syncCursor && dispatch) dispatch({ type: "SET_CURSOR_POS", cursorFitsPos: null, sourcePanel: id });
      }
    }
  };
  const handleMouseUp = () => setDragging(false);
  const handleMouseLeave = () => {
    handleMouseUp();
    setCursorInfo(null);
    if (syncCursor && dispatch) dispatch({ type: "SET_CURSOR_POS", cursorFitsPos: null, sourcePanel: null });
  };

  const handleWheel = (e) => {
    if (!imageData) return;
    e.preventDefault();
    const cur = effectiveZoom === "fit" ? getScale() : Number(effectiveZoom);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(8, Math.max(0.05, +(cur * factor).toFixed(4)));
    setZoom(newZoom);
    if (syncZoomPan && dispatch) {
      dispatch({ type: "SET_SHARED_ZOOM", zoom: newZoom });
    }
  };

  // ─── Touch gesture handlers (mobile) ───
  const handleTouchStart = useCallback((e) => {
    if (!isMobile || !imageData) return;
    if (e.touches.length === 2) {
      // Pinch zoom start
      clearTimeout(longPressTimerRef.current);
      setLongPressInfo(null);
      const d = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const curZoom = effectiveZoom === "fit" ? getScale() : Number(effectiveZoom);
      touchStateRef.current = {
        initialDist: d,
        initialZoom: curZoom,
        lastPanPos: {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        },
      };
    } else if (e.touches.length === 1) {
      // Long press start
      const touch = e.touches[0];
      longPressTimerRef.current = setTimeout(() => {
        // Show pixel info at touch point
        if (!canvasRef.current || !imageData) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const s = getScale();
        const px = Math.floor((touch.clientX - rect.left) / s);
        const py = Math.floor((touch.clientY - rect.top) / s);
        if (px >= 0 && px < imageData.width && py >= 0 && py < imageData.height) {
          const si = (imageData.height - 1 - py) * imageData.width + px;
          const values = imageData.channels.map(ch => ch[si]);
          const fitsX = px + 1;
          const fitsY = imageData.height - py;
          let world = null;
          if (wcs) world = pixelToWorld(wcs, px, imageData.height - 1 - py);
          setLongPressInfo({
            x: fitsX, y: fitsY, values, world,
            screenX: touch.clientX, screenY: touch.clientY,
          });
        }
      }, 500);
      // Also set up single-finger pan if zoomed in
      if (effectiveZoom !== "fit") {
        touchStateRef.current.lastPanPos = { x: touch.clientX, y: touch.clientY };
      }
    }
  }, [isMobile, imageData, effectiveZoom, getScale, wcs]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || !imageData) return;
    clearTimeout(longPressTimerRef.current);
    setLongPressInfo(null);
    if (e.touches.length === 2 && touchStateRef.current.initialDist) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const scaleRatio = d / touchStateRef.current.initialDist;
      const newZoom = Math.max(0.1, Math.min(8, +(touchStateRef.current.initialZoom * scaleRatio).toFixed(4)));
      setZoom(newZoom);
      // Two-finger pan
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (touchStateRef.current.lastPanPos) {
        const dx = cx - touchStateRef.current.lastPanPos.x;
        const dy = cy - touchStateRef.current.lastPanPos.y;
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      touchStateRef.current.lastPanPos = { x: cx, y: cy };
    } else if (e.touches.length === 1 && effectiveZoom !== "fit" && touchStateRef.current.lastPanPos) {
      // Single-finger pan when zoomed in
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - touchStateRef.current.lastPanPos.x;
      const dy = touch.clientY - touchStateRef.current.lastPanPos.y;
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      touchStateRef.current.lastPanPos = { x: touch.clientX, y: touch.clientY };
    }
  }, [isMobile, imageData, effectiveZoom]);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    touchStateRef.current = { initialDist: null, initialZoom: null, lastPanPos: null };
    // Don't clear longPressInfo here — keep it visible until next tap
  }, []);

  const handleSingleTap = useCallback(() => {
    if (longPressInfo) setLongPressInfo(null);
  }, [longPressInfo]);

  const scale = getScale();

  // Crosshair from other panels
  const crosshairPos = workspace?.state?.cursorFitsPos;
  const crosshairSource = workspace?.state?.cursorSourcePanel;
  const showCrosshair = syncCursor && crosshairPos && crosshairSource !== id && imageData;

  const isActive = workspace?.state?.activePanel === id;

  // Info panel drag handlers
  const handleInfoDragStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    infoDragStart.current = { x: e.clientX - infoPanelPos.x, y: e.clientY - infoPanelPos.y };
    setInfoDragging(true);
    const onMove = (ev) => {
      setInfoPanelPos({ x: ev.clientX - infoDragStart.current.x, y: ev.clientY - infoDragStart.current.y });
    };
    const onUp = () => {
      setInfoDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [infoPanelPos]);

  return (
    <div
      onMouseDown={() => { if (dispatch && !isActive) dispatch({ type: "SET_ACTIVE_PANEL", panelId: id }); }}
      style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        background: T.bg, color: T.text, fontFamily: T.font, fontSize: 12,
        overflow: "hidden", userSelect: "none",
        outline: !isMobile && isActive ? `2px solid ${T.accent}` : "none",
        outlineOffset: "-2px",
      }}>
      {/* ─── Top Bar (desktop only) ─── */}
      {!isMobile && (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "4px 14px",
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        overflow: "hidden",
      }}>
        <span style={{
          background: isActive ? T.accent : T.border, color: isActive ? "#fff" : T.textDim,
          borderRadius: 3, padding: "2px 7px", fontWeight: 700, fontSize: 11,
          fontFamily: T.font, letterSpacing: "0.04em", flexShrink: 0, lineHeight: "18px",
        }}>{{ "panel-1": "A", "panel-2": "B", "panel-3": "C", "panel-4": "D" }[id] || id}</span>
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
                {imageData.width}{"\u00d7"}{imageData.height} {"\u2022"} {imageData.depth >= 3 ? "RGB" : "MONO"}
                {" \u2022 "}{imageData.bitpix === -32 ? "32f" : imageData.bitpix === -64 ? "64f" : `${imageData.bitpix}b`}
              </span>
            )}
            {wcs && <span style={{ marginLeft: 6, color: T.green, fontSize: 9 }}>{"WCS \u2713"}</span>}
          </span>
        )}

        <div style={{ flexShrink: 999, flexGrow: 1, minWidth: 0 }} />

        {imageData && (
          <>
            {/* Zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Btn active={effectiveZoom === "fit"} onClick={() => { setZoom("fit"); setPan({ x: 0, y: 0 }); if (syncZoomPan && dispatch) dispatch({ type: "SET_SHARED_ZOOM", zoom: "fit" }); }}>{t.fit}</Btn>
              <span style={{ color: T.textDim, fontSize: 9 }}>{"\u2212"}</span>
              <input type="range" min={-3} max={3} step={0.01}
                value={effectiveZoom === "fit" ? Math.log2(getScale()) : Math.log2(Number(effectiveZoom))}
                onChange={e => { const nz = +(2 ** Number(e.target.value)).toFixed(4); setZoom(nz); if (syncZoomPan && dispatch) dispatch({ type: "SET_SHARED_ZOOM", zoom: nz }); }}
                style={{ width: 90, accentColor: T.accent }} />
              <span style={{ color: T.textDim, fontSize: 9 }}>+</span>
              <span style={{ color: T.text, fontSize: 9, minWidth: 36, textAlign: "right" }}>
                {(effectiveZoom === "fit" ? scale : Number(effectiveZoom)).toFixed(2)}{"\u00d7"}
              </span>
            </div>

            {/* Rotate & Flip */}
            <div style={{ display: "flex", gap: 3, marginLeft: 10, flexShrink: 0 }}>
              <Btn onClick={() => setRotation(r => (r + 270) % 360)} title={t.rotateCCW}
                style={{ fontSize: 11, padding: "2px 5px" }}>{"\u21b6"}</Btn>
              <Btn onClick={() => setRotation(r => (r + 90) % 360)} title={t.rotateCW}
                style={{ fontSize: 11, padding: "2px 5px" }}>{"\u21b7"}</Btn>
              <Btn active={flipH} onClick={() => setFlipH(f => !f)} title={t.flipH}
                style={{ fontSize: 9, padding: "2px 5px" }}>{"\u2194"}</Btn>
              <Btn active={flipV} onClick={() => setFlipV(f => !f)} title={t.flipV}
                style={{ fontSize: 9, padding: "2px 5px" }}>{"\u2195"}</Btn>
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
      </div>
      )}

      {/* ─── Export Bar (desktop only) ─── */}
      {!isMobile && showExport && imageData && (
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
        {/* ─── Info Panel (floating overlay, desktop only) ─── */}
        {!isMobile && imageData && (showHist || showHeader) && (
          <div style={{
            position: "absolute", top: infoPanelPos.y, left: infoPanelPos.x, zIndex: 10,
            width: 270, maxHeight: "calc(100% - 8px)", borderRadius: 6,
            border: `1px solid ${T.border}`, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            background: `${T.surface}ee`, overflowY: "auto", display: "flex", flexDirection: "column",
            backdropFilter: "blur(12px)", cursor: infoDragging ? "grabbing" : "default",
          }}>
            {/* Drag handle */}
            <div onMouseDown={handleInfoDragStart} style={{
              padding: "4px 0", cursor: "grab", display: "flex", justifyContent: "center",
              flexShrink: 0, borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ width: 32, height: 4, borderRadius: 2, background: T.textDim, opacity: 0.4 }} />
            </div>
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
                            borderRadius: 3, width: 18, height: 18, cursor: "pointer", fontFamily: T.font, fontSize: 11, padding: 0 }}>{"\u2212"}</button>
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
                      <span>MAD: {s.mad.toExponential(3)}</span><span>{"\u03c3"}: {s.sigma.toExponential(3)}</span>
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
                    {(Math.sqrt(wcs.cd11**2 + wcs.cd21**2) * 3600).toFixed(2)}{"\u2033"}/px
                  </span>
                  {header.CROTA2 != null && (
                    <>
                      <span style={{ color: T.accent }}>{t.rotation}</span>
                      <span style={{ color: T.text }}>{Number(header.CROTA2).toFixed(2)}{"\u00b0"}</span>
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
          onMouseDown={!isMobile ? handleMouseDown : undefined}
          onMouseMove={!isMobile ? handleMouseMove : undefined}
          onMouseUp={!isMobile ? handleMouseUp : undefined}
          onMouseLeave={!isMobile ? handleMouseLeave : undefined}
          onWheel={!isMobile ? handleWheel : undefined}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
          onClick={isMobile ? handleSingleTap : undefined}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            cursor: isMobile ? "default" : (dragging ? "grabbing" : (effectiveZoom !== "fit" ? "grab" : "crosshair")),
            touchAction: isMobile ? "none" : "auto",
          }}
        >
          {!imageData && !loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", padding: isMobile ? 32 : 48, border: `2px dashed ${T.border}`, borderRadius: 12, color: T.textDim }}>
                <div style={{ fontSize: isMobile ? 32 : 40, marginBottom: 16, opacity: 0.3 }}>{"\u2726"}</div>
                <div style={{ fontSize: isMobile ? 13 : 14, marginBottom: 8 }}>
                  {isMobile ? t.openFits : t.dropHere}
                </div>
                {!isMobile && <div style={{ fontSize: 11 }}>{t.orClick}</div>}
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
              left: "50%", top: "50%",
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
            }}>
              <canvas ref={canvasRef} style={{
                display: "block",
                width: imageData.width * scale,
                height: imageData.height * scale,
                imageRendering: (typeof effectiveZoom === "number" && effectiveZoom >= 2) ? "pixelated" : "auto",
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

          {/* Crosshair overlay from other panels */}
          {showCrosshair && (() => {
            const cpx = crosshairPos.x - 1; // FITS 1-based → 0-based
            const cpy = imageData.height - crosshairPos.y; // FITS Y → canvas Y
            const canvasEl = canvasRef.current;
            if (!canvasEl) return null;
            const rect = canvasEl.getBoundingClientRect();
            const screenX = rect.left - containerRef.current.getBoundingClientRect().left + cpx * scale;
            const screenY = rect.top - containerRef.current.getBoundingClientRect().top + cpy * scale;
            return (
              <>
                {/* Vertical line */}
                <div style={{
                  position: "absolute", left: screenX, top: 0, width: 1,
                  height: "100%", background: "rgba(140,170,255,0.5)", pointerEvents: "none", zIndex: 20,
                }} />
                {/* Horizontal line */}
                <div style={{
                  position: "absolute", top: screenY, left: 0, height: 1,
                  width: "100%", background: "rgba(140,170,255,0.5)", pointerEvents: "none", zIndex: 20,
                }} />
              </>
            );
          })()}

          {/* Pixel info bar (desktop) */}
          {!isMobile && cursorInfo && (
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
                  {typeof v === "number" ? v.toExponential(4) : "\u2014"}
                </span>
              ))}
              {cursorInfo.world && (
                <>
                  <span style={{ color: T.border }}>{"\u2502"}</span>
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

          {/* Long-press pixel info popup (mobile) */}
          {isMobile && longPressInfo && (
            <div style={{
              position: "fixed",
              left: Math.min(longPressInfo.screenX + 12, window.innerWidth - 220),
              top: Math.max(8, longPressInfo.screenY - 80),
              background: "rgba(0,0,0,0.92)", padding: "8px 14px",
              borderRadius: 6, fontSize: 11, color: T.textDim,
              zIndex: 50, backdropFilter: "blur(8px)",
              border: `1px solid ${T.border}`, maxWidth: 210,
            }}>
              <div style={{ color: T.text, marginBottom: 4 }}>({longPressInfo.x}, {longPressInfo.y})</div>
              {longPressInfo.values.map((v, i) => (
                <div key={i} style={{ color: imageData?.depth >= 3 ? ["#ff8888","#88ff88","#8888ff"][i] : T.text }}>
                  {imageData?.depth >= 3 ? ["R","G","B"][i]+": " : t.val+": "}
                  {typeof v === "number" ? v.toExponential(4) : "\u2014"}
                </div>
              ))}
              {longPressInfo.world && (
                <div style={{ marginTop: 4, borderTop: `1px solid ${T.border}`, paddingTop: 4 }}>
                  <div style={{ color: T.amber }}>RA {formatRA(longPressInfo.world.ra)}</div>
                  <div style={{ color: T.amber }}>Dec {formatDec(longPressInfo.world.dec)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default FitsPanel;
