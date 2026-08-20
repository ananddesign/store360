import * as THREE from 'three';

/** Mirrors engine.ts's `ViewTuning` shape (kept structurally, not imported,
 *  to avoid a circular module dependency between engine.ts and this file). */
export interface VRTuning {
  eyeHeight: number;
  pitchLimitDeg: number;
  panoramaRadius: number;
  initialPitchDeg: number;
  initialYawDeg: number;
}

export type ViewControlAction =
  | { kind: 'step'; field: keyof VRTuning; dir: 1 | -1 }
  | { kind: 'reset' };

interface Row {
  key: keyof VRTuning;
  label: string;
  unit: string;
  decimals: number;
}

const ROWS: Row[] = [
  { key: 'eyeHeight', label: 'Eye Height', unit: 'm', decimals: 2 },
  { key: 'pitchLimitDeg', label: 'Vertical View / Pitch', unit: '°', decimals: 0 },
  { key: 'panoramaRadius', label: 'Panorama Radius', unit: '', decimals: 0 },
  { key: 'initialPitchDeg', label: 'Initial Pitch', unit: '°', decimals: 0 },
  { key: 'initialYawDeg', label: 'Initial Yaw', unit: '°', decimals: 0 },
];

// Canvas ⇄ physical-metres layout. Aspect matches exactly so the conversion
// scale is uniform (no distortion).
const CW = 640;
const CH = 800;
const W = 1.0;
const H = 1.25;
const SCALE = W / CW; // === H / CH

const ROW_Y = [175, 290, 405, 520, 635];
const MINUS_X = 415;
const PLUS_X = 585;
const VALUE_X = 500;
const BUTTON_PX = 60;
const RESET_RECT = { x: 40, y: 690, w: 560, h: 70 };

function toLocalX(cx: number): number {
  return (cx - CW / 2) * SCALE;
}
function toLocalY(cy: number): number {
  return (CH / 2 - cy) * SCALE;
}

/**
 * In-scene (real 3D geometry) "View Controls" panel — the WebXR-visible
 * counterpart to the 2D `ViewControlsPanel` component. A DOM overlay is never
 * composited into an immersive session, so the only way to see/use this while
 * actually wearing the headset is genuine scene geometry, exactly like the
 * existing `ProductPanel3D`.
 *
 * Interaction is tap-to-step (−/+ per row) rather than drag, since precise
 * continuous dragging via a controller ray is uncomfortable in practice —
 * discrete steppers are the more reliable, comfortable VR pattern. Step sizes
 * are coarser than the desktop panel's slider `step` (see engine.ts's
 * `stepViewTuning`), so a full sweep across a range takes a manageable number
 * of taps.
 */
export class ViewControlsPanel3D {
  readonly group = new THREE.Group();
  private backdrop: THREE.Mesh;
  private interactive: THREE.Mesh[] = [];
  private hoveredObject: THREE.Object3D | null = null;
  private canvas = document.createElement('canvas');

  constructor() {
    this.group.name = 'view-controls-panel-3d';
    this.group.visible = false;
    this.canvas.width = CW;
    this.canvas.height = CH;

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.backdrop.renderOrder = 25;
    this.group.add(this.backdrop);

    ROWS.forEach((row, i) => {
      const y = toLocalY(ROW_Y[i]!);
      const minus = this.makeStepButton('−', { kind: 'step', field: row.key, dir: -1 });
      minus.position.set(toLocalX(MINUS_X), y, 0.002);
      const plus = this.makeStepButton('+', { kind: 'step', field: row.key, dir: 1 });
      plus.position.set(toLocalX(PLUS_X), y, 0.002);
      this.group.add(minus, plus);
      this.interactive.push(minus, plus);
    });

    const reset = this.makeWideButton('Reset', { kind: 'reset' });
    reset.position.set(
      toLocalX(RESET_RECT.x + RESET_RECT.w / 2),
      toLocalY(RESET_RECT.y + RESET_RECT.h / 2),
      0.002,
    );
    this.group.add(reset);
    this.interactive.push(reset);
  }

  isOpen(): boolean {
    return this.group.visible;
  }

  /** Show at `position`, facing `lookAt`, with the given live values drawn in. */
  show(tuning: VRTuning, position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.updateValues(tuning);
    this.group.position.copy(position);
    this.group.lookAt(lookAt);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.setHovered(null);
  }

  /** Redraw the backdrop with fresh numbers (button positions never change). */
  updateValues(tuning: VRTuning): void {
    this.renderBackdrop(tuning);
    const mat = this.backdrop.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = configureTextTexture(new THREE.CanvasTexture(this.canvas));
    mat.needsUpdate = true;
  }

  /** Hit-test the stepper/reset buttons. */
  raycast(raycaster: THREE.Raycaster): { action: ViewControlAction; object: THREE.Object3D } | null {
    if (!this.group.visible) return null;
    const hits = raycaster.intersectObjects(this.interactive, false);
    const first = hits[0];
    if (!first) return null;
    return { action: first.object.userData.action as ViewControlAction, object: first.object };
  }

  /** Highlight whichever button object is currently under the ray (or null). */
  setHovered(object: THREE.Object3D | null): void {
    this.hoveredObject = object;
    for (const b of this.interactive) {
      const isHover = b === object;
      const base = b.userData.baseOpacity as number;
      (b.material as THREE.MeshBasicMaterial).opacity = isHover ? 1 : base;
      b.scale.setScalar(isHover ? 1.08 : 1);
    }
  }

  hoveredAction(): ViewControlAction | null {
    if (!this.hoveredObject) return null;
    return (this.hoveredObject.userData.action as ViewControlAction) ?? null;
  }

  dispose(): void {
    (this.backdrop.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.backdrop.material as THREE.MeshBasicMaterial).dispose();
    this.backdrop.geometry.dispose();
    for (const b of this.interactive) {
      (b.material as THREE.MeshBasicMaterial).map?.dispose();
      (b.material as THREE.MeshBasicMaterial).dispose();
      b.geometry.dispose();
    }
  }

  /* ------------------------------ internals ----------------------------- */

  private makeStepButton(glyph: string, action: ViewControlAction): THREE.Mesh {
    const S = 128;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 56, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(201,161,90,0.16)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(201,161,90,0.75)';
    ctx.stroke();
    ctx.fillStyle = '#e4cd9a';
    ctx.font = '600 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, S / 2, S / 2 + 2);

    const tex = configureTextTexture(new THREE.CanvasTexture(canvas));
    const size = BUTTON_PX * SCALE;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.85 }),
    );
    mesh.userData.action = action;
    mesh.userData.baseOpacity = 0.85;
    mesh.renderOrder = 26;
    return mesh;
  }

  private makeWideButton(text: string, action: ViewControlAction): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(64, 4);
    ctx.arcTo(508, 4, 508, 124, 60);
    ctx.arcTo(508, 124, 4, 124, 60);
    ctx.arcTo(4, 124, 4, 4, 60);
    ctx.arcTo(4, 4, 508, 4, 60);
    ctx.closePath();
    ctx.fillStyle = '#c9a15a';
    ctx.fill();
    ctx.fillStyle = '#0a0a0b';
    ctx.font = '500 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);

    const tex = configureTextTexture(new THREE.CanvasTexture(canvas));
    const w = RESET_RECT.w * SCALE;
    const h = RESET_RECT.h * SCALE;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.92 }),
    );
    mesh.userData.action = action;
    mesh.userData.baseOpacity = 0.92;
    mesh.renderOrder = 26;
    return mesh;
  }

  private renderBackdrop(tuning: VRTuning): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CW, CH);

    roundRect(ctx, 6, 6, CW - 12, CH - 12, 34);
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, 'rgba(23,23,26,0.96)');
    g.addColorStop(1, 'rgba(10,10,11,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(201,161,90,0.35)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e4cd9a';
    ctx.font = '300 40px Georgia, serif';
    ctx.fillText('VIEW CONTROLS', CW / 2, 70);

    ctx.strokeStyle = 'rgba(201,161,90,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(50, 100);
    ctx.lineTo(CW - 50, 100);
    ctx.stroke();

    ROWS.forEach((row, i) => {
      const y = ROW_Y[i]!;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d8e6ef';
      ctx.font = '500 26px system-ui, sans-serif';
      ctx.fillText(row.label, 40, y + 9);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#c9a15a';
      ctx.font = '700 34px system-ui, sans-serif';
      ctx.fillText(`${tuning[row.key].toFixed(row.decimals)}${row.unit}`, VALUE_X, y + 11);
    });

    // Reset button's own label is drawn on its own mesh texture, not here.
  }
}

/**
 * Text on a canvas texture minifies to illegible mush under THREE's default
 * trilinear mipmapping once it's small on screen (confirmed: digits like "6"
 * become misreadable as "8" at this panel's ~1.9m viewing distance) —
 * disabling mipmaps and sampling linearly keeps numbers crisp and correct at
 * any distance, matching the panorama sphere's own texture setup.
 */
function configureTextTexture(tex: THREE.CanvasTexture): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
