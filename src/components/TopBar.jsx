import { useWorkspace } from "../workspace/WorkspaceContext.js";
import { countPanels, getPanelIds } from "../workspace/panelLayoutUtils.js";
import { T } from "../theme.js";
import { L } from "../i18n.js";
import { Btn } from "./Btn.jsx";

export default function TopBar() {
  const { state, dispatch, panelRefs } = useWorkspace();
  const t = L[state.lang];
  const panelCount = countPanels(state.layout);

  const handleBlink = () => {
    // Find the two most recently active panels that have loaded files
    const ids = getPanelIds(state.layout);
    const loaded = ids.filter(pid => {
      const ref = panelRefs.current[pid];
      return ref?.current?.getImageData?.();
    });
    if (loaded.length >= 2) {
      // Prefer active panel as first, then pick another
      const first = loaded.includes(state.activePanel) ? state.activePanel : loaded[0];
      const second = loaded.find(p => p !== first) || loaded[1];
      dispatch({ type: "ENTER_BLINK", panelIds: [first, second] });
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "4px 14px",
      background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      overflow: "hidden", fontFamily: T.font, fontSize: 10,
    }}>
      {/* Split buttons */}
      <Btn onClick={() => {
        if (panelCount < 4) dispatch({ type: "SPLIT_PANEL", panelId: state.activePanel, direction: "horizontal" });
      }} style={{ opacity: panelCount >= 4 ? 0.4 : 1 }}>
        {t.splitRight}
      </Btn>
      <Btn onClick={() => {
        if (panelCount < 4) dispatch({ type: "SPLIT_PANEL", panelId: state.activePanel, direction: "vertical" });
      }} style={{ opacity: panelCount >= 4 ? 0.4 : 1 }}>
        {t.splitDown}
      </Btn>

      {/* Close panel (only if > 1) */}
      {panelCount > 1 && (
        <Btn onClick={() => dispatch({ type: "CLOSE_PANEL", panelId: state.activePanel })}>
          {t.closePanel}
        </Btn>
      )}

      <div style={{ flexGrow: 1 }} />

      {/* Sync toggles (only show when multiple panels) */}
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
