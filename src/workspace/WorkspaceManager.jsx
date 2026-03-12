import { useReducer, useRef, useCallback } from "react";
import { WorkspaceContext } from "./WorkspaceContext.js";
import { countPanels, getPanelIds, LAYOUT_PRESETS } from "./panelLayoutUtils.js";
import FitsPanel from "../panel/FitsPanel.jsx";
import TopBar from "../components/TopBar.jsx";
import HelpModal from "../components/HelpModal.jsx";
import BlinkView from "../panel/BlinkView.jsx";
import { T } from "../theme.js";

const ALL_PANEL_IDS = ["panel-1", "panel-2", "panel-3", "panel-4"];

const VISIBLE_PANELS = {
  "1": ["panel-1"],
  "2h": ["panel-1", "panel-2"],
  "2v": ["panel-1", "panel-2"],
  "4": ["panel-1", "panel-2", "panel-3", "panel-4"],
};

const GRID_STYLES = {
  "1": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" },
  "2h": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" },
  "2v": { gridTemplateColumns: "1fr", gridTemplateRows: "1fr 1fr" },
  "4": { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" },
};

const initialState = {
  layout: LAYOUT_PRESETS["1"],
  layoutPreset: "1",
  activePanel: "panel-1",
  // Sync
  syncZoomPan: false,
  syncCursor: true,
  sharedZoom: "fit",
  sharedPan: { x: 0, y: 0 },
  cursorFitsPos: null,
  cursorSourcePanel: null,
  // Blink
  blink: { active: false, panelIds: [], currentIdx: 0, intervalMs: 500, auto: false },
  // Global UI
  lang: "en",
  showHelp: false,
};

function workspaceReducer(state, action) {
  switch (action.type) {
    case "SET_LAYOUT": {
      const preset = LAYOUT_PRESETS[action.preset];
      if (!preset) return state;
      const newIds = getPanelIds(preset);
      return {
        ...state,
        layout: preset,
        layoutPreset: action.preset,
        activePanel: newIds.includes(state.activePanel) ? state.activePanel : newIds[0],
      };
    }
    case "SET_ACTIVE_PANEL":
      return { ...state, activePanel: action.panelId };
    case "TOGGLE_SYNC_ZOOM":
      return { ...state, syncZoomPan: !state.syncZoomPan };
    case "TOGGLE_SYNC_CURSOR":
      return { ...state, syncCursor: !state.syncCursor };
    case "SET_SHARED_ZOOM":
      return { ...state, sharedZoom: action.zoom };
    case "SET_SHARED_PAN":
      return { ...state, sharedPan: action.pan };
    case "SET_CURSOR_POS":
      return { ...state, cursorFitsPos: action.cursorFitsPos, cursorSourcePanel: action.sourcePanel || null };
    case "SET_LANG":
      return { ...state, lang: action.lang };
    case "SET_SHOW_HELP":
      return { ...state, showHelp: action.show };
    case "ENTER_BLINK":
      return { ...state, blink: { ...state.blink, active: true, panelIds: action.panelIds, currentIdx: 0 } };
    case "EXIT_BLINK":
      return { ...state, blink: { ...state.blink, active: false } };
    case "BLINK_TOGGLE":
      return { ...state, blink: { ...state.blink, currentIdx: state.blink.currentIdx === 0 ? 1 : 0 } };
    case "SET_BLINK_INTERVAL":
      return { ...state, blink: { ...state.blink, intervalMs: action.intervalMs } };
    case "SET_BLINK_AUTO":
      return { ...state, blink: { ...state.blink, auto: action.auto } };
    default:
      return state;
  }
}

export default function WorkspaceManager() {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const panelRefs = useRef({});

  const getPanelRef = useCallback((id) => {
    if (!panelRefs.current[id]) {
      panelRefs.current[id] = { current: null };
    }
    return panelRefs.current[id];
  }, []);

  const contextValue = { state, dispatch, getPanelRef, panelRefs };
  const visible = VISIBLE_PANELS[state.layoutPreset] || VISIBLE_PANELS["1"];

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <TopBar />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{
          width: "100%", height: "100%",
          display: "grid", gap: 2, background: T.border,
          ...GRID_STYLES[state.layoutPreset],
        }}>
          {ALL_PANEL_IDS.map(pid => (
            <div key={pid} style={{
              display: visible.includes(pid) ? "block" : "none",
              overflow: "hidden", minWidth: 0, minHeight: 0,
            }}>
              <FitsPanel
                ref={getPanelRef(pid)}
                id={pid}
                lang={state.lang}
              />
            </div>
          ))}
        </div>
        <BlinkView />
      </div>
      <HelpModal />
    </WorkspaceContext.Provider>
  );
}
