# Multi-Panel Comparison Feature — Architecture Design

## Overview

Add multi-panel support to TwinkleFitsViewer for side-by-side comparison of FITS files (e.g., different processing stages of the same target). Support 3-4 simultaneous panels with VS Code-style free split layout and synchronized viewing.

## Core Architecture

### Component Refactoring

Extract the current single-file viewer into a reusable `FitsPanel` component. Add a `WorkspaceManager` at the top level to manage layout and cross-panel state.

```
App
├── TopBar (global controls: add panel, split, blink toggle, sync toggle)
├── WorkspaceManager
│   ├── ResizablePanelLayout (react-resizable-panels)
│   │   ├── FitsPanel (id: panel-1)
│   │   ├── FitsPanel (id: panel-2)
│   │   └── FitsPanel (id: panel-3)
```

### FitsPanel Component

Each FitsPanel is a self-contained viewer with:
- Its own FITS file, canvas, stretch params, color map, histogram
- Its own file drop zone / open button
- A small title bar showing filename + a close button
- Awareness of shared sync state (zoom/pan/cursor) from parent

Props:
```typescript
{
  id: string
  syncState: SyncState          // from parent
  onSyncUpdate: (partial) => void  // notify parent of zoom/pan/cursor changes
  isActive: boolean             // has focus
  onActivate: () => void
  onClose: () => void
}
```

### Split Layout

Use `react-resizable-panels` (npm: react-resizable-panels) for draggable split panes.

```bash
npm install react-resizable-panels
```

Panel tree structure:
```javascript
// Example: 3 panels in L-R split, right side split top-bottom
{
  direction: "horizontal",
  children: [
    { type: "panel", id: "panel-1" },
    {
      direction: "vertical",
      children: [
        { type: "panel", id: "panel-2" },
        { type: "panel", id: "panel-3" },
      ]
    }
  ]
}
```

Add buttons in the top bar or each panel's title bar:
- **Split Right** — add a new empty panel to the right of current
- **Split Down** — add a new empty panel below current
- **Close Panel** — remove panel (confirm if file loaded)

## Sync / Linked Viewing

### State Structure

```javascript
const workspaceState = {
  panels: new Map(),  // id -> { fitsData, stretchParams, colorMap, zoom, pan }
  
  sync: {
    zoomPan: true,        // sync zoom & pan across panels
    cursor: true,         // sync crosshair position
  },

  // Shared sync values (updated by whichever panel the user interacts with)
  sharedZoom: "fit",
  sharedPan: { x: 0, y: 0 },
  cursorFitsPos: null,    // { x, y } in FITS pixel coordinates (1-indexed)

  blink: {
    active: false,
    panelIds: [],         // [id1, id2] — which two panels to blink between
    currentIdx: 0,
    intervalMs: 500,
  },

  activePanel: "panel-1",
};
```

### Sync Zoom & Pan

When sync is enabled:
1. User zooms/pans in any panel → that panel calls `onSyncUpdate({ zoom, pan })`
2. WorkspaceManager updates `sharedZoom` and `sharedPan`
3. All other panels receive new syncState and apply it

Important: Use FITS pixel coordinates as the canonical reference, not screen coordinates. This ensures alignment works even when panels have different container sizes.

Add a lock icon (🔗) in the top bar to toggle sync on/off. Visual indicator so user knows sync is active.

### Crosshair Sync

When cursor sync is enabled:
1. User hovers over panel A at FITS position (x, y)
2. Panel A calls `onSyncUpdate({ cursorFitsPos: { x, y } })`
3. All other panels draw a crosshair overlay at that same FITS coordinate

Crosshair rendering: Use a thin overlay canvas or absolute-positioned div. Style: semi-transparent colored lines (e.g., `rgba(255, 107, 107, 0.6)`) so it's visible but not distracting.

When mouse leaves a panel, clear cursorFitsPos to hide crosshairs everywhere.

### Blink Mode

A dedicated comparison mode for rapid toggling between two images at the same position.

Activation:
1. User selects two panels (click panel-1, then shift+click panel-2, or use a "Blink" button)
2. Enter blink mode — one panel expands to fill the blink area
3. Toggle between the two images via:
   - Keyboard: Space or B key
   - Auto-blink: adjustable interval (300ms–2000ms slider)
4. Press Escape or click "Exit Blink" to return to normal layout

Implementation:
- Blink uses a single canvas that alternates between two pre-rendered ImageData buffers
- Both images use the same zoom/pan/stretch for fair comparison
- Show a small label ("A" / "B" or the filenames) so user knows which is currently displayed

## Implementation Priority

### Phase 1: Component Extraction
- [ ] Extract `FitsPanel` from current monolithic viewer
- [ ] Each panel: own file loading, canvas, stretch, histogram, stats
- [ ] Panel title bar with filename and close button
- [ ] Verify single-panel mode works identically to current behavior (no regression)

### Phase 2: Split Layout
- [ ] Install and integrate `react-resizable-panels`
- [ ] Top bar buttons: Split Right, Split Down
- [ ] Each panel can independently open a FITS file
- [ ] Close panel button
- [ ] Minimum 2, maximum 4 panels

### Phase 3: Sync Zoom & Pan
- [ ] SharedZoom / SharedPan state in WorkspaceManager
- [ ] Sync toggle button (🔗) in top bar
- [ ] Any panel's zoom/pan interaction broadcasts to others
- [ ] Use FITS pixel coordinates as canonical reference

### Phase 4: Crosshair Sync
- [ ] Broadcast cursorFitsPos from hovered panel
- [ ] Draw crosshair overlay on all other panels at corresponding FITS position
- [ ] Clear on mouse leave

### Phase 5: Blink Mode
- [ ] Panel selection UI (select two panels to blink)
- [ ] Single canvas alternating between two ImageData buffers
- [ ] Space/B key toggle + auto-blink with adjustable interval
- [ ] Escape to exit

## Notes

- Memory: 3-4 panels of 4144×2822 32-bit float RGB ≈ 500MB. Acceptable for astrophotography rigs (32GB+ RAM typical). No need to optimize this initially.
- The right sidebar (histogram, stats, header, WCS) should show info for the **active** (focused) panel only.
- Each panel maintains independent stretch by default. Sync stretch is NOT included — different processing stages have different data ranges, so forcing the same stretch usually looks wrong.
