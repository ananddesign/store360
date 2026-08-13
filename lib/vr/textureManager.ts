import * as THREE from 'three';
import type { VRScene } from '@/types/vr';
import {
  createHotspotSprite,
  createPanoramaCanvas,
  createProductCanvas,
  isPlaceholderSource,
  parsePlaceholderKey,
} from './placeholder';

/**
 * Texture memory manager (§17).
 *
 * Rules:
 *  - Current scene loaded at full quality.
 *  - Next likely scenes preloaded on demand (data-driven via scene.preload).
 *  - Nothing else is loaded until needed, and textures are disposed to free GPU
 *    memory when scenes are no longer nearby.
 *
 * Panorama textures are cached by scene id. Placeholder panoramas are generated
 * synchronously on a canvas; real image URLs are streamed with progress.
 */
export class TextureManager {
  private panoramas = new Map<string, THREE.Texture>();
  private inflight = new Map<string, Promise<THREE.Texture>>();
  private loader = new THREE.TextureLoader();

  // Small shared caches for UI textures.
  private hotspotTextures = new Map<string, THREE.Texture>();
  private productTextures = new Map<string, THREE.Texture>();

  // Ad-hoc panoramas loaded by the tester (keyed by URL / object-URL).
  private customTextures = new Map<string, THREE.Texture>();

  /** Load (or return cached) the panorama texture for a scene. */
  loadPanorama(
    scene: VRScene,
    onProgress?: (fraction: number) => void,
  ): Promise<THREE.Texture> {
    const cached = this.panoramas.get(scene.id);
    if (cached) {
      onProgress?.(1);
      return Promise.resolve(cached);
    }
    const existing = this.inflight.get(scene.id);
    if (existing) return existing;

    const source =
      scene.environment.type === 'panorama' ? scene.environment.source : '';

    const promise = this.createPanoramaTexture(source, scene.id, onProgress)
      .then((texture) => {
        this.configureEquirect(texture);
        this.panoramas.set(scene.id, texture);
        this.inflight.delete(scene.id);
        return texture;
      })
      .catch((err) => {
        this.inflight.delete(scene.id);
        throw err;
      });

    this.inflight.set(scene.id, promise);
    return promise;
  }

  /** Preload a panorama without blocking; failures are swallowed. */
  preloadPanorama(scene: VRScene): void {
    if (this.panoramas.has(scene.id) || this.inflight.has(scene.id)) return;
    void this.loadPanorama(scene).catch(() => {
      /* preload is best-effort */
    });
  }

  /** Free GPU memory for a scene no longer needed. */
  disposePanorama(sceneId: string): void {
    const tex = this.panoramas.get(sceneId);
    if (tex) {
      tex.dispose();
      this.panoramas.delete(sceneId);
    }
  }

  /** Keep only the given scene ids; dispose the rest. */
  retainOnly(sceneIds: Iterable<string>): void {
    const keep = new Set(sceneIds);
    for (const id of Array.from(this.panoramas.keys())) {
      if (!keep.has(id)) this.disposePanorama(id);
    }
  }

  /** Ids of currently-resident panorama textures (for the debug overlay). */
  loadedSceneIds(): string[] {
    return Array.from(this.panoramas.keys());
  }

  /* ----------------------------- UI textures ---------------------------- */

  getHotspotTexture(kind: 'navigation' | 'product', accent = '#c9a15a'): THREE.Texture {
    const key = `${kind}:${accent}`;
    const cached = this.hotspotTextures.get(key);
    if (cached) return cached;
    const tex = new THREE.CanvasTexture(createHotspotSprite(kind, accent));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.hotspotTextures.set(key, tex);
    return tex;
  }

  /** Product image texture — placeholder canvas or real URL. */
  getProductTexture(image: string): THREE.Texture {
    const cached = this.productTextures.get(image);
    if (cached) return cached;

    let tex: THREE.Texture;
    const key = parsePlaceholderKey(image);
    if (key || isPlaceholderSource(image)) {
      tex = new THREE.CanvasTexture(createProductCanvas(key ?? 'product'));
    } else {
      tex = this.loader.load(image);
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    this.productTextures.set(image, tex);
    return tex;
  }

  /**
   * Load an equirectangular panorama from an arbitrary URL (a real path or a
   * `blob:`/object URL from an uploaded file). Used by the tester — not tied to
   * any scene id, and cached by URL.
   */
  loadURL(url: string, onProgress?: (fraction: number) => void): Promise<THREE.Texture> {
    const cached = this.customTextures.get(url);
    if (cached) {
      onProgress?.(1);
      return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          this.configureEquirect(texture);
          this.customTextures.set(url, texture);
          resolve(texture);
        },
        (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress?.(event.loaded / event.total);
          }
        },
        (err) => reject(err),
      );
    });
  }

  /** Dispose everything. Call on engine teardown. */
  disposeAll(): void {
    for (const id of Array.from(this.panoramas.keys())) this.disposePanorama(id);
    for (const t of this.hotspotTextures.values()) t.dispose();
    for (const t of this.productTextures.values()) t.dispose();
    for (const t of this.customTextures.values()) t.dispose();
    this.hotspotTextures.clear();
    this.productTextures.clear();
    this.customTextures.clear();
  }

  /* ------------------------------ internals ----------------------------- */

  private createPanoramaTexture(
    source: string,
    fallbackKey: string,
    onProgress?: (fraction: number) => void,
  ): Promise<THREE.Texture> {
    const key = parsePlaceholderKey(source);
    if (key !== null || source === '') {
      // Procedural placeholder — synchronous, report complete immediately.
      const tex = new THREE.CanvasTexture(createPanoramaCanvas(key ?? fallbackKey));
      onProgress?.(1);
      return Promise.resolve(tex);
    }

    // Real equirectangular image with streaming progress. If it fails to load
    // (wrong path, not a valid image), fall back to the scene's placeholder so
    // testing real assets never leaves a black/stuck scene.
    return new Promise((resolve) => {
      this.loader.load(
        source,
        (texture) => resolve(texture),
        (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress?.(event.loaded / event.total);
          }
        },
        (err) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[TextureManager] could not load "${source}" — using placeholder. ` +
              `Check the path (relative to /public) and that it's a 2:1 equirectangular image.`,
            err,
          );
          const tex = new THREE.CanvasTexture(createPanoramaCanvas(fallbackKey));
          onProgress?.(1);
          resolve(tex);
        },
      );
    });
  }

  private configureEquirect(texture: THREE.Texture): void {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }
}
