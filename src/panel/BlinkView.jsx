import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspace } from "../workspace/WorkspaceContext.js";
import { T } from "../theme.js";
import { L } from "../i18n.js";
import { Btn } from "../components/Btn.jsx";

export default function BlinkView() {
  const { state, dispatch, panelRefs } = useWorkspace();
  const t = L[state.lang];
  const { blink } = state;
  const canvasRef = useRef(null);
  const [frames, setFrames] = useState([]);
  const [names, setNames] = useState([]);
  const intervalRef = useRef(null);

  // Capture ImageData from the two panels on mount
  useEffect(() => {
    if (!blink.active || blink.panelIds.length < 2) return;
    const captured = [];
    const capturedNames = [];
    for (const pid of blink.panelIds) {
      const ref = panelRefs.current[pid];
      const panel = ref?.current;
      if (!panel) continue;
      const canvas = panel.getCanvasRef?.();
      if (!canvas) continue;
      const ctx = canvas.getContext("2d");
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      captured.push({ imageData: imgData, width: canvas.width, height: canvas.height });
      capturedNames.push(panel.getFileName?.() || pid);
    }
    setFrames(captured);
    setNames(capturedNames);
  }, [blink.active, blink.panelIds, panelRefs]);

  // Draw current frame
  useEffect(() => {
    if (!canvasRef.current || frames.length < 2) return;
    const frame = frames[blink.currentIdx];
    if (!frame) return;
    const canvas = canvasRef.current;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    ctx.putImageData(frame.imageData, 0, 0);
  }, [blink.currentIdx, frames]);

  // Auto-blink interval
  useEffect(() => {
    if (blink.auto && blink.active) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: "BLINK_TOGGLE" });
      }, blink.intervalMs);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [blink.auto, blink.active, blink.intervalMs, dispatch]);

  // Keyboard handlers
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") {
      dispatch({ type: "EXIT_BLINK" });
    } else if (e.key === " " || e.key === "b" || e.key === "B") {
      e.preventDefault();
      dispatch({ type: "BLINK_TOGGLE" });
    } else if (e.key === "a" || e.key === "A") {
      dispatch({ type: "SET_BLINK_AUTO", auto: !blink.auto });
    }
  }, [dispatch, blink.auto]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!blink.active) return null;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      background: T.bg, display: "flex", flexDirection: "column",
    }}>
      {/* Control bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 14px",
        background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        fontFamily: T.font, fontSize: 11,
      }}>
        <span style={{ color: T.accent, fontWeight: 600, letterSpacing: "0.08em" }}>BLINK</span>
        <span style={{ color: T.text }}>
          {names[blink.currentIdx] || "?"} ({blink.currentIdx === 0 ? "A" : "B"})
        </span>
        <div style={{ flexGrow: 1 }} />
        <Btn onClick={() => dispatch({ type: "BLINK_TOGGLE" })}>
          Space / B
        </Btn>
        <Btn active={blink.auto} onClick={() => dispatch({ type: "SET_BLINK_AUTO", auto: !blink.auto })}>
          {t.blinkAuto}
        </Btn>
        {blink.auto && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: T.textDim, fontSize: 9 }}>{t.blinkInterval}</span>
            <input type="range" min={100} max={2000} step={50}
              value={blink.intervalMs}
              onChange={e => dispatch({ type: "SET_BLINK_INTERVAL", intervalMs: Number(e.target.value) })}
              style={{ width: 80, accentColor: T.accent }} />
            <span style={{ color: T.textDim, fontSize: 9, minWidth: 32 }}>{blink.intervalMs}ms</span>
          </div>
        )}
        <Btn onClick={() => dispatch({ type: "EXIT_BLINK" })} style={{ color: T.red, borderColor: T.red }}>
          ESC
        </Btn>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {frames.length >= 2 ? (
          <canvas ref={canvasRef} style={{
            maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
          }} />
        ) : (
          <div style={{ color: T.textDim, fontSize: 14 }}>
            Need at least 2 panels with loaded files
          </div>
        )}
      </div>
    </div>
  );
}
