import * as THREE from 'three';
import type { VRHotspot, VRScene } from '@/types/vr';
import type { TextureManager } from './textureManager';
import { VR_CONFIG } from './config';

/** A hotspot marker plus its resolved label, living in the scene graph. */
interface HotspotObject {
  hotspot: VRHotspot;
  marker: THREE.Sprite;
  label: THREE.Sprite;
  baseScale: number;
  /** Current hover interpolation 0→1. */
  hover: number;
}

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
      this.group.add(obj.marker);
      this.group.add(obj.label);
    }
    this.setHovered(null);
  }

  /** Per-frame: subtle idle motion + hover interpolation. */
  update(elapsed: number): void {
    for (const obj of this.objects) {
      const target = obj === this.hovered ? 1 : 0;
      obj.hover += (target - obj.hover) * 0.18;

      const pulse =
        obj.hotspot.type === 'navigation'
          ? 1 + Math.sin(elapsed * 2) * 0.04
          : 1 + Math.sin(elapsed * 3 + obj.marker.position.x) * 0.06;

      const scale =
        obj.baseScale *
        pulse *
        (1 + obj.hover * (VR_CONFIG.hotspot.hoverScale - 1));
      obj.marker.scale.setScalar(scale);

      const markerMat = obj.marker.material as THREE.SpriteMaterial;
      markerMat.opacity = 0.72 + obj.hover * 0.28;

      // Labels: nav labels are faintly persistent; product labels appear on hover.
      const labelMat = obj.label.material as THREE.SpriteMaterial;
      const baseOpacity = obj.hotspot.type === 'navigation' ? 0.5 : 0;
      labelMat.opacity = Math.max(baseOpacity, obj.hover);
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

  clear(): void {
    for (const obj of this.objects) {
      this.group.remove(obj.marker);
      this.group.remove(obj.label);
      (obj.marker.material as THREE.SpriteMaterial).dispose();
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
    const accent = hotspot.type === 'navigation' ? '#c9a15a' : '#d8e6ef';
    const markerMat = new THREE.SpriteMaterial({
      map: this.textures.getHotspotTexture(hotspot.type, accent),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const marker = new THREE.Sprite(markerMat);
    marker.position.set(hotspot.position.x, hotspot.position.y, hotspot.position.z);
    marker.renderOrder = 10;

    const baseScale =
      hotspot.type === 'navigation'
        ? VR_CONFIG.hotspot.navScale
        : VR_CONFIG.hotspot.productScale;
    marker.scale.setScalar(baseScale);

    // Label sits just above the marker.
    const labelText = this.resolveLabel(hotspot);
    const labelMat = new THREE.SpriteMaterial({
      map: this.getLabelTexture(labelText),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      opacity: 0,
    });
    const label = new THREE.Sprite(labelMat);
    const dir = marker.position.clone().normalize();
    label.position
      .copy(marker.position)
      .add(new THREE.Vector3(0, baseScale * 0.9, 0))
      .addScaledVector(dir, -0.01);
    // Label aspect: width : height derived from the texture canvas.
    const aspect = (label.material.map!.image as HTMLCanvasElement).width /
      (label.material.map!.image as HTMLCanvasElement).height;
    const labelHeight = 0.22;
    label.scale.set(labelHeight * aspect, labelHeight, 1);
    label.renderOrder = 11;

    return { hotspot, marker, label, baseScale, hover: 0 };
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
