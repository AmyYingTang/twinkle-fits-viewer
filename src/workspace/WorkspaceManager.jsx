import { useReducer, useRef, useCallback } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { WorkspaceContext } from "./WorkspaceContext.js";
import { splitPanel, removePanel, countPanels, getPanelIds } from "./panelLayoutUtils.js";
import FitsPanel from "../panel/FitsPanel.jsx";
import TopBar from "../components/TopBar.jsx";
import HelpModal from "../components/HelpModal.jsx";
import BlinkView from "../panel/BlinkView.jsx";
import { T } from "../theme.js";

const initialState = {
  layout: { type: "panel", id: "panel-1" },
  nextPanelId: 2,
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
    case "SPLIT_PANEL": {
      if (countPanels(state.layout) >= 4) return state;
      const newId = `panel-${state.nextPanelId}`;
      return {
        ...state,
        layout: splitPanel(state.layout, action.panelId, newId, action.direction),
        nextPanelId: state.nextPanelId + 1,
        activePanel: newId,
      };
    }
    case "CLOSE_PANEL": {
      const ids = getPanelIds(state.layout);
      if (ids.length <= 1) return state;
      const newLayout = removePanel(state.layout, action.panelId);
      const newIds = getPanelIds(newLayout);
      return {
        ...state,
        layout: newLayout,
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

  function renderLayout(node, key = "root") {
    if (node.type === "panel") {
      return (
        <Panel key={node.id} minSize="15%">
          <FitsPanel
            ref={getPanelRef(node.id)}
            id={node.id}
            lang={state.lang}
          />
        </Panel>
      );
    }

    return (
      <PanelGroup key={key} orientation={node.direction}>
        {node.children.flatMap((child, i) => {
          const elements = [];
          if (i > 0) {
            elements.push(
              <PanelResizeHandle key={`handle-${key}-${i}`}
                style={{
                  width: node.direction === "horizontal" ? 4 : undefined,
                  height: node.direction === "vertical" ? 4 : undefined,
                  background: T.border,
                  cursor: node.direction === "horizontal" ? "col-resize" : "row-resize",
                  flexShrink: 0,
                }}
              />
            );
          }
          elements.push(renderLayout(child, `${key}-${i}`));
          return elements;
        })}
      </PanelGroup>
    );
  }

  return (
    <WorkspaceContext.Provider value={contextValue}>
      <TopBar />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {state.layout.type === "panel" ? (
          <PanelGroup orientation="horizontal">
            {renderLayout(state.layout)}
          </PanelGroup>
        ) : renderLayout(state.layout)}
        <BlinkView />
      </div>
      <HelpModal />
    </WorkspaceContext.Provider>
  );
}
