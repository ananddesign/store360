import * as THREE from 'three';
import type { VRHotspot, VRScene } from '@/types/vr';
import type { TextureManager } from './textureManager';
import { VR_CONFIG } from './config';
import { FloorHotspot } from './floorHotspot';

/** A hotspot's visual(s) plus its resolved label, living in the scene graph. */
interface HotspotObject {
  hotspot: VRHotspot;
  /** Raycast target: the billboard sprite, or a floor pad's hit disc. */
  marker: THREE.Object3D;
  /** Billboard visual (billboard-style hotspots). */
  sprite?: THREE.Sprite;
  /** Floor-projection visual (floor-style hotspots). */
  floor?: FloorHotspot;
  label: THREE.Sprite;
  baseScale: number;
  /** Current hover interpolation 0→1. */
  hover: number;
}

const FLOOR_COLOR = '#9fe4ff';

/**
 * Owns the 3D hotspot markers for the current scene: creation, hover
 * highlight, labels and ray hit-testing. Markers are billboarded sprites so
 * they always face the user, and they sit in world space so they stay pinned
 * to the panorama as the user looks around.
 */
export class HotspotManager {
  readonly group = new THREE.Group();
  private objects: HotspotObject[] = [];
  private labelTextures = new Map<string, THREE.Texture>();
  private hovered: HotspotObject | null = null;

  constructor(
    private readonly textures: TextureManager,
    /** Resolve a product hotspot's display label (product name). */
    private readonly resolveLabel: (hotspot: VRHotspot) => string,
  ) {
    this.group.name = 'hotspots';
  }

  /** Rebuild markers for a scene. Disposes the previous scene's markers. */
  setScene(scene: VRScene): void {
    this.clear();
    for (const hotspot of scene.hotspots) {
      this.objects.push(this.createObject(hotspot));
    }
    for (const obj of this.objects) {
      this.group.add(obj.floor ? obj.floor.group : obj.sprite!);
      this.group.add(obj.label);
    }
    this.setHovered(null);
  }

  /** Per-frame: subtle idle motion + hover interpolation. */
  update(elapsed: number): void {
    for (const obj of this.objects) {
      const target = obj === this.hovered ? 1 : 0;
      obj.hover += (target - obj.hover) * 0.18;

      if (obj.floor) {
        // Floor pad owns its own (flat, slow, architectural) animation.
        obj.floor.update(elapsed, obj.hover);
      } else if (obj.sprite) {
        const pulse =
          obj.hotspot.type === 'navigation'
            ? 1 + Math.sin(elapsed * 2) * 0.04
            : 1 + Math.sin(elapsed * 3 + obj.sprite.position.x) * 0.06;

        const scale =
          obj.baseScale *
          pulse *
          (1 + obj.hover * (VR_CONFIG.hotspot.hoverScale - 1));
        obj.sprite.scale.setScalar(scale);

        const markerMat = obj.sprite.material as THREE.SpriteMaterial;
        markerMat.opacity = 0.72 + obj.hover * 0.28;
      }

      // Labels reveal only on hover/tap — the marker itself is the minimal,
      // always-visible navigation cue (§2: "no large arrows or game-like UI").
      const labelMat = obj.label.material as THREE.SpriteMaterial;
      labelMat.opacity = obj.hover;
      obj.label.visible = labelMat.opacity > 0.02;
    }
  }

  /** Ray hit-test against markers only. Returns the hotspot data + object. */
  raycast(raycaster: THREE.Raycaster): { hotspot: VRHotspot; object: THREE.Object3D } | null {
    const markers = this.objects.map((o) => o.marker);
    const hits = raycaster.intersectObjects(markers, false);
    const first = hits[0];
    if (!first) return null;
    const obj = this.objects.find((o) => o.marker === first.object);
    return obj ? { hotspot: obj.hotspot, object: obj.marker } : null;
  }

  /** Highlight the hotspot backing `object`, or clear when null. */
  setHovered(object: THREE.Object3D | null): boolean {
    const next = object
      ? this.objects.find((o) => o.marker === object) ?? null
      : null;
    const changed = next !== this.hovered;
    this.hovered = next;
    return changed;
  }

  hoveredHotspot(): VRHotspot | null {
    return this.hovered?.hotspot ?? null;
  }

  /**
   * Editor (§?edit=true): move the hotspot backing `marker` to a new world
   * position — updates the visual (floor pad or sprite) + its label and mutates
   * the underlying hotspot data so the change persists across navigation in the
   * session (and is exportable). No-op if the marker isn't found.
   */
  moveHotspotObject(marker: THREE.Object3D, pos: { x: number; y: number; z: number }): void {
    const obj = this.objects.find((o) => o.marker === marker);
    if (!obj) return;
    if (obj.floor) obj.floor.group.position.set(pos.x, pos.y, pos.z);
    else if (obj.sprite) obj.sprite.position.set(pos.x, pos.y, pos.z);

    // Re-place the hover label above the new position (mirrors createLabel).
    const at = new THREE.Vector3(pos.x, pos.y, pos.z);
    const up = obj.floor ? 1.0 : obj.baseScale * 0.9;
    const dir = at.clone().normalize();
    obj.label.position
      .copy(at)
      .add(new THREE.Vector3(0, up, 0))
      .addScaledVector(dir, -0.01);

    // Mutate the shared hotspot data (its position object is per-hotspot).
    obj.hotspot.position.x = pos.x;
    obj.hotspot.position.y = pos.y;
    obj.hotspot.position.z = pos.z;
  }

  clear(): void {
    for (const obj of this.objects) {
      if (obj.floor) {
        this.group.remove(obj.floor.group);
        obj.floor.dispose();
      } else if (obj.sprite) {
        this.group.remove(obj.sprite);
        (obj.sprite.material as THREE.SpriteMaterial).dispose();
      }
      this.group.remove(obj.label);
      (obj.label.material as THREE.SpriteMaterial).dispose();
    }
    this.objects = [];
    this.hovered = null;
  }

  dispose(): void {
    this.clear();
    for (const t of this.labelTextures.values()) t.dispose();
    this.labelTextures.clear();
  }

  /* ------------------------------ internals ----------------------------- */

  private createObject(hotspot: VRHotspot): HotspotObject {
    const pos = new THREE.Vector3(hotspot.position.x, hotspot.position.y, hotspot.position.z);

    // Floor-projection ("floor pad") variant — a flat, floor-anchored marker.
    if (hotspot.type === 'navigation' && hotspot.style === 'floor') {
      const floor = new FloorHotspot({ position: pos, color: hotspot.color ?? FLOOR_COLOR });
      // Label floats above the pad so it stays readable off the ground.
      const label = this.createLabel(this.resolveLabel(hotspot), pos, 1.0);
      return { hotspot, marker: floor.hitMesh, floor, label, baseScale: 1, hover: 0 };
    }

    // Billboard variant — the camera-facing diamond / sparkle sprite.
    const accent = hotspot.type === 'navigation' ? '#c9a15a' : '#d8e6ef';
    const markerMat = new THREE.SpriteMaterial({
      map: this.textures.getHotspotTexture(hotspot.type, accent),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(markerMat);
    sprite.position.copy(pos);
    sprite.renderOrder = 10;

    const baseScale =
      hotspot.type === 'navigation'
        ? VR_CONFIG.hotspot.navScale
        : VR_CONFIG.hotspot.productScale;
    sprite.scale.setScalar(baseScale);

    const label = this.createLabel(this.resolveLabel(hotspot), pos, baseScale * 0.9);
    return { hotspot, marker: sprite, sprite, label, baseScale, hover: 0 };
  }

  /**
   * Build a hover-revealed label sprite floating `up` metres above a world
   * point, pulled a hair toward the camera so it never clips into its marker.
   */
  private createLabel(text: string, at: THREE.Vector3, up: number): THREE.Sprite {
    const labelMat = new THREE.SpriteMaterial({
      map: this.getLabelTexture(text),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });
    const label = new THREE.Sprite(labelMat);
    const dir = at.clone().normalize();
    label.position
      .copy(at)
      .add(new THREE.Vector3(0, up, 0))
      .addScaledVector(dir, -0.01);
    const img = labelMat.map!.image as HTMLCanvasElement;
    const aspect = img.width / img.height;
    const labelHeight = 0.22;
    label.scale.set(labelHeight * aspect, labelHeight, 1);
    label.renderOrder = 11;
    return label;
  }

  private getLabelTexture(text: string): THREE.Texture {
    const cached = this.labelTextures.get(text);
    if (cached) return cached;

    const pad = 28;
    const fontSize = 40;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(text.toUpperCase());
    const w = Math.ceil(metrics.width) + pad * 2;
    const h = fontSize + pad * 1.4;
    canvas.width = w;
    canvas.height = h;

    // Rounded pill background.
    const ctx2 = canvas.getContext('2d')!;
    ctx2.clearRect(0, 0, w, h);
    roundRect(ctx2, 1, 1, w - 2, h - 2, h / 2);
    ctx2.fillStyle = 'rgba(10,10,11,0.72)';
    ctx2.fill();
    ctx2.lineWidth = 1.5;
    ctx2.strokeStyle = 'rgba(201,161,90,0.5)';
    ctx2.stroke();

    ctx2.font = `500 ${fontSize}px system-ui, sans-serif`;
    ctx2.fillStyle = '#e4cd9a';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    // Letterspacing for the brand feel.
    drawSpacedText(ctx2, text.toUpperCase(), w / 2, h / 2 + 1, 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.labelTextures.set(text, tex);
    return tex;
  }
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

function drawSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  spacing: number,
) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i]!, x, cy);
    x += widths[i]!;
  }
}
