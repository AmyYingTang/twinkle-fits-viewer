# Twinkle FITS Viewer ✦

A browser-based FITS file viewer for astrophotography. Inspect stacked masters and processed results with proper autostretch, multi-panel comparison, WCS coordinates, and export. Also available as a mobile PWA — install it on your phone from a single link.

**Live app:** `https://YOUR_DOMAIN_HERE`

## Quick Start

### Desktop

Open `YOUR_DOMAIN_HERE` in any modern browser. Drag & drop a `.fits` file onto the viewer — done.

### Mobile

1. Open `YOUR_DOMAIN_HERE` in Safari (iOS) or Chrome (Android)
2. **Install as app** — tap **Share → Add to Home Screen** (Safari) or **⋮ → Add to Home screen** (Chrome)
3. Open from the home screen icon — it runs full-screen, **works offline**, and auto-updates when new versions are deployed
4. Tap `OPEN` to load a FITS file from your device

## Features

- **Open & view FITS files** — Supports mono and RGB images, 8/16/32-bit integer and 32/64-bit float
- **Automatic stretch** — Images are auto-stretched on open using the same algorithm as Siril and PixInsight
- **Manual stretch** — Fine-tune Shadow, Midtone, and Highlight with sliders and real-time preview
- **Live histogram** — See the pixel distribution with stretch markers overlaid
- **Statistics** — Min, Max, Mean, Median, MAD, and σ for each channel
- **Sky coordinates** — If your FITS file has WCS data, RA/Dec is shown on hover. Optional coordinate grid overlay
- **Export** — Save as PNG (8-bit, quick share) or TIFF (16-bit, preserves dynamic range)
- **Color maps** — Grayscale, Heat, Cool for mono images
- **Zoom & Pan** — Fit / 0.5× / 1× / 2× / 4× / scroll wheel, drag to pan
- **Multi-panel comparison** (desktop) — Split view up to 4 panels, sync zoom/pan, crosshair linking, blink mode
- **Mobile PWA** — Single-panel viewer with pinch zoom, long-press pixel info, bottom sheet controls. Works offline

## Usage

### Desktop

1. **Open** — Drag & drop a `.fits` file onto any panel, or click `OPEN FITS`
2. **Stretch** — Autostretch is applied automatically. Switch to `MANUAL` for fine control
3. **Compare** — Split the view (Split Right / Split Down) to open multiple files side by side
4. **Sync** — Enable `SYNC` to lock zoom/pan across panels, `CURSOR` for crosshair linking
5. **Blink** — Select two panels and enable `BLINK` to toggle between them
6. **Inspect** — Hover over pixels to see coordinates and raw values. If WCS data is present, RA/Dec is shown
7. **Grid** — Click `GRID` (appears when WCS is detected) to overlay RA/Dec coordinate lines
8. **Export** — Click `EXPORT` → choose PNG (8-bit) or TIFF (16-bit)
9. **Header** — Click `HDR` to browse all FITS header keywords

### Mobile

1. Visit `YOUR_DOMAIN_HERE` in Safari (iOS) or Chrome (Android)
2. Open a FITS file from your device
3. Pinch to zoom, drag to pan
4. Long press on the image to see pixel values and coordinates
5. Use the bottom tabs to access Stretch, Stats, and Header panels

### Controls

**Desktop:**

| Action | Control |
|--------|---------|
| Zoom in/out | Scroll wheel |
| Pan | Drag (when zoomed in) |
| Pixel inspect | Mouse hover |
| Blink toggle | Space or B (in blink mode) |
| Exit blink | Escape |

**Mobile:**

| Action | Control |
|--------|---------|
| Zoom in/out | Pinch |
| Pan | Two-finger drag |
| Pixel inspect | Long press |

## File Compatibility

| Format | Supported |
|--------|-----------|
| 32-bit float (BITPIX -32) | ✅ Primary target |
| 64-bit float (BITPIX -64) | ✅ |
| 16-bit int (BITPIX 16) | ✅ With BZERO/BSCALE |
| 32-bit int (BITPIX 32) | ✅ With BZERO/BSCALE |
| 8-bit (BITPIX 8) | ✅ |
| RGB (NAXIS3 = 3) | ✅ Per-channel stretch |
| WCS (TAN projection) | ✅ |
| WCS (linear) | ✅ |
| Compressed FITS (.fz) | ❌ Not yet |

## Privacy

All FITS files are processed locally in your browser. Nothing is uploaded to any server. The Cloudflare Pages deployment only serves the static app code.

---

## For Developers

### Tech Stack

- **Framework:** React + Vite
- **FITS parsing:** Custom pure-JS parser (no dependencies)
- **Rendering:** HTML5 Canvas (CPU)
- **Split layout:** react-resizable-panels
- **PWA:** vite-plugin-pwa (Service Worker + manifest)
- **Hosting:** Cloudflare Pages (free tier)

### Local Development

```bash
git clone https://github.com/YOUR_USERNAME/twinkle-fits-viewer.git
cd twinkle-fits-viewer
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
```

Static output in `dist/`. Cloudflare Pages runs this automatically on every push to `main`.

### Deployment (Cloudflare Pages)

The app is deployed on Cloudflare Pages with these settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | 18+ |

Auto-deploy is connected to the `main` branch. Every `git push origin main` triggers a new deployment. Cloudflare provides a default URL (`*.pages.dev`) and a custom domain is configured to point to it.

```
GitHub repo  →  git push  →  Cloudflare Pages auto-build  →  live at YOUR_DOMAIN_HERE
```

### Custom Domain

The custom domain `YOUR_DOMAIN_HERE` is managed via Cloudflare DNS. Configuration is in Cloudflare Pages → Custom domains.

### Roadmap

- [ ] Astrometry.net plate solving integration (auto-annotate deep sky objects)
- [ ] WebGL rendering for large files (GPU-accelerated stretch)
- [ ] Measurement tools (angular distance, FWHM)
- [ ] SIP distortion correction for WCS
- [ ] Electron / Tauri packaging for native desktop app

## License

Copyright © 2026 Ying Tang. Free for personal and non-commercial use. Commercial use requires authorisation — see [LICENSE](./LICENSE) for details.
