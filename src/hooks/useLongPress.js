import { useRef, useCallback, useEffect } from "react";

/* Long-press hook: fires callback on press, then repeats at 100ms while held */
export function useLongPress(callback) {
  const intervalRef = useRef(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    callbackRef.current();
    intervalRef.current = setInterval(() => callbackRef.current(), 100);
  }, []);

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}
