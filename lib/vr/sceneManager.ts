import * as THREE from 'three';
import type { CameraOrientation, VRScene } from '@/types/vr';
import { getSceneById } from '@/data/scenes';
import type { TextureManager } from './textureManager';
import type { HotspotManager } from './hotspotManager';
import { VR_CONFIG } from './config';

interface SceneManagerCallbacks {
  onSceneViewed: (scene: VRScene) => void;
  onTransitionStart: (from: string | null, to: string) => void;
  onTransitionComplete: (scene: VRScene) => void;
  onApplyInitialCamera: (orientation: CameraOrientation) => void;
  onProgress: (fraction: number) => void;
}

/**
 * Owns the panorama sphere and drives scene-to-scene transitions:
 *   fade to black → load next panorama → swap → rebuild hotspots → fade in.
 *
 * The fade is a camera-attached black sphere so it covers the full field of
 * view in both desktop and immersive modes (§16 — never snap between scenes).
 */
export class SceneManager {
  private panorama: THREE.Mesh;
  private fade: THREE.Mesh;
  private fadeValue = 1; // start black; first load fades in.
  private fadeTarget = 1;
  private fadeFrom = 1;
  private fadeElapsed = 0;
  private fadeResolvers: Array<() => void> = [];

  private current: VRScene | null = null;
  private previous: VRScene | null = null;
  private busy = false;

  constructor(
    private readonly root: THREE.Scene,
    camera: THREE.Camera,
    private readonly textures: TextureManager,
    private readonly hotspots: HotspotManager,
    private readonly cb: SceneManagerCallbacks,
  ) {
    // Inverted panorama sphere — the environment. No lighting (§6): the
    // panorama already contains its own light.
    const geo = new THREE.SphereGeometry(VR_CONFIG.panoramaRadius, 64, 40);
    geo.scale(-1, 1, 1); // render the inside surface.
    const mat = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
    this.panorama = new THREE.Mesh(geo, mat);
    this.panorama.name = 'panorama';
    this.root.add(this.panorama);

    // Camera-attached fade sphere.
    const fadeGeo = new THREE.SphereGeometry(5, 16, 12);
    fadeGeo.scale(-1, 1, 1);
    const fadeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: this.fadeValue,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.fade = new THREE.Mesh(fadeGeo, fadeMat);
    this.fade.renderOrder = 999;
    this.fade.frustumCulled = false;
    camera.add(this.fade);
  }

  get currentScene(): VRScene | null {
    return this.current;
  }

  get previousScene(): VRScene | null {
    return this.previous;
  }

  get isTransitioning(): boolean {
    return this.busy;
  }

  /** Advance fade interpolation. Call every frame with delta seconds. */
  update(dt: number): void {
    if (this.fadeValue !== this.fadeTarget) {
      const halfDuration = VR_CONFIG.transitionMs / 1000 / 2; // half-duration per direction
      this.fadeElapsed += dt;
      const t = Math.min(1, this.fadeElapsed / halfDuration);
      this.fadeValue = lerp(this.fadeFrom, this.fadeTarget, easeInOutCubic(t));
      (this.fade.material as THREE.MeshBasicMaterial).opacity = this.fadeValue;
      if (t >= 1) {
        this.fadeValue = this.fadeTarget;
        const resolvers = this.fadeResolvers;
        this.fadeResolvers = [];
        for (const r of resolvers) r();
      }
    }
    // Hide fade mesh entirely when fully transparent (saves an overdraw pass).
    this.fade.visible = this.fadeValue > 0.001;
  }

  /**
   * Transition to a scene. Safe to call repeatedly; ignores requests while a
   * transition is in flight or when already on the target scene.
   */
  async goTo(sceneId: string): Promise<void> {
    if (this.busy) return;
    if (this.current?.id === sceneId) return;
    const scene = getSceneById(sceneId);
    if (!scene) {
      // eslint-disable-next-line no-console
      console.warn(`[SceneManager] unknown scene "${sceneId}"`);
      return;
    }

    this.busy = true;
    this.cb.onTransitionStart(this.current?.id ?? null, scene.id);

    // Fade out (skip if this is the very first load — already black).
    if (this.current) {
      await this.fadeTo(1);
    }

    // Load the panorama (progress reported for real images).
    let texture: THREE.Texture;
    try {
      texture = await this.textures.loadPanorama(scene, this.cb.onProgress);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[SceneManager] failed to load "${sceneId}"`, err);
      this.busy = false;
      return;
    }

    // Swap environment + hotspots while fully black.
    const mat = this.panorama.material as THREE.MeshBasicMaterial;
    mat.map = texture;
    mat.needsUpdate = true;
    this.hotspots.setScene(scene);

    this.previous = this.current;
    this.current = scene;

    if (scene.initialCamera) this.cb.onApplyInitialCamera(scene.initialCamera);

    this.cb.onSceneViewed(scene);

    // Preload likely-next panoramas and free far ones.
    this.managePreload(scene);

    // Fade in.
    await this.fadeTo(0);

    this.cb.onTransitionComplete(scene);
    this.busy = false;
  }

  /**
   * Tester hook: show an arbitrary panorama from a URL (real path or uploaded
   * object URL), with no hotspots. Reuses the standard fade transition.
   */
  async showCustomPanorama(url: string, name: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    const synthetic: VRScene = {
      id: `custom:${name}`,
      name,
      environment: { type: 'panorama', source: url },
      hotspots: [],
    };
    this.cb.onTransitionStart(this.current?.id ?? null, synthetic.id);

    if (this.current) await this.fadeTo(1);

    let texture: THREE.Texture;
    try {
      texture = await this.textures.loadURL(url, this.cb.onProgress);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[SceneManager] failed to load custom panorama "${name}"`, err);
      this.busy = false;
      return;
    }

    const mat = this.panorama.material as THREE.MeshBasicMaterial;
    mat.map = texture;
    mat.needsUpdate = true;
    this.hotspots.setScene(synthetic); // clears markers

    this.previous = this.current;
    this.current = synthetic;
    this.cb.onSceneViewed(synthetic);

    await this.fadeTo(0);
    this.cb.onTransitionComplete(synthetic);
    this.busy = false;
  }

  /**
   * Debug: live-resize the panorama sphere by scaling the existing mesh
   * (no geometry rebuild, no texture reload, no scene disruption).
   */
  setRadius(radius: number): void {
    const scale = radius / VR_CONFIG.panoramaRadius;
    this.panorama.scale.setScalar(scale);
  }

  dispose(): void {
    this.panorama.geometry.dispose();
    (this.panorama.material as THREE.MeshBasicMaterial).dispose();
    this.fade.geometry.dispose();
    (this.fade.material as THREE.MeshBasicMaterial).dispose();
    this.fade.removeFromParent();
    this.panorama.removeFromParent();
  }

  /* ------------------------------ internals ----------------------------- */

  private fadeTo(target: number): Promise<void> {
    this.fadeFrom = this.fadeValue;
    this.fadeElapsed = 0;
    this.fadeTarget = target;
    if (this.fadeValue === target) return Promise.resolve();
    return new Promise((resolve) => this.fadeResolvers.push(resolve));
  }

  private managePreload(scene: VRScene): void {
    const keep = new Set<string>([scene.id]);
    for (const id of scene.preload ?? []) {
      keep.add(id);
      const next = getSceneById(id);
      if (next) this.textures.preloadPanorama(next);
    }
    if (this.previous) keep.add(this.previous.id);
    // Dispose panoramas that aren't the current, previous, or a preload target.
    this.textures.retainOnly(keep);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
