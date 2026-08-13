import * as THREE from 'three';
import type { VRProduct } from '@/types/vr';
import type { TextureManager } from './textureManager';
import { VR_CONFIG } from './config';

export type PanelAction = 'pdp' | 'close';

/**
 * A spatial, VR-friendly product panel (§13) rendered as real 3D geometry so it
 * appears inside the headset — not a DOM card. It is placed ~1.85m in front of
 * the user, faces them, and stays put (no head-following) for comfort.
 *
 * Layout:
 *   ┌───────────────┐
 *   │  PRODUCT IMG  │
 *   │  NAME · SPEC  │
 *   │  ₹ PRICE      │
 *   │ [View] [Close]│
 *   └───────────────┘
 */
export class ProductPanel3D {
  readonly group = new THREE.Group();
  private backdrop: THREE.Mesh;
  private image: THREE.Mesh;
  private buttons: THREE.Mesh[] = [];
  private hoveredAction: PanelAction | null = null;
  private currentProduct: VRProduct | null = null;

  constructor(private readonly textures: TextureManager) {
    this.group.name = 'product-panel';
    this.group.visible = false;

    const { width, height } = VR_CONFIG.productPanel;

    // Backdrop (regenerated per product for the text).
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.backdrop.renderOrder = 20;
    this.group.add(this.backdrop);

    // Product image plane (upper region).
    const imgW = width * 0.6;
    const imgH = imgW;
    this.image = new THREE.Mesh(
      new THREE.PlaneGeometry(imgW, imgH),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }),
    );
    this.image.position.set(0, height * 0.2, 0.001);
    this.image.renderOrder = 21;
    this.group.add(this.image);

    // Buttons.
    this.buttons.push(this.makeButton('View Jewellery', 'pdp', true));
    this.buttons.push(this.makeButton('Close', 'close', false));
    const bw = width * 0.86;
    this.buttons[0]!.position.set(0, -height * 0.34, 0.002);
    this.buttons[1]!.position.set(0, -height * 0.45, 0.002);
    for (const b of this.buttons) {
      b.geometry = new THREE.PlaneGeometry(bw, height * 0.085);
      b.renderOrder = 22;
      this.group.add(b);
    }
  }

  isOpen(): boolean {
    return this.group.visible;
  }

  product(): VRProduct | null {
    return this.currentProduct;
  }

  /** Show the panel for a product at `position`, facing `lookAt`. */
  show(product: VRProduct, position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.currentProduct = product;

    // Backdrop text.
    const mat = this.backdrop.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = new THREE.CanvasTexture(this.renderBackdrop(product));
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = 4;
    mat.needsUpdate = true;

    // Product image.
    const imgMat = this.image.material as THREE.MeshBasicMaterial;
    imgMat.map = this.textures.getProductTexture(product.image);
    imgMat.needsUpdate = true;

    this.group.position.copy(position);
    this.group.lookAt(lookAt);
    this.group.visible = true;
    this.setHoveredAction(null);
  }

  hide(): void {
    this.group.visible = false;
    this.currentProduct = null;
    this.setHoveredAction(null);
  }

  /** Hit-test buttons. Returns the action under the ray, or null. */
  raycast(raycaster: THREE.Raycaster): PanelAction | null {
    if (!this.group.visible) return null;
    const hits = raycaster.intersectObjects(this.buttons, false);
    const first = hits[0];
    if (!first) return null;
    return (first.object.userData.action as PanelAction) ?? null;
  }

  /** Highlight the hovered button. */
  setHoveredAction(action: PanelAction | null): void {
    this.hoveredAction = action;
    for (const b of this.buttons) {
      const primary = b.userData.primary as boolean;
      const isHover = b.userData.action === action;
      const m = b.material as THREE.MeshBasicMaterial;
      if (primary) {
        m.opacity = isHover ? 1 : 0.92;
      } else {
        m.opacity = isHover ? 0.9 : 0.6;
      }
    }
  }

  hovered(): PanelAction | null {
    return this.hoveredAction;
  }

  dispose(): void {
    (this.backdrop.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.backdrop.material as THREE.MeshBasicMaterial).dispose();
    this.backdrop.geometry.dispose();
    (this.image.material as THREE.MeshBasicMaterial).dispose();
    this.image.geometry.dispose();
    for (const b of this.buttons) {
      (b.material as THREE.MeshBasicMaterial).map?.dispose();
      (b.material as THREE.MeshBasicMaterial).dispose();
      b.geometry.dispose();
    }
  }

  /* ------------------------------ internals ----------------------------- */

  private makeButton(text: string, action: PanelAction, primary: boolean): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    roundRect(ctx, 2, 2, 508, 124, 62);
    if (primary) {
      ctx.fillStyle = '#c9a15a';
      ctx.fill();
      ctx.fillStyle = '#0a0a0b';
    } else {
      ctx.strokeStyle = 'rgba(201,161,90,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e4cd9a';
    }
    ctx.font = '500 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        opacity: primary ? 0.92 : 0.6,
      }),
    );
    mesh.userData.action = action;
    mesh.userData.primary = primary;
    return mesh;
  }

  private renderBackdrop(product: VRProduct): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    // 2:2.55 aspect to match 1.1 x 1.4 panel.
    canvas.width = 620;
    canvas.height = 788;
    const ctx = canvas.getContext('2d')!;

    // Panel body.
    roundRect(ctx, 6, 6, 608, 776, 34);
    const g = ctx.createLinearGradient(0, 0, 0, 788);
    g.addColorStop(0, 'rgba(23,23,26,0.96)');
    g.addColorStop(1, 'rgba(10,10,11,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(201,161,90,0.35)';
    ctx.stroke();

    // Text block (image plane overlays the top region separately).
    const cx = 310;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#f4ecda';
    ctx.font = '300 46px Georgia, serif';
    ctx.fillText(product.name, cx, 470);

    if (product.spec) {
      ctx.fillStyle = 'rgba(138,138,146,0.95)';
      ctx.font = '500 24px system-ui, sans-serif';
      ctx.fillText(product.spec, cx, 524);
    }

    ctx.fillStyle = '#c9a15a';
    ctx.font = '400 40px Georgia, serif';
    ctx.fillText(formatPrice(product.price, product.currency), cx, 590);

    return canvas;
  }
}

function formatPrice(price: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
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
