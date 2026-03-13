import { useRef, useCallback, useState, useEffect } from "react";
import { T } from "../theme.js";

const HALF = 0.5;   // half-screen height fraction
const FULL = 0.9;   // full-screen height fraction
const DISMISS = 0.18; // below this fraction → dismiss

export default function BottomSheet({ open, onClose, children }) {
  const sheetRef = useRef(null);
  const contentRef = useRef(null);
  const [heightFrac, setHeightFrac] = useState(HALF);
  const dragState = useRef(null);
  const heightFracRef = useRef(heightFrac);
  heightFracRef.current = heightFrac;

  // Reset height when opening
  useEffect(() => {
    if (open) setHeightFrac(HALF);
  }, [open]);

  const startDrag = useCallback((startY) => {
    dragState.current = { startY, startFrac: heightFracRef.current };

    const onMove = (ev) => {
      ev.preventDefault();
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const dy = dragState.current.startY - cy;
      const windowH = window.innerHeight;
      const newFrac = Math.min(FULL, Math.max(0.05, dragState.current.startFrac + dy / windowH));
      setHeightFrac(newFrac);
    };

    const onEnd = () => {
      const frac = heightFracRef.current;
      if (frac < DISMISS) {
        onClose();
      } else if (frac > (HALF + FULL) / 2) {
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
  }, [onClose]);

  // Handle drag: fires on the drag-handle bar
  const handleHandleDrag = useCallback((e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startDrag(clientY);
  }, [startDrag]);

  // Content area: only start drag-to-dismiss when scrolled to top and swiping down
  const handleContentTouchStart = useCallback((e) => {
    const el = contentRef.current;
    if (!el || el.scrollTop > 0) return; // content is scrolled, let it scroll normally
    // Store touch start; we'll decide in onMove whether to hijack
    dragState.current = {
      startY: e.touches[0].clientY,
      startFrac: heightFracRef.current,
      pending: true, // haven't committed to dragging yet
    };
  }, []);

  const handleContentTouchMove = useCallback((e) => {
    if (!dragState.current) return;
    const cy = e.touches[0].clientY;
    const dy = cy - dragState.current.startY; // positive = swiping down

    if (dragState.current.pending) {
      // Need a minimum 8px downward movement to commit to sheet drag
      if (dy > 8) {
        dragState.current.pending = false;
        startDrag(dragState.current.startY);
      } else if (dy < -4) {
        // Swiping up → let content scroll, abort
        dragState.current = null;
      }
      return;
    }
  }, [startDrag]);

  const handleContentTouchEnd = useCallback(() => {
    if (dragState.current?.pending) {
      dragState.current = null; // was a tap or very small movement
    }
  }, []);

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
        position: "fixed", bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", left: 0, right: 0,
        height: `calc(${heightFrac * 100}vh - 56px - env(safe-area-inset-bottom, 0px))`,
        background: T.surface, borderTopLeftRadius: 12, borderTopRightRadius: 12,
        zIndex: 100, display: "flex", flexDirection: "column",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        transition: dragState.current ? "none" : "height 0.25s ease-out",
      }}>
        {/* Drag handle */}
        <div
          onMouseDown={handleHandleDrag}
          onTouchStart={handleHandleDrag}
          style={{
            padding: "10px 0", cursor: "grab", display: "flex",
            justifyContent: "center", flexShrink: 0, touchAction: "none",
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.textDim, opacity: 0.4 }} />
        </div>
        {/* Content — swipe-down-to-dismiss when scrolled to top */}
        <div
          ref={contentRef}
          onTouchStart={handleContentTouchStart}
          onTouchMove={handleContentTouchMove}
          onTouchEnd={handleContentTouchEnd}
          style={{
            flex: 1, overflow: "auto", padding: "0 12px 12px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
