import { useWorkspace } from "../workspace/WorkspaceContext.js";
import { countPanels, getPanelIds } from "../workspace/panelLayoutUtils.js";
import { T } from "../theme.js";
import { L } from "../i18n.js";
import { Btn } from "./Btn.jsx";

// Small SVG layout icons (16×14)
function LayoutIcon({ type, active }) {
  const color = active ? T.accent : T.textDim;
  const sw = 1.5;
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" style={{ display: "block" }}>
      <rect x="1" y="1" width="14" height="12" rx="1.5" fill="none" stroke={color} strokeWidth={sw} />
      {type === "2h" && <line x1="8" y1="1" x2="8" y2="13" stroke={color} strokeWidth={sw} />}
      {type === "2v" && <line x1="1" y1="7" x2="15" y2="7" stroke={color} strokeWidth={sw} />}
      {type === "4" && (
        <>
          <line x1="8" y1="1" x2="8" y2="13" stroke={color} strokeWidth={sw} />
          <line x1="1" y1="7" x2="15" y2="7" stroke={color} strokeWidth={sw} />
        </>
      )}
    </svg>
  );
}

export default function TopBar() {
  const { state, dispatch, panelRefs, isMobile } = useWorkspace();
  const t = L[state.lang];
  const panelCount = countPanels(state.layout);

  const handleBlink = () => {
    const ids = getPanelIds(state.layout);
    const loaded = ids.filter(pid => {
      const ref = panelRefs.current[pid];
      return ref?.current?.getImageData?.();
    });
    if (loaded.length >= 2) {
      const first = loaded.includes(state.activePanel) ? state.activePanel : loaded[0];
      const second = loaded.find(p => p !== first) || loaded[1];
      dispatch({ type: "ENTER_BLINK", panelIds: [first, second] });
    }
  };

  const layoutBtnStyle = (preset) => ({
    background: state.layoutPreset === preset ? `${T.accent}22` : "transparent",
    border: `1px solid ${state.layoutPreset === preset ? T.accent : T.border}`,
    borderRadius: 3, padding: "3px 5px", cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  // Mobile: compact single-row top bar
  if (isMobile) {
    const panelRef = panelRefs.current?.["panel-1"]?.current;
    const fileName = panelRef?.getFileName?.() || "";
    const imageData = panelRef?.getImageData?.();
    const wcs = panelRef?.getWcs?.();

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 10px", paddingTop: "calc(6px + env(safe-area-inset-top, 0px))",
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        overflow: "hidden", fontFamily: T.font, fontSize: 10,
      }}>
        <MobileOpenBtn />

        {fileName && (
          <span style={{ color: T.textDim, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
            {fileName.length > 16 ? fileName.slice(0, 14) + "\u2026" : fileName}
            {imageData && (
              <span style={{ marginLeft: 6, color: T.accent }}>
                {imageData.width}{"\u00d7"}{imageData.height}{" "}{imageData.depth >= 3 ? "RGB" : ""}{" "}{imageData.bitpix === -32 ? "32f" : imageData.bitpix === -64 ? "64f" : `${imageData.bitpix}b`}
              </span>
            )}
            {wcs && <span style={{ marginLeft: 4, color: T.green, fontSize: 9 }}>WCS</span>}
          </span>
        )}

        {!fileName && <span style={{ color: T.textDim, flex: 1, fontSize: 10 }}>Twinkle FITS Viewer</span>}

        {/* Language toggle */}
        <button onClick={() => dispatch({ type: "SET_LANG", lang: state.lang === "en" ? "cn" : "en" })} style={{
          background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
          borderRadius: 3, padding: "3px 6px", cursor: "pointer",
          fontFamily: T.font, fontSize: 9, flexShrink: 0,
        }}>{state.lang === "en" ? "\u4e2d\u6587" : "EN"}</button>

        <button onClick={() => dispatch({ type: "SET_SHOW_HELP", show: true })} style={{
          background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
          borderRadius: "50%", width: 22, height: 22, cursor: "pointer",
          fontFamily: T.font, fontSize: 12, padding: 0, lineHeight: "20px", flexShrink: 0,
        }}>?</button>
      </div>
    );
  }

  // Desktop: full top bar
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "4px 14px",
      background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      overflow: "hidden", fontFamily: T.font, fontSize: 10,
    }}>
      {/* Layout preset buttons */}
      {["1", "2h", "2v", "4"].map(preset => (
        <button key={preset}
          onClick={() => dispatch({ type: "SET_LAYOUT", preset })}
          style={layoutBtnStyle(preset)}
          title={{ "1": "Single", "2h": "Side by side", "2v": "Stacked", "4": "2\u00d72 Grid" }[preset]}
        >
          <LayoutIcon type={preset} active={state.layoutPreset === preset} />
        </button>
      ))}

      <div style={{ flexGrow: 1 }} />

      {/* Sync toggles + blink (only show when multiple panels) */}
      {panelCount > 1 && (
        <>
          <Btn active={state.syncZoomPan} onClick={() => dispatch({ type: "TOGGLE_SYNC_ZOOM" })}>
            {t.syncZoom}
          </Btn>
          <Btn active={state.syncCursor} onClick={() => dispatch({ type: "TOGGLE_SYNC_CURSOR" })}>
            {t.syncCursor}
          </Btn>
          <Btn onClick={handleBlink}
            style={{ color: T.amber, borderColor: T.amber }}>
            {t.blink}
          </Btn>
        </>
      )}

      {/* Language toggle */}
      <button onClick={() => dispatch({ type: "SET_LANG", lang: state.lang === "en" ? "cn" : "en" })} style={{
        background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
        borderRadius: 3, padding: "3px 8px", cursor: "pointer",
        fontFamily: T.font, fontSize: 10, flexShrink: 0,
      }}>{state.lang === "en" ? "\u4e2d\u6587" : "EN"}</button>

      {/* Help button */}
      <button onClick={() => dispatch({ type: "SET_SHOW_HELP", show: true })} style={{
        background: "transparent", border: `1px solid ${T.border}`, color: T.textDim,
        borderRadius: "50%", width: 22, height: 22, cursor: "pointer",
        fontFamily: T.font, fontSize: 12, padding: 0, lineHeight: "20px", flexShrink: 0,
      }}>?</button>
    </div>
  );
}

/* Mobile OPEN button — triggers panel-1's file input */
function MobileOpenBtn() {
  const { panelRefs } = useWorkspace();
  const t = L[useWorkspace().state.lang];

  const handleClick = () => {
    // Create a temporary file input since we can't access panel's internal ref from here
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".fits,.fit,.fts";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Dispatch a custom event that FitsPanel listens for
      window.dispatchEvent(new CustomEvent("mobile-open-fits", { detail: file }));
    };
    input.click();
  };

  return (
    <button onClick={handleClick} style={{
      background: T.accent, color: "#fff", border: "none", borderRadius: 4,
      padding: "5px 10px", cursor: "pointer", fontFamily: T.font, fontSize: 10,
      fontWeight: 600, flexShrink: 0,
    }}>{t.openFits}</button>
  );
}
