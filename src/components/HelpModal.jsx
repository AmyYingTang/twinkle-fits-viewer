import { useWorkspace } from "../workspace/WorkspaceContext.js";
import { T } from "../theme.js";
import { L } from "../i18n.js";

export default function HelpModal() {
  const { state, dispatch } = useWorkspace();
  if (!state.showHelp) return null;
  const t = L[state.lang];

  return (
    <div onClick={() => dispatch({ type: "SET_SHOW_HELP", show: false })} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: 24, maxWidth: 520, maxHeight: "80vh", overflowY: "auto",
        color: T.text, fontFamily: T.font, fontSize: 11, lineHeight: 1.7,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>{t.glossaryTitle}</span>
          <button onClick={() => dispatch({ type: "SET_SHOW_HELP", show: false })} style={{
            background: "transparent", border: "none", color: T.textDim, cursor: "pointer",
            fontFamily: T.font, fontSize: 16,
          }}>{"\u2715"}</button>
        </div>
        {t.glossary.map((sec) => (
          <div key={sec.section} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: "0.06em", marginBottom: 6, borderBottom: `1px solid ${T.border}`, paddingBottom: 4 }}>{sec.section}</div>
            {sec.items.map(([term, desc]) => (
              <div key={term} style={{ marginBottom: 6, paddingLeft: 8 }}>
                <span style={{ color: T.accent, fontWeight: 600 }}>{term}</span>
                <span style={{ color: T.textDim }}> {"\u2014"} {desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
