// Layout presets with stable panel IDs so React preserves component state
export const LAYOUT_PRESETS = {
  "1": { type: "panel", id: "panel-1" },
  "2h": {
    direction: "horizontal",
    children: [
      { type: "panel", id: "panel-1" },
      { type: "panel", id: "panel-2" },
    ],
  },
  "2v": {
    direction: "vertical",
    children: [
      { type: "panel", id: "panel-1" },
      { type: "panel", id: "panel-2" },
    ],
  },
  "4": {
    direction: "vertical",
    children: [
      {
        direction: "horizontal",
        children: [
          { type: "panel", id: "panel-1" },
          { type: "panel", id: "panel-2" },
        ],
      },
      {
        direction: "horizontal",
        children: [
          { type: "panel", id: "panel-3" },
          { type: "panel", id: "panel-4" },
        ],
      },
    ],
  },
};

// Detect which preset matches current layout (for highlighting active icon)
export function detectPreset(layout) {
  for (const [key, preset] of Object.entries(LAYOUT_PRESETS)) {
    if (layoutsMatch(layout, preset)) return key;
  }
  return null;
}

function layoutsMatch(a, b) {
  if (a.type === "panel" && b.type === "panel") return a.id === b.id;
  if (a.type === "panel" || b.type === "panel") return false;
  if (a.direction !== b.direction) return false;
  if (a.children.length !== b.children.length) return false;
  return a.children.every((c, i) => layoutsMatch(c, b.children[i]));
}

// Split an existing panel into two panels in the given direction
export function splitPanel(layout, targetId, newId, direction) {
  if (layout.type === "panel") {
    if (layout.id === targetId) {
      return {
        direction,
        children: [
          { type: "panel", id: targetId },
          { type: "panel", id: newId },
        ],
      };
    }
    return layout;
  }
  // Branch node — recurse into children
  return {
    ...layout,
    children: layout.children.map(child => splitPanel(child, targetId, newId, direction)),
  };
}

// Remove a panel from the layout tree, collapsing single-child branches
export function removePanel(layout, targetId) {
  if (layout.type === "panel") {
    return layout.id === targetId ? null : layout;
  }
  const newChildren = layout.children
    .map(child => removePanel(child, targetId))
    .filter(Boolean);

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...layout, children: newChildren };
}

// Count total panels in the layout tree
export function countPanels(layout) {
  if (layout.type === "panel") return 1;
  return layout.children.reduce((sum, child) => sum + countPanels(child), 0);
}

// Get all panel IDs from the layout tree
export function getPanelIds(layout) {
  if (layout.type === "panel") return [layout.id];
  return layout.children.flatMap(child => getPanelIds(child));
}
