import * as THREE from 'three';
import type { CameraOrientation, VRHotspot, VRScene } from '@/types/vr';
import { getProductById } from '@/data/products';
import { DEFAULT_SCENE_ID, getSceneById } from '@/data/scenes';
import { TextureManager } from './textureManager';
import { HotspotManager } from './hotspotManager';
import { SceneManager } from './sceneManager';
import { ProductPanel3D, type PanelAction } from './productPanel';
import { ViewControlsPanel3D, type ViewControlAction } from './viewControlsPanel3D';
import {
  VR_CONFIG,
  DEG2RAD,
  DEBUG_VIEW_DEFAULTS,
  DEBUG_VIEW_RANGES,
  DEBUG_VIEW_VR_STEPS,
  VERTICAL_LOOK_CONFIG,
} from './config';

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

/** Current values of the live-tunable "View Controls" debug panel (§ViewControlsPanel). */
export interface ViewTuning {
  eyeHeight: number;
  pitchLimitDeg: number;
  panoramaRadius: number;
  initialPitchDeg: number;
  initialYawDeg: number;
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
  /** Carries the camera + controllers as a unit; only its Y offset is ever
   *  touched (eye height, §ViewControlsPanel). Never rotated — the headset's
   *  own tracked quaternion is always authoritative for orientation. */
  private rig = new THREE.Group();
  private raycaster = new THREE.Raycaster();

  private textures = new TextureManager();
  private hotspots: HotspotManager;
  private sceneManager: SceneManager;
  private panel: ProductPanel3D;
  /** In-scene (real 3D geometry) counterpart of the 2D debug ViewControlsPanel
   *  — a DOM overlay is never composited into an immersive session, so this
   *  is the only way to see/use it while actually wearing the headset. */
  private viewControlsPanel3D = new ViewControlsPanel3D();

  // Desktop look state.
  private yaw = 0;
  private pitch = 0;
  /** Hard vertical look bounds (deg from horizon) — the "minPolarAngle /
   *  maxPolarAngle equivalent". Camera pitch is clamped to [min, max] on every
   *  look input, so it stops smoothly at −55° down / +90° up. Configurable via
   *  VERTICAL_LOOK_CONFIG. Yaw (horizontal) is never constrained. Headset
   *  rotation is never clamped in an immersive session. */
  private minPitchDeg: number = VERTICAL_LOOK_CONFIG.minPitchDeg;
  private maxPitchDeg: number = VERTICAL_LOOK_CONFIG.maxPitchDeg;

  /** Active desktop look tween (Recenter, or the gentle pre-travel turn
   *  toward a clicked navigation hotspot) — eased, never a snap. Cancelled
   *  the moment the user takes manual control (drag). */
  private lookTween: {
    fromYaw: number;
    fromPitch: number;
    toYaw: number;
    toPitch: number;
    elapsed: number;
    duration: number;
  } | null = null;

  // Live-tunable view settings (debug panel). Defaults mirror VR_CONFIG's
  // production values; setDebug(true) reseeds them from DEBUG_VIEW_DEFAULTS.
  private pitchLimitDeg: number = VR_CONFIG.maxPitchDeg;
  private eyeHeightMeters: number = VR_CONFIG.playerHeight;
  private panoramaRadiusUnits: number = VR_CONFIG.panoramaRadius;
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
  /** True once the View Controls debug baseline has been seeded (see setDebug) —
   *  guards against re-seeding (and wiping) a user's own tuning on every
   *  toggle-off/toggle-on via the top-right gear button. */
  private debugSeeded = false;
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
    this.rig.name = 'player-rig';
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    // --- Managers ---
    this.hotspots = new HotspotManager(this.textures, (h) => this.resolveHotspotLabel(h));
    this.scene.add(this.hotspots.group);

    this.panel = new ProductPanel3D(this.textures);
    this.scene.add(this.panel.group);

    this.scene.add(this.viewControlsPanel3D.group);

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
    this.viewControlsPanel3D.dispose();
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

  /** Warm a scene's texture ahead of navigation (floor selector hover, §9). */
  preloadScene(sceneId: string): void {
    const scene = getSceneById(sceneId);
    if (scene) void this.textures.preloadPanorama(scene);
  }

  /**
   * Recenter: ease the desktop look back to the current panorama's
   * recommended starting orientation (its `initialCamera`, or straight
   * ahead). Desktop-only — in an active WebXR session the headset's own
   * tracked orientation is always authoritative.
   */
  recenterView(): void {
    if (this.renderer.xr.isPresenting) return;
    const o = this.sceneManager.currentScene?.initialCamera ?? { yaw: 0, pitch: 0 };
    this.animateLookTo(o.yaw, o.pitch, 500);
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
    if (on) {
      // Seed the View Controls panel's own baseline (independent of the
      // shipped VR_CONFIG defaults) so a tuning session starts from a known,
      // documented state rather than whatever's currently in production —
      // but only the very first time debug is turned on. The gear button
      // lets the user toggle this on/off repeatedly; re-seeding on every
      // reopen would silently discard whatever they'd already tuned.
      if (!this.debugSeeded) {
        this.debugSeeded = true;
        this.setPitchLimit(DEBUG_VIEW_DEFAULTS.pitchLimitDeg);
        this.setPanoramaRadius(DEBUG_VIEW_DEFAULTS.panoramaRadius);
        this.setEyeHeight(DEBUG_VIEW_DEFAULTS.eyeHeight);
      }
      // If a VR session is already active (debug toggled mid-session), show
      // the in-headset panel immediately rather than waiting for the next
      // enterVR() call.
      if (this.renderer.xr.isPresenting) this.showViewControlsPanel3D();
      // Push an immediate snapshot so the overlay populates without waiting
      // for the throttled loop tick (also helps when the tab is backgrounded).
      this.cb.onDebugUpdate?.(this.getDebugInfo());
    } else {
      this.viewControlsPanel3D.hide();
    }
  }

  /* ---------------------------- view tuning (debug) ----------------------- */

  /**
   * Live eye-height offset (m). Moves the camera + controller rig's Y
   * position only — the headset's own tracked quaternion (or position) is
   * never touched, so this never fights natural headset tracking.
   */
  setEyeHeight(meters: number): void {
    this.eyeHeightMeters = meters;
    this.rig.position.y = meters - VR_CONFIG.playerHeight;
  }

  /**
   * Max look-up/down angle (deg) for desktop drag/keyboard look. Re-clamps
   * the current pitch immediately if it now exceeds a tighter limit. Has no
   * effect on an active WebXR session — the headset's tracked orientation is
   * never clamped (§ safety requirement: don't fight headset tracking).
   */
  setPitchLimit(deg: number): void {
    this.pitchLimitDeg = deg;
    this.pitch = this.clampPitch(this.pitch);
  }

  /**
   * Clamp a desktop pitch (deg) to the hard vertical bounds
   * [minPitchDeg, maxPitchDeg] (−55°..+90° by default). The debug "Vertical
   * View / Pitch" limit can only tighten these symmetrically, never widen
   * them. Horizontal (yaw) is never touched → full 360° look is preserved.
   * MathUtils.clamp gives a smooth stop at the edge (no snap-back / jitter).
   *
   * Clamping the look *direction* alone isn't enough to satisfy "never see
   * below minPitchDeg": the camera has a field of view, so once the crosshair
   * reaches the raw limit, the *bottom edge* of the frame is already looking
   * roughly halfFov further down than that — e.g. at a 70° FOV, a crosshair
   * clamped to −55° still shows the frame's bottom edge at ≈−90°. So the
   * downward bound is tightened by half the camera's (aspect-independent)
   * vertical FOV, guaranteeing the visible frustum's lower edge never passes
   * minPitchDeg. Upward keeps the plain crosshair limit (no complaint about
   * over-seeing above +90, and half of it is past the zenith anyway).
   */
  private clampPitch(deg: number): number {
    const halfFov = this.camera.fov / 2;
    const down = Math.max(this.minPitchDeg + halfFov, -this.pitchLimitDeg);
    const up = Math.min(this.maxPitchDeg, this.pitchLimitDeg);
    return THREE.MathUtils.clamp(deg, down, up);
  }

  /**
   * Ease the desktop look toward an absolute yaw/pitch (deg) over `ms`,
   * taking the shortest yaw direction. Used for Recenter and the gentle
   * "orient toward destination" turn before a hotspot travel (§3) — never a
   * snap. No-op in an active WebXR session (headset tracking is authoritative).
   */
  private animateLookTo(yawDeg: number, pitchDeg: number, ms: number): void {
    if (this.renderer.xr.isPresenting) return;
    const fromNorm = ((this.yaw % 360) + 360) % 360;
    const toNorm = ((yawDeg % 360) + 360) % 360;
    let delta = toNorm - fromNorm;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    this.lookTween = {
      fromYaw: this.yaw,
      fromPitch: this.pitch,
      toYaw: this.yaw + delta,
      toPitch: this.clampPitch(pitchDeg),
      elapsed: 0,
      duration: ms / 1000,
    };
  }

  /** Advance the active look tween, if any. Desktop-only; see animateLookTo. */
  private updateLookTween(dt: number): void {
    const t = this.lookTween;
    if (!t) return;
    t.elapsed += dt;
    const progress = Math.min(1, t.elapsed / t.duration);
    const eased = easeInOutCubic(progress);
    this.yaw = lerp(t.fromYaw, t.toYaw, eased);
    this.pitch = this.clampPitch(lerp(t.fromPitch, t.toPitch, eased));
    if (progress >= 1) this.lookTween = null;
  }

  /** Live-resize the panorama sphere (units) without reloading the scene. */
  setPanoramaRadius(units: number): void {
    this.panoramaRadiusUnits = units;
    this.sceneManager.setRadius(units);
  }

  /**
   * Snap the current desktop look direction to an explicit yaw/pitch (deg).
   * Only meaningful on desktop: while presenting in VR, `applyDesktopLook()`
   * is skipped every frame (see frame()), so this has no visible effect on
   * the headset — it never overrides the Quest's own tracked quaternion.
   */
  setLookOrientation(yawDeg: number, pitchDeg: number): void {
    this.yaw = yawDeg;
    this.pitch = this.clampPitch(pitchDeg);
  }

  /** Current values of the live-tunable view settings, for the debug panel. */
  getViewTuning(): ViewTuning {
    return {
      eyeHeight: this.eyeHeightMeters,
      pitchLimitDeg: this.pitchLimitDeg,
      panoramaRadius: this.panoramaRadiusUnits,
      initialPitchDeg: this.pitch,
      initialYawDeg: this.yaw,
    };
  }

  /** Spawn the in-headset View Controls panel in front of the user's current gaze. */
  private showViewControlsPanel3D(): void {
    const head = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const forward = head.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    const position = headPos.clone().addScaledVector(forward, 1.9);
    position.y = headPos.y - 0.1;
    this.viewControlsPanel3D.show(this.getViewTuning(), position, headPos);
  }

  /** Step one field by its configured VR tap size, clamped to its range. */
  private stepViewTuning(field: keyof ViewTuning, dir: 1 | -1): void {
    const t = this.getViewTuning();
    const range = DEBUG_VIEW_RANGES[field];
    const step = DEBUG_VIEW_VR_STEPS[field];
    const next = THREE.MathUtils.clamp(t[field] + dir * step, range.min, range.max);
    switch (field) {
      case 'eyeHeight':
        this.setEyeHeight(next);
        break;
      case 'pitchLimitDeg':
        this.setPitchLimit(next);
        break;
      case 'panoramaRadius':
        this.setPanoramaRadius(next);
        break;
      case 'initialPitchDeg':
        this.setLookOrientation(t.initialYawDeg, next);
        break;
      case 'initialYawDeg':
        this.setLookOrientation(next, t.initialPitchDeg);
        break;
    }
    this.viewControlsPanel3D.updateValues(this.getViewTuning());
  }

  /** Restore the debug panel's own defaults (Initial Yaw resets to the current scene's configured yaw). */
  private resetViewTuning(): void {
    const yaw = this.sceneManager.currentScene?.initialCamera?.yaw ?? 0;
    this.setEyeHeight(DEBUG_VIEW_DEFAULTS.eyeHeight);
    this.setPitchLimit(DEBUG_VIEW_DEFAULTS.pitchLimitDeg);
    this.setPanoramaRadius(DEBUG_VIEW_DEFAULTS.panoramaRadius);
    this.setLookOrientation(yaw, DEBUG_VIEW_DEFAULTS.initialPitchDeg);
    this.viewControlsPanel3D.updateValues(this.getViewTuning());
  }

  private handleViewControlsAction(action: ViewControlAction): void {
    if (action.kind === 'reset') {
      this.resetViewTuning();
    } else {
      this.stepViewTuning(action.field, action.dir);
    }
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
    if (this.debug) this.showViewControlsPanel3D();
    session.addEventListener('end', () => {
      this.cb.onVRSessionChange?.(false);
      this.cb.onEvent?.('vr_exited');
      this.viewControlsPanel3D.hide();
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
      if (!this.dragging) this.updateLookTween(dt);
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
    this.pitch = this.clampPitch(o.pitch);
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
    this.lookTween = null;
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
      this.pitch = this.clampPitch(this.pitch - dy * VR_CONFIG.dragSensitivity);
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
      this.pitch = this.clampPitch(this.pitch + VR_CONFIG.keyboardYawStep);
    else if (e.key === 'ArrowDown')
      this.pitch = this.clampPitch(this.pitch - VR_CONFIG.keyboardYawStep);
    else if (e.key === 'Escape') this.closeProductPanel();
    else if (e.key === 'h' || e.key === 'H') this.goHome();
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
      // Squeeze / grip ("pinch") on either controller → go home.
      controller.addEventListener('squeeze', () => this.goHome());

      // Part of the rig so a debug eye-height offset moves controllers with
      // the camera as one unit.
      this.rig.add(controller);
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
      this.viewControlsPanel3D.setHovered(null);
    }
  }

  /* --------------------------- shared interaction ----------------------- */

  /**
   * Resolve what the current `raycaster` is pointing at (panel buttons take
   * priority when the panel is open), update hover highlights, and return the
   * hit distance (or null if nothing interactive).
   */
  private resolveHover(): number | null {
    // View Controls panel (debug) first — it's a persistent tool while open.
    if (this.viewControlsPanel3D.isOpen()) {
      const hit = this.viewControlsPanel3D.raycast(this.raycaster);
      this.viewControlsPanel3D.setHovered(hit?.object ?? null);
      if (hit) {
        this.panel.setHoveredAction(null);
        this.hotspots.setHovered(null);
        this.setCursor(true);
        return 1.9;
      }
    }

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
    // 1) View Controls panel (debug).
    if (this.viewControlsPanel3D.isOpen()) {
      const hit = this.viewControlsPanel3D.raycast(this.raycaster);
      if (hit) {
        this.handleViewControlsAction(hit.action);
        return;
      }
    }

    // 2) Product panel buttons.
    if (this.panel.isOpen()) {
      const action = this.panel.raycast(this.raycaster);
      if (action) {
        this.handlePanelAction(action);
        return;
      }
    }

    // 3) Hotspots.
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
      // Gently orient toward the destination (§3) — plays out while the
      // scene fades to black, so it's felt but never blocks the transition.
      const { yaw, pitch } = directionToYawPitch(h.position);
      this.animateLookTo(yaw, pitch, 300);
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

  /* -------------------------------- home -------------------------------- */

  /**
   * Return to the home (entrance) scene. Triggered by the controller `squeeze`
   * (grip / "pinch") gesture in VR, or the `H` key on desktop.
   */
  private goHome(): void {
    if (this.sceneManager.currentScene?.id === DEFAULT_SCENE_ID) return;
    if (this.panel.isOpen()) this.closeProductPanel();
    this.cb.onEvent?.('navigation_hotspot_clicked', {
      hotspotId: 'home-gesture',
      targetSceneId: DEFAULT_SCENE_ID,
    });
    void this.sceneManager.goTo(DEFAULT_SCENE_ID);
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Yaw/pitch (deg) the desktop camera should face to look directly at a
 *  camera-relative world position, matching applyDesktopLook's YXZ Euler
 *  convention (yaw 0 / pitch 0 looks toward -Z). */
function directionToYawPitch(position: { x: number; y: number; z: number }): {
  yaw: number;
  pitch: number;
} {
  const dir = new THREE.Vector3(position.x, position.y, position.z).normalize();
  const yaw = Math.atan2(-dir.x, -dir.z) / DEG2RAD;
  const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) / DEG2RAD;
  return { yaw, pitch };
}
