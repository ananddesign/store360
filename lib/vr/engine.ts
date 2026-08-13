import * as THREE from 'three';
import type { CameraOrientation, VRHotspot, VRScene } from '@/types/vr';
import { getProductById } from '@/data/products';
import { TextureManager } from './textureManager';
import { HotspotManager } from './hotspotManager';
import { SceneManager } from './sceneManager';
import { ProductPanel3D, type PanelAction } from './productPanel';
import { VR_CONFIG, DEG2RAD } from './config';

export interface DebugInfo {
  sceneId: string | null;
  fps: number;
  xr: 'inactive' | 'active';
  cameraPosition: [number, number, number];
  cameraRotationDeg: [number, number, number];
  loadedTextures: string[];
  hotspotIds: string[];
  hovered: string | null;
}

export interface EngineCallbacks {
  onReady?: () => void;
  onLoadingProgress?: (fraction: number) => void;
  onSceneChange?: (scene: VRScene) => void;
  onTransitionStart?: (from: string | null, to: string) => void;
  onTransitionComplete?: (scene: VRScene) => void;
  onProductOpen?: (productId: string) => void;
  onProductClose?: () => void;
  onVRSessionChange?: (active: boolean) => void;
  onDebugUpdate?: (info: DebugInfo) => void;
  /** High-level analytics passthrough — engine reports what happened. */
  onEvent?: (event: string, payload?: Record<string, unknown>) => void;
}

const DEFAULT_RAY_LENGTH = 6;
const CLICK_MOVE_THRESHOLD = 6; // px

/**
 * VRSceneEngine — imperative Three.js renderer for the QWEEN VR store.
 *
 * Deliberately framework-free so it is stable across React re-renders and works
 * identically on desktop (drag-look) and in immersive WebXR (controller rays).
 * React only mounts it, feeds it commands, and reflects its callbacks.
 */
export class VRSceneEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();

  private textures = new TextureManager();
  private hotspots: HotspotManager;
  private sceneManager: SceneManager;
  private panel: ProductPanel3D;

  // Desktop look state.
  private yaw = 0;
  private pitch = 0;
  private dragging = false;
  private pointerDown = new THREE.Vector2();
  private lastPointer = new THREE.Vector2();
  private pointerMoved = 0;
  private hoverFromPointer = new THREE.Vector2(0, 0); // NDC

  // Controllers.
  private controllers: THREE.Group[] = [];
  private controllerLines: THREE.Line[] = [];
  private activeController: THREE.Group | null = null;

  // Timing / debug.
  private clock = new THREE.Clock();
  private elapsed = 0;
  private frames = 0;
  private fpsAccum = 0;
  private fps = 0;
  private debug = false;
  private debugGizmos = new THREE.Group();
  private debugTimer = 0;

  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: EngineCallbacks = {},
  ) {
    // --- Renderer ---
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    container.appendChild(this.renderer.domElement);

    // --- Camera ---
    this.camera = new THREE.PerspectiveCamera(
      VR_CONFIG.desktopFov,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.camera);

    // --- Managers ---
    this.hotspots = new HotspotManager(this.textures, (h) => this.resolveHotspotLabel(h));
    this.scene.add(this.hotspots.group);

    this.panel = new ProductPanel3D(this.textures);
    this.scene.add(this.panel.group);

    this.debugGizmos.visible = false;
    this.scene.add(this.debugGizmos);

    this.sceneManager = new SceneManager(
      this.scene,
      this.camera,
      this.textures,
      this.hotspots,
      {
        onSceneViewed: (s) => {
          this.cb.onSceneChange?.(s);
          this.cb.onEvent?.('scene_viewed', { sceneId: s.id });
          if (this.debug) this.rebuildDebugGizmos(s);
        },
        onTransitionStart: (from, to) => {
          this.cb.onTransitionStart?.(from, to);
          this.cb.onEvent?.('scene_transition_started', { from: from ?? undefined, to });
        },
        onTransitionComplete: (s) => {
          this.cb.onTransitionComplete?.(s);
          this.cb.onEvent?.('scene_transition_completed', { sceneId: s.id });
        },
        onApplyInitialCamera: (o) => this.applyInitialCamera(o),
        onProgress: (f) => this.cb.onLoadingProgress?.(f),
      },
    );

    this.setupControllers();
    this.setupDesktopInput();
    this.setupResize();
  }

  /* ------------------------------- lifecycle ---------------------------- */

  /** Start rendering and load the first scene. */
  async start(sceneId: string): Promise<void> {
    this.renderer.setAnimationLoop(() => this.frame());
    this.cb.onReady?.();
    await this.sceneManager.goTo(sceneId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.teardownDesktopInput();
    this.resizeObserver?.disconnect();
    this.sceneManager.dispose();
    this.hotspots.dispose();
    this.panel.dispose();
    this.textures.disposeAll();
    this.clearDebugGizmos();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* --------------------------------- API -------------------------------- */

  goToScene(sceneId: string): void {
    void this.sceneManager.goTo(sceneId);
  }

  /** Tester: preview an arbitrary panorama URL (real path or uploaded file). */
  showPanoramaFromURL(url: string, name: string): void {
    if (this.panel.isOpen()) this.closeProductPanel();
    void this.sceneManager.showCustomPanorama(url, name);
  }

  closeProductPanel(): void {
    if (this.panel.isOpen()) {
      const p = this.panel.product();
      this.panel.hide();
      this.cb.onProductClose?.();
      this.cb.onEvent?.('product_panel_closed', { productId: p?.id });
    }
  }

  setDebug(on: boolean): void {
    this.debug = on;
    this.debugGizmos.visible = on;
    if (on && this.sceneManager.currentScene) {
      this.rebuildDebugGizmos(this.sceneManager.currentScene);
    }
    // Push an immediate snapshot so the overlay populates without waiting for
    // the throttled loop tick (also helps when the tab is backgrounded).
    if (on) this.cb.onDebugUpdate?.(this.getDebugInfo());
  }

  /** Request an immersive-vr session (§8). Rejects if unsupported. */
  async enterVR(): Promise<void> {
    if (!('xr' in navigator) || !navigator.xr) throw new Error('WebXR not available');
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
    await this.renderer.xr.setSession(session);
    this.cb.onVRSessionChange?.(true);
    this.cb.onEvent?.('vr_entered');
    session.addEventListener('end', () => {
      this.cb.onVRSessionChange?.(false);
      this.cb.onEvent?.('vr_exited');
    });
  }

  getDebugInfo(): DebugInfo {
    const rot = this.camera.rotation;
    const pos = this.camera.getWorldPosition(new THREE.Vector3());
    const scene = this.sceneManager.currentScene;
    return {
      sceneId: scene?.id ?? null,
      fps: Math.round(this.fps),
      xr: this.renderer.xr.isPresenting ? 'active' : 'inactive',
      cameraPosition: [round(pos.x), round(pos.y), round(pos.z)],
      cameraRotationDeg: [
        round(rot.x / DEG2RAD),
        round(rot.y / DEG2RAD),
        round(rot.z / DEG2RAD),
      ],
      loadedTextures: this.textures.loadedSceneIds(),
      hotspotIds: scene?.hotspots.map((h) => h.id) ?? [],
      hovered: this.hotspots.hoveredHotspot()?.id ?? null,
    };
  }

  /* ------------------------------ render loop ---------------------------- */

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;

    this.sceneManager.update(dt);
    this.hotspots.update(this.elapsed);

    if (this.renderer.xr.isPresenting) {
      this.updateControllerHover();
    } else {
      this.applyDesktopLook();
      this.updatePointerHover();
    }

    // FPS.
    this.frames += 1;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.frames / this.fpsAccum;
      this.frames = 0;
      this.fpsAccum = 0;
    }

    // Throttled debug push.
    if (this.debug) {
      this.debugTimer += dt;
      if (this.debugTimer >= 0.25) {
        this.debugTimer = 0;
        this.cb.onDebugUpdate?.(this.getDebugInfo());
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ------------------------------- desktop ------------------------------ */

  private applyDesktopLook(): void {
    const euler = new THREE.Euler(this.pitch * DEG2RAD, this.yaw * DEG2RAD, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  private applyInitialCamera(o: CameraOrientation): void {
    // Only meaningful on desktop; in VR the headset owns orientation (§23 — no
    // forced camera movement).
    if (this.renderer.xr.isPresenting) return;
    this.yaw = o.yaw;
    this.pitch = THREE.MathUtils.clamp(o.pitch, -VR_CONFIG.maxPitchDeg, VR_CONFIG.maxPitchDeg);
  }

  private updatePointerHover(): void {
    if (this.dragging) return;
    this.raycaster.setFromCamera(this.hoverFromPointer, this.camera);
    this.resolveHover();
  }

  private setupDesktopInput(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private teardownDesktopInput(): void {
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.renderer.xr.isPresenting) return;
    this.dragging = true;
    this.pointerMoved = 0;
    this.pointerDown.set(e.clientX, e.clientY);
    this.lastPointer.set(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.renderer.xr.isPresenting) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.hoverFromPointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.pointerMoved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * VR_CONFIG.dragSensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - dy * VR_CONFIG.dragSensitivity,
        -VR_CONFIG.maxPitchDeg,
        VR_CONFIG.maxPitchDeg,
      );
      this.lastPointer.set(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.renderer.xr.isPresenting) return;
    const wasClick =
      this.dragging &&
      this.pointerMoved < CLICK_MOVE_THRESHOLD &&
      Math.abs(e.clientX - this.pointerDown.x) < CLICK_MOVE_THRESHOLD &&
      Math.abs(e.clientY - this.pointerDown.y) < CLICK_MOVE_THRESHOLD;
    this.dragging = false;
    if (wasClick) {
      this.raycaster.setFromCamera(this.hoverFromPointer, this.camera);
      this.performSelect();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.renderer.xr.isPresenting) return;
    if (e.key === 'ArrowLeft') this.yaw += VR_CONFIG.keyboardYawStep;
    else if (e.key === 'ArrowRight') this.yaw -= VR_CONFIG.keyboardYawStep;
    else if (e.key === 'ArrowUp')
      this.pitch = THREE.MathUtils.clamp(this.pitch + VR_CONFIG.keyboardYawStep, -VR_CONFIG.maxPitchDeg, VR_CONFIG.maxPitchDeg);
    else if (e.key === 'ArrowDown')
      this.pitch = THREE.MathUtils.clamp(this.pitch - VR_CONFIG.keyboardYawStep, -VR_CONFIG.maxPitchDeg, VR_CONFIG.maxPitchDeg);
    else if (e.key === 'Escape') this.closeProductPanel();
  };

  /* ----------------------------- controllers ---------------------------- */

  private setupControllers(): void {
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xc9a15a,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      });
      const line = new THREE.Line(rayGeo.clone(), lineMat);
      line.scale.z = DEFAULT_RAY_LENGTH;
      line.renderOrder = 30;
      controller.add(line);

      controller.addEventListener('selectstart', () => {
        this.activeController = controller;
      });
      controller.addEventListener('select', () => {
        this.setRaycasterFromController(controller);
        this.performSelect();
      });

      this.scene.add(controller);
      this.controllers.push(controller);
      this.controllerLines.push(line);
    }
  }

  private setRaycasterFromController(controller: THREE.Group): void {
    const m = controller.matrixWorld;
    this.raycaster.ray.origin.setFromMatrixPosition(m);
    this.raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
  }

  private updateControllerHover(): void {
    let hoveredAny = false;
    for (let i = 0; i < this.controllers.length; i++) {
      const controller = this.controllers[i]!;
      const line = this.controllerLines[i]!;
      if (!controller.visible) {
        line.scale.z = DEFAULT_RAY_LENGTH;
        continue;
      }
      this.setRaycasterFromController(controller);

      // Prefer the first controller that hits something interactive.
      const distance = this.resolveHover();
      if (distance !== null && !hoveredAny) {
        hoveredAny = true;
        line.scale.z = distance;
        this.activeController = controller;
      } else {
        line.scale.z = DEFAULT_RAY_LENGTH;
      }
    }
    if (!hoveredAny) {
      // Nothing hovered anywhere — make sure highlights clear.
      this.hotspots.setHovered(null);
      this.panel.setHoveredAction(null);
    }
  }

  /* --------------------------- shared interaction ----------------------- */

  /**
   * Resolve what the current `raycaster` is pointing at (panel buttons take
   * priority when the panel is open), update hover highlights, and return the
   * hit distance (or null if nothing interactive).
   */
  private resolveHover(): number | null {
    // Panel buttons first.
    if (this.panel.isOpen()) {
      const action = this.panel.raycast(this.raycaster);
      this.panel.setHoveredAction(action);
      this.hotspots.setHovered(null);
      if (action) {
        this.setCursor(true);
        return VR_CONFIG.productPanel.distance;
      }
      // Still allow hotspot hover behind/around the panel.
    }

    const hit = this.hotspots.raycast(this.raycaster);
    if (hit) {
      this.hotspots.setHovered(hit.object);
      this.setCursor(true);
      const d = hit.object.getWorldPosition(new THREE.Vector3()).length();
      return d || DEFAULT_RAY_LENGTH;
    }

    this.hotspots.setHovered(null);
    this.setCursor(false);
    return null;
  }

  /** Act on whatever the current `raycaster` points at. */
  private performSelect(): void {
    // 1) Product panel buttons.
    if (this.panel.isOpen()) {
      const action = this.panel.raycast(this.raycaster);
      if (action) {
        this.handlePanelAction(action);
        return;
      }
    }

    // 2) Hotspots.
    const hit = this.hotspots.raycast(this.raycaster);
    if (!hit) return;
    const h = hit.hotspot;

    if (h.type === 'navigation') {
      this.cb.onEvent?.('navigation_hotspot_clicked', {
        hotspotId: h.id,
        targetSceneId: h.targetSceneId,
      });
      // Close any open panel before travelling.
      if (this.panel.isOpen()) this.closeProductPanel();
      this.sceneManager.goTo(h.targetSceneId);
    } else {
      this.openProduct(h);
    }
  }

  private handlePanelAction(action: PanelAction): void {
    if (action === 'close') {
      this.closeProductPanel();
      return;
    }
    // pdp
    const product = this.panel.product();
    if (product) {
      this.cb.onEvent?.('product_pdp_clicked', { productId: product.id });
      if (product.pdpUrl && typeof window !== 'undefined') {
        window.open(product.pdpUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }

  private openProduct(h: Extract<VRHotspot, { type: 'product' }>): void {
    const product = getProductById(h.productId);
    if (!product) return;

    this.cb.onEvent?.('product_hotspot_clicked', { hotspotId: h.id, productId: product.id });

    const { position, lookAt } = this.computePanelPlacement();
    this.panel.show(product, position, lookAt);

    this.cb.onProductOpen?.(product.id);
    this.cb.onEvent?.('product_panel_opened', { productId: product.id });
  }

  /** Place the panel ~1.85m in front of the user's current horizontal gaze. */
  private computePanelPlacement(): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
    const head = this.renderer.xr.isPresenting
      ? this.renderer.xr.getCamera()
      : this.camera;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const forward = head.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();

    const position = headPos
      .clone()
      .addScaledVector(forward, VR_CONFIG.productPanel.distance);
    position.y = headPos.y; // keep at eye level
    return { position, lookAt: headPos };
  }

  private resolveHotspotLabel(h: VRHotspot): string {
    if (h.type === 'navigation') return h.label;
    return getProductById(h.productId)?.name ?? 'Product';
  }

  private setCursor(interactive: boolean): void {
    if (this.renderer.xr.isPresenting) return;
    this.container.style.cursor = interactive ? 'pointer' : 'grab';
  }

  /* -------------------------------- debug ------------------------------- */

  private rebuildDebugGizmos(scene: VRScene): void {
    this.clearDebugGizmos();
    const geo = new THREE.OctahedronGeometry(0.12);
    for (const h of scene.hotspots) {
      const color = h.type === 'navigation' ? 0xc9a15a : 0xd8e6ef;
      const mesh = new THREE.Mesh(
        geo.clone(),
        new THREE.MeshBasicMaterial({ color, wireframe: true, depthTest: false }),
      );
      mesh.position.set(h.position.x, h.position.y, h.position.z);
      mesh.renderOrder = 40;
      this.debugGizmos.add(mesh);
    }
  }

  private clearDebugGizmos(): void {
    for (const child of [...this.debugGizmos.children]) {
      this.debugGizmos.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
  }

  /* ------------------------------- resize ------------------------------- */

  private resizeObserver: ResizeObserver | null = null;

  private setupResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
  }

  private onResize(): void {
    if (this.renderer.xr.isPresenting) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
