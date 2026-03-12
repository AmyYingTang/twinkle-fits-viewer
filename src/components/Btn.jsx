import { T } from "../theme.js";

export const Btn = ({ active, onClick, children, style = {} }) => (
  <button onClick={onClick} style={{
    background: active ? T.accentDim : "transparent",
    color: active ? "#fff" : T.textDim,
    border: `1px solid ${active ? T.accent : T.border}`,
    borderRadius: 3, padding: "3px 8px", cursor: "pointer",
    fontFamily: T.font, fontSize: 10, ...style,
  }}>{children}</button>
);
