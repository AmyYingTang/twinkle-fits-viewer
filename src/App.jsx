import WorkspaceManager from "./workspace/WorkspaceManager.jsx";
import { T } from "./theme.js";

export default function App() {
  return (
    <div style={{
      width: "100%", height: "100dvh", display: "flex", flexDirection: "column",
      background: T.bg, color: T.text, fontFamily: T.font,
      overflow: "hidden",
    }}>
      <WorkspaceManager />
    </div>
  );
}
