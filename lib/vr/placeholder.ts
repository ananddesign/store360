/**
 * Procedural placeholder assets.
 *
 * V1 ships without real 360° photography, so panoramas, product images and
 * hotspot markers are drawn on a <canvas> at runtime. This keeps the repo free
 * of large binaries while giving each zone a distinct, orientation-testable
 * look (cardinal markers + scene title so "look around" is verifiable).
 *
 * Real assets replace these by pointing scene/product data at a real URL —
 * see data/scenes.ts and data/products.ts.
 */

interface Theme {
  name: string;
  ceiling: string;
  floor: string;
  accent: string;
}

const THEMES: Record<string, Theme> = {
  entrance: { name: 'Entrance', ceiling: '#1a1712', floor: '#050505', accent: '#c9a15a' },
  lobby: { name: 'Lobby', ceiling: '#171a1c', floor: '#050607', accent: '#d8c48a' },
  'main-showroom': { name: 'Main Showroom', ceiling: '#1c1a17', floor: '#060606', accent: '#e4cd9a' },
  'diamond-bar': { name: 'Diamond Bar', ceiling: '#141a1e', floor: '#050708', accent: '#d8e6ef' },
  bridal: { name: 'Bridal', ceiling: '#1e1a1a', floor: '#080606', accent: '#e8d3c4' },
  'high-jewellery': { name: 'High Jewellery', ceiling: '#1a1620', floor: '#070509', accent: '#c9a1d0' },
  consultation: { name: 'Consultation', ceiling: '#191919', floor: '#060606', accent: '#b9b3a4' },
  'private-lounge': { name: 'Private Lounge', ceiling: '#1d1712', floor: '#080604', accent: '#caa06a' },
};

const DEFAULT_THEME: Theme = {
  name: 'QWEEN',
  ceiling: '#181818',
  floor: '#050505',
  accent: '#c9a15a',
};

/** Parse "placeholder://main-showroom" → theme key. Returns null if not a placeholder. */
export function parsePlaceholderKey(source: string): string | null {
  const match = source.match(/^placeholder:\/\/(.+)$/);
  return match ? match[1]! : null;
}

export function isPlaceholderSource(source: string): boolean {
  return source.startsWith('placeholder://');
}

/**
 * Draw an equirectangular (2:1) panorama for a themed room. Cardinal markers
 * (N/E/S/W) sit on the horizon so orientation is obvious while looking around.
 */
export function createPanoramaCanvas(themeKey: string): HTMLCanvasElement {
  const theme = THEMES[themeKey] ?? DEFAULT_THEME;
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Vertical gradient: ceiling → horizon glow → floor.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, theme.ceiling);
  grad.addColorStop(0.46, theme.ceiling);
  grad.addColorStop(0.5, mix(theme.ceiling, theme.accent, 0.16));
  grad.addColorStop(0.54, theme.floor);
  grad.addColorStop(1, theme.floor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Longitude/latitude grid — faint, evokes a structured room.
  ctx.strokeStyle = hexA(theme.accent, 0.08);
  ctx.lineWidth = 1;
  for (let lon = 0; lon < 360; lon += 15) {
    const x = (lon / 360) * W;
    line(ctx, x, 0, x, H);
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    line(ctx, 0, y, W, y);
  }

  // Horizon line, a touch brighter.
  ctx.strokeStyle = hexA(theme.accent, 0.35);
  ctx.lineWidth = 2;
  line(ctx, 0, H / 2, W, H / 2);

  // Cardinal + intercardinal markers on the horizon.
  const marks: Array<[number, string]> = [
    [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ];
  for (const [lon, label] of marks) {
    const x = (lon / 360) * W;
    ctx.fillStyle = hexA(theme.accent, label.length === 1 ? 0.9 : 0.4);
    ctx.font = `600 ${label.length === 1 ? 34 : 22}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, H / 2 - 44);
    // Tick.
    ctx.fillRect(x - 1, H / 2 - 14, 2, 28);
  }

  // Scene title, placed front and back so it's easy to find.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cx of [W * 0.5, W * 0.0 + 2, W]) {
    ctx.fillStyle = hexA(theme.accent, 0.85);
    ctx.font = '300 64px Georgia, serif';
    ctx.fillText(theme.name, cx, H * 0.4);
    ctx.fillStyle = hexA('#ffffff', 0.25);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText('QWEEN · PLACEHOLDER 360°', cx, H * 0.4 + 52);
  }

  // Soft vignette top & bottom for a premium falloff.
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, hexA('#000000', 0.55));
  vg.addColorStop(0.5, hexA('#000000', 0));
  vg.addColorStop(1, hexA('#000000', 0.7));
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}

/** Placeholder product image — dark studio card with a gem glyph. */
export function createProductCanvas(key: string): HTMLCanvasElement {
  const W = 512;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.8);
  bg.addColorStop(0, '#1b1b1e');
  bg.addColorStop(1, '#0a0a0b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Diamond glyph.
  const cx = W / 2;
  const cy = H * 0.42;
  const r = 96;
  const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, r * 1.8);
  glow.addColorStop(0, hexA('#d8e6ef', 0.5));
  glow.addColorStop(1, hexA('#d8e6ef', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);

  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.8, cy - r * 0.2);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.8, cy - r * 0.2);
  ctx.closePath();
  ctx.strokeStyle = hexA('#e4cd9a', 0.85);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = hexA('#d8e6ef', 0.14);
  ctx.fill();
  // Facet lines.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.8, cy - r * 0.2);
  ctx.lineTo(cx + r * 0.8, cy - r * 0.2);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.strokeStyle = hexA('#e4cd9a', 0.35);
  ctx.stroke();

  ctx.fillStyle = hexA('#8a8a92', 0.7);
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`PLACEHOLDER · ${key.toUpperCase()}`, cx, H * 0.82);

  return canvas;
}

/**
 * Hotspot marker sprite. Navigation = diamond ring; product = compact sparkle.
 * Returns a square canvas with a transparent background and a soft glow.
 */
export function createHotspotSprite(
  kind: 'navigation' | 'product',
  accent = '#c9a15a',
): HTMLCanvasElement {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const c = S / 2;

  // Soft radial glow.
  const glow = ctx.createRadialGradient(c, c, 2, c, c, c);
  glow.addColorStop(0, hexA(accent, kind === 'navigation' ? 0.45 : 0.35));
  glow.addColorStop(1, hexA(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = hexA(accent, 0.95);
  ctx.fillStyle = hexA('#ffffff', 0.9);

  if (kind === 'navigation') {
    // Outer diamond ring.
    const r = 70;
    ctx.lineWidth = 5;
    diamond(ctx, c, c, r);
    ctx.stroke();
    // Inner filled diamond.
    ctx.fillStyle = hexA(accent, 0.85);
    diamond(ctx, c, c, r * 0.34);
    ctx.fill();
  } else {
    // Four-point sparkle.
    ctx.strokeStyle = hexA('#ffffff', 0.9);
    ctx.lineWidth = 4;
    const r = 48;
    ctx.beginPath();
    ctx.moveTo(c, c - r); ctx.lineTo(c, c + r);
    ctx.moveTo(c - r, c); ctx.lineTo(c + r, c);
    ctx.stroke();
    ctx.fillStyle = hexA(accent, 0.9);
    ctx.beginPath();
    ctx.arc(c, c, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

/* --------------------------- tiny 2D helpers --------------------------- */

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

/** Convert #rrggbb + alpha → rgba() string. */
function hexA(hex: string, alpha: number): string {
  const { r, g, b } = toRGB(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Linear blend of two hex colours. */
function mix(a: string, b: string, t: number): string {
  const ca = toRGB(a);
  const cb = toRGB(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function toRGB(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}
