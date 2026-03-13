import { useRef, useCallback, useState, useEffect } from "react";
import { T } from "../theme.js";

const HALF = 0.5;   // half-screen height fraction
const FULL = 0.9;   // full-screen height fraction
const DISMISS = 0.15; // below this fraction → dismiss

export default function BottomSheet({ open, onClose, children }) {
  const sheetRef = useRef(null);
  const [heightFrac, setHeightFrac] = useState(HALF);
  const dragState = useRef(null);

  // Reset height when opening
  useEffect(() => {
    if (open) setHeightFrac(HALF);
  }, [open]);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { startY: clientY, startFrac: heightFrac };

    const onMove = (ev) => {
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dy = dragState.current.startY - cy;
      const windowH = window.innerHeight;
      const newFrac = Math.min(FULL, Math.max(0.05, dragState.current.startFrac + dy / windowH));
      setHeightFrac(newFrac);
    };

    const onEnd = () => {
      if (heightFrac < DISMISS) {
        onClose();
      } else if (heightFrac > (HALF + FULL) / 2) {
        setHeightFrac(FULL);
      } else {
        setHeightFrac(HALF);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      dragState.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }, [heightFrac, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
        zIndex: 90, touchAction: "none",
      }} />
      {/* Sheet */}
      <div ref={sheetRef} style={{
        position: "fixed", bottom: 44, left: 0, right: 0,
        height: `calc(${heightFrac * 100}vh - 44px)`,
        background: T.surface, borderTopLeftRadius: 12, borderTopRightRadius: 12,
        zIndex: 100, display: "flex", flexDirection: "column",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        transition: dragState.current ? "none" : "height 0.25s ease-out",
      }}>
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          style={{
            padding: "8px 0", cursor: "grab", display: "flex",
            justifyContent: "center", flexShrink: 0, touchAction: "none",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textDim, opacity: 0.4 }} />
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
