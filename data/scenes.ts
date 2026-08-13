import type { VRScene } from '@/types/vr';

/**
 * V1 scene graph.
 *
 * Scenes are pure data — add, remove or reorder them here without touching any
 * rendering code. Each `environment.source` is either a real equirectangular
 * image path or a "placeholder://<themeKey>" descriptor (see lib/vr/placeholder.ts).
 * To ship real photography, drop a 2:1 image in /public/vr/panoramas/ and set
 * `source: '/vr/panoramas/entrance.jpg'`.
 *
 * Hotspot positioning is documented in docs/HOTSPOTS.md.
 *
 * Current flow: Entrance → Lobby → Main Showroom, all on real 360° photos.
 * (Empty placeholder-only zones were removed; add new zones here as their
 * photography arrives.)
 */
export const scenes: VRScene[] = [
  {
    id: 'entrance',
    name: 'Entrance',
    environment: { type: 'panorama', source: '/vr/panoramas/entrance.jpg' },
    initialCamera: { yaw: 0, pitch: 0 },
    preload: ['lobby'],
    hotspots: [
      {
        id: 'entrance-to-lobby',
        type: 'navigation',
        label: 'Enter QWEEN',
        targetSceneId: 'lobby',
        position: { x: 0, y: -0.1, z: -4 },
      },
      {
        id: 'entrance-solitaire',
        type: 'product',
        productId: 'qween-solitaire-001',
        position: { x: 2.6, y: 0.2, z: -3 },
      },
    ],
  },
  {
    id: 'lobby',
    name: 'Lobby',
    environment: { type: 'panorama', source: '/vr/panoramas/lobby.jpg' },
    initialCamera: { yaw: 0, pitch: 0 },
    preload: ['main-showroom', 'entrance'],
    hotspots: [
      {
        id: 'lobby-to-showroom',
        type: 'navigation',
        label: 'Main Showroom',
        targetSceneId: 'main-showroom',
        position: { x: -0.5, y: -0.1, z: -4 },
      },
      {
        id: 'lobby-back-entrance',
        type: 'navigation',
        label: 'Entrance',
        targetSceneId: 'entrance',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'lobby-riviere',
        type: 'product',
        productId: 'qween-riviere-002',
        position: { x: -3, y: 0.4, z: -2.4 },
      },
    ],
  },
  {
    id: 'main-showroom',
    name: 'Main Showroom',
    environment: { type: 'panorama', source: '/vr/panoramas/main-showroom.png' },
    initialCamera: { yaw: 0, pitch: 0 },
    preload: ['lobby'],
    hotspots: [
      {
        id: 'showroom-back-lobby',
        type: 'navigation',
        label: 'Lobby',
        targetSceneId: 'lobby',
        position: { x: 0, y: -0.2, z: 4 },
      },
      // Product hotspots placed on the jewellery visible in the photo.
      // (Tune positions with /vr?scene=main-showroom&debug=true.)
      {
        // Foreground round glass display case.
        id: 'showroom-case-solitaire',
        type: 'product',
        productId: 'qween-solitaire-001',
        position: { x: -0.5, y: -1.2, z: -2.1 },
      },
      {
        // Blue-tiled wall display case with necklaces (left).
        id: 'showroom-wall-riviere',
        type: 'product',
        productId: 'qween-riviere-002',
        position: { x: -1.2, y: -0.2, z: -3.0 },
      },
      {
        // Right-hand counter / arched display.
        id: 'showroom-counter-eternity',
        type: 'product',
        productId: 'qween-eternity-003',
        position: { x: 0.95, y: -0.55, z: -3.0 },
      },
    ],
  },
];

/** The scene shown first when no `?scene=` deep-link is provided. Also "home". */
export const DEFAULT_SCENE_ID = 'entrance';

const sceneIndex = new Map(scenes.map((s) => [s.id, s]));

export function getSceneById(id: string): VRScene | undefined {
  return sceneIndex.get(id);
}

export function sceneExists(id: string): boolean {
  return sceneIndex.has(id);
}
