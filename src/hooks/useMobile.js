import { useState, useEffect } from "react";

const MQ = "(max-width: 767px)";

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MQ).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
