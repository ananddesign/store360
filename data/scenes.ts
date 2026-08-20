import type { VRScene } from '@/types/vr';

/**
 * V1 scene graph.
 *
 * Scenes are pure data — add, remove or reorder them here without touching any
 * rendering code. Each `environment.source` is either a real equirectangular
 * image path or a "placeholder://<themeKey>" descriptor (see lib/vr/placeholder.ts).
 * To ship real photography, drop a 2:1 image in /public/vr/panoramas/ and set
 * `source: '/vr/panoramas/main-store.jpg'`.
 *
 * Hotspot positioning is documented in docs/HOTSPOTS.md.
 *
 * Current flow: a single Main Store scene on a real 360° photo, with no
 * hotspots yet (look-around only). Add navigation/product hotspots here once
 * placement is decided, and additional scenes as their photography arrives.
 */
export const scenes: VRScene[] = [
  {
    id: 'main-store',
    name: 'Main Store',
    environment: { type: 'panorama', source: '/vr/panoramas/main-store.jpg' },
    initialCamera: { yaw: 0, pitch: 0 },
    hotspots: [],
  },
];

/** The scene shown first when no `?scene=` deep-link is provided. Also "home". */
export const DEFAULT_SCENE_ID = 'main-store';

const sceneIndex = new Map(scenes.map((s) => [s.id, s]));

export function getSceneById(id: string): VRScene | undefined {
  return sceneIndex.get(id);
}

export function sceneExists(id: string): boolean {
  return sceneIndex.has(id);
}
