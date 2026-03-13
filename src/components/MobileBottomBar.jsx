import { useState, useRef, useEffect } from "react";
import { T } from "../theme.js";
import { L } from "../i18n.js";
import { Btn } from "./Btn.jsx";
import { COLORMAPS } from "../utils/renderCanvas.js";
import { drawHistogram } from "../utils/drawHistogram.js";
import { exportPNG } from "../utils/exportFits.js";
import { formatRA, formatDec } from "../utils/wcs.js";
import BottomSheet from "./BottomSheet.jsx";
import { useWorkspace } from "../workspace/WorkspaceContext.js";

const TABS = ["stretch", "stats", "header", "export"];

export default function MobileBottomBar() {
  const { state, panelRefs } = useWorkspace();
  const t = L[state.lang];
  const [activeTab, setActiveTab] = useState(null);

  const panelRef = panelRefs.current?.["panel-1"]?.current;

  const handleTab = (tab) => {
    setActiveTab(prev => prev === tab ? null : tab);
  };

  const tabLabels = {
    stretch: t.stretch,
    stats: t.statistics,
    header: t.hdr,
    export: t.export_,
  };

  return (
    <>
      {/* Bottom Sheet */}
      <BottomSheet open={!!activeTab} onClose={() => setActiveTab(null)}>
        {activeTab === "stretch" && <StretchSheet panelRef={panelRef} lang={state.lang} />}
        {activeTab === "stats" && <StatsSheet panelRef={panelRef} lang={state.lang} />}
        {activeTab === "header" && <HeaderSheet panelRef={panelRef} lang={state.lang} />}
        {activeTab === "export" && <ExportSheet panelRef={panelRef} lang={state.lang} />}
      </BottomSheet>

      {/* Tab Bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: 44,
        display: "flex", alignItems: "center", justifyContent: "space-around",
        background: T.surface, borderTop: `1px solid ${T.border}`,
        zIndex: 110, fontFamily: T.font,
      }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => handleTab(tab)} style={{
            flex: 1, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: activeTab === tab ? `${T.accent}22` : "transparent",
            color: activeTab === tab ? T.accent : T.textDim,
            border: "none", cursor: "pointer", fontFamily: T.font,
            fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
            borderTop: activeTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
          }}>
            {tabLabels[tab]}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── Stretch Sheet ── */
function StretchSheet({ panelRef, lang }) {
  const t = L[lang];
  const histCanvasRef = useRef(null);

  const statsAndStretch = panelRef?.getStatsAndStretch?.();
  const currentStretch = panelRef?.getCurrentStretch?.();
  const autoMode = panelRef?.getAutoMode?.();
  const colorMap = panelRef?.getColorMap?.();
  const manualLo = panelRef?.getManualLo?.();
  const manualHi = panelRef?.getManualHi?.();
  const manualMid = panelRef?.getManualMid?.();

  // Force re-render by reading values
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!histCanvasRef.current || !statsAndStretch || !currentStretch) return;
    drawHistogram(histCanvasRef.current, statsAndStretch.histData, currentStretch);
  }, [statsAndStretch, currentStretch, autoMode, manualLo, manualHi, manualMid]);

  if (!statsAndStretch) {
    return <div style={{ color: T.textDim, padding: 16, textAlign: "center" }}>No image loaded</div>;
  }

  const handleSetAutoMode = (v) => { panelRef?.setAutoMode?.(v); forceUpdate(n => n + 1); };
  const handleSetManualLo = (v) => { panelRef?.setManualLo?.(v); forceUpdate(n => n + 1); };
  const handleSetManualHi = (v) => { panelRef?.setManualHi?.(v); forceUpdate(n => n + 1); };
  const handleSetManualMid = (v) => { panelRef?.setManualMid?.(v); forceUpdate(n => n + 1); };
  const handleSetColorMap = (v) => { panelRef?.setColorMap?.(v); forceUpdate(n => n + 1); };

  const switchToManual = () => {
    handleSetAutoMode(false);
    if (statsAndStretch) {
      const s = statsAndStretch.stats[0];
      const range = s.max - s.min || 1;
      const st = statsAndStretch.stretch;
      handleSetManualLo(((Array.isArray(st.lo) ? st.lo[0] : st.lo) - s.min) / range);
      handleSetManualHi(((Array.isArray(st.hi) ? st.hi[0] : st.hi) - s.min) / range);
      handleSetManualMid(Array.isArray(st.midtone) ? st.midtone[0] : st.midtone);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.08em" }}>{t.stretch}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn active={autoMode} onClick={() => handleSetAutoMode(true)} style={{ fontSize: 10, padding: "4px 12px" }}>{t.auto}</Btn>
          <Btn active={!autoMode} onClick={switchToManual} style={{ fontSize: 10, padding: "4px 12px" }}>{t.manual}</Btn>
        </div>
      </div>

      <canvas ref={histCanvasRef} width={256} height={80}
        style={{ width: "100%", height: 80, borderRadius: 4, marginBottom: 8 }} />

      {!autoMode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {[
            [t.shadow, manualLo, handleSetManualLo, T.red, 0, 1],
            [t.midtone, manualMid, handleSetManualMid, T.accent, 0.001, 0.999],
            [t.highlight, manualHi, handleSetManualHi, T.green, 0, 1],
          ].map(([label, val, setter, color, min, max]) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ color, width: 56 }}>{label}</span>
              <input type="range" min={min} max={max} step={0.001} value={val}
                onChange={e => setter(Number(e.target.value))}
                style={{ flex: 1, accentColor: color, height: 24 }} />
              <span style={{ color: T.textDim, fontSize: 10, minWidth: 40, textAlign: "right" }}>
                {val?.toFixed(3)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: T.textDim, marginRight: 4 }}>{t.map}</span>
        {COLORMAPS.map(cm => (
          <Btn key={cm} active={colorMap === cm} onClick={() => handleSetColorMap(cm)}
            style={{ fontSize: 10, padding: "4px 10px", textTransform: "uppercase" }}>{cm}</Btn>
        ))}
      </div>
    </div>
  );
}

/* ── Stats Sheet ── */
function StatsSheet({ panelRef, lang }) {
  const t = L[lang];
  const statsAndStretch = panelRef?.getStatsAndStretch?.();
  const wcs = panelRef?.getWcs?.();
  const header = panelRef?.getHeader?.();

  if (!statsAndStretch) {
    return <div style={{ color: T.textDim, padding: 16, textAlign: "center" }}>No image loaded</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>{t.statistics}</div>
      {statsAndStretch.stats.map((s, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          {statsAndStretch.isRGB && (
            <div style={{ color: ["#ff8888", "#88ff88", "#8888ff"][i], marginBottom: 4, fontSize: 11 }}>
              {[t.red, t.green, t.blue][i]}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: T.textDim, fontSize: 11 }}>
            <span>Min: {s.min.toExponential(3)}</span><span>Max: {s.max.toExponential(3)}</span>
            <span>Mean: {s.mean.toExponential(3)}</span><span>Median: {s.median.toExponential(3)}</span>
            <span>MAD: {s.mad.toExponential(3)}</span><span>{"\u03c3"}: {s.sigma.toExponential(3)}</span>
          </div>
        </div>
      ))}

      {wcs && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>{t.wcs}</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", color: T.textDim, fontSize: 11 }}>
            <span style={{ color: T.accent }}>{t.centerRA}</span>
            <span style={{ color: T.text }}>{formatRA(wcs.crval1)}</span>
            <span style={{ color: T.accent }}>{t.centerDec}</span>
            <span style={{ color: T.text }}>{formatDec(wcs.crval2)}</span>
            <span style={{ color: T.accent }}>{t.projection}</span>
            <span style={{ color: T.text }}>{wcs.isTAN ? "TAN (gnomonic)" : "Linear"}</span>
            <span style={{ color: T.accent }}>{t.scale}</span>
            <span style={{ color: T.text }}>
              {(Math.sqrt(wcs.cd11 ** 2 + wcs.cd21 ** 2) * 3600).toFixed(2)}{"\u2033"}/px
            </span>
            {header?.CROTA2 != null && (
              <>
                <span style={{ color: T.accent }}>{t.rotation}</span>
                <span style={{ color: T.text }}>{Number(header.CROTA2).toFixed(2)}{"\u00b0"}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Header Sheet ── */
function HeaderSheet({ panelRef, lang }) {
  const t = L[lang];
  const header = panelRef?.getHeader?.();

  if (!header) {
    return <div style={{ color: T.textDim, padding: 16, textAlign: "center" }}>No image loaded</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.08em", marginBottom: 8 }}>{t.fitsHeader}</div>
      <div style={{ fontSize: 10, lineHeight: 1.7, color: T.textDim }}>
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
  );
}

/* ── Export Sheet ── */
function ExportSheet({ panelRef, lang }) {
  const t = L[lang];
  const imageData = panelRef?.getImageData?.();
  const canvasEl = panelRef?.getCanvasRef?.();
  const fileName = panelRef?.getFileName?.();

  if (!imageData) {
    return <div style={{ color: T.textDim, padding: 16, textAlign: "center" }}>No image loaded</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: T.textDim, letterSpacing: "0.08em", marginBottom: 12 }}>{t.export_}</div>
      <div style={{ marginBottom: 12, color: T.textDim, fontSize: 11 }}>
        {imageData.width}{"\u00d7"}{imageData.height} {"\u2022"} {imageData.depth >= 3 ? "RGB" : "MONO"}
      </div>
      <button onClick={() => exportPNG(canvasEl, fileName)} style={{
        width: "100%", background: T.accent, color: "#fff", border: "none",
        borderRadius: 6, padding: "14px 0", cursor: "pointer", fontFamily: T.font,
        fontSize: 13, fontWeight: 600,
      }}>
        {t.pngBtn}
      </button>
      <div style={{ marginTop: 8, color: T.textDim, fontSize: 10, textAlign: "center" }}>
        {t.exportDesc}
      </div>
    </div>
  );
}
