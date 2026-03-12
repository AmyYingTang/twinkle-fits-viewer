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
  const { state, dispatch, panelRefs } = useWorkspace();
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
          title={{ "1": "Single", "2h": "Side by side", "2v": "Stacked", "4": "2×2 Grid" }[preset]}
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
