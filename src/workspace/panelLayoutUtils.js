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
