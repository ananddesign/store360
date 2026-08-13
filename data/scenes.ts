import type { VRScene } from '@/types/vr';

/**
 * V1 scene graph.
 *
 * Scenes are pure data — add, remove or reorder them here without touching any
 * rendering code. Each `environment.source` is either a real equirectangular
 * image path or a "placeholder://<themeKey>" descriptor (see lib/vr/placeholder.ts).
 * To ship real photography, drop a 2:1 JPEG in /public/vr/panoramas/ and set
 * `source: '/vr/panoramas/entrance.jpg'`.
 *
 * Hotspot positioning is documented in docs/HOTSPOTS.md.
 *
 * NOTE: These 8 zones are placeholders — not the final QWEEN store layout.
 * The first three (entrance → lobby → main-showroom) form the §31 prototype
 * flow and are the ones fully wired with hotspots.
 */
export const scenes: VRScene[] = [
  {
    id: 'entrance',
    name: 'Entrance',
    environment: { type: 'panorama', source: 'placeholder://entrance' },
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
    environment: { type: 'panorama', source: 'placeholder://lobby' },
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
        id: 'lobby-to-consultation',
        type: 'navigation',
        label: 'Consultation',
        targetSceneId: 'consultation',
        position: { x: 3.8, y: 0, z: -1.5 },
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
    environment: { type: 'panorama', source: 'placeholder://main-showroom' },
    initialCamera: { yaw: 0, pitch: 0 },
    preload: ['diamond-bar', 'bridal', 'lobby'],
    hotspots: [
      {
        id: 'showroom-to-diamond-bar',
        type: 'navigation',
        label: 'Diamond Bar',
        targetSceneId: 'diamond-bar',
        position: { x: 3.6, y: 0, z: -2 },
      },
      {
        id: 'showroom-to-bridal',
        type: 'navigation',
        label: 'Bridal',
        targetSceneId: 'bridal',
        position: { x: -3.6, y: 0, z: -2 },
      },
      {
        id: 'showroom-to-high-jewellery',
        type: 'navigation',
        label: 'High Jewellery',
        targetSceneId: 'high-jewellery',
        position: { x: 0, y: 0.1, z: -4 },
      },
      {
        id: 'showroom-back-lobby',
        type: 'navigation',
        label: 'Lobby',
        targetSceneId: 'lobby',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'showroom-eternity',
        type: 'product',
        productId: 'qween-eternity-003',
        position: { x: 1.8, y: 0.5, z: -3.2 },
      },
      {
        id: 'showroom-drops',
        type: 'product',
        productId: 'qween-drop-004',
        position: { x: -1.8, y: 0.5, z: -3.2 },
      },
    ],
  },
  {
    id: 'diamond-bar',
    name: 'Diamond Bar',
    environment: { type: 'panorama', source: 'placeholder://diamond-bar' },
    preload: ['main-showroom'],
    hotspots: [
      {
        id: 'diamond-bar-back',
        type: 'navigation',
        label: 'Main Showroom',
        targetSceneId: 'main-showroom',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'diamond-bar-solitaire',
        type: 'product',
        productId: 'qween-solitaire-001',
        position: { x: 2, y: 0.3, z: -3 },
      },
    ],
  },
  {
    id: 'bridal',
    name: 'Bridal',
    environment: { type: 'panorama', source: 'placeholder://bridal' },
    preload: ['main-showroom'],
    hotspots: [
      {
        id: 'bridal-back',
        type: 'navigation',
        label: 'Main Showroom',
        targetSceneId: 'main-showroom',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'bridal-eternity',
        type: 'product',
        productId: 'qween-eternity-003',
        position: { x: -2.2, y: 0.3, z: -2.8 },
      },
    ],
  },
  {
    id: 'high-jewellery',
    name: 'High Jewellery',
    environment: { type: 'panorama', source: 'placeholder://high-jewellery' },
    preload: ['main-showroom', 'private-lounge'],
    hotspots: [
      {
        id: 'high-jewellery-back',
        type: 'navigation',
        label: 'Main Showroom',
        targetSceneId: 'main-showroom',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'high-jewellery-to-lounge',
        type: 'navigation',
        label: 'Private Lounge',
        targetSceneId: 'private-lounge',
        position: { x: 3.6, y: 0, z: -2 },
      },
      {
        id: 'high-jewellery-riviere',
        type: 'product',
        productId: 'qween-riviere-002',
        position: { x: 0, y: 0.4, z: -3.4 },
      },
    ],
  },
  {
    id: 'consultation',
    name: 'Consultation',
    environment: { type: 'panorama', source: 'placeholder://consultation' },
    preload: ['lobby'],
    hotspots: [
      {
        id: 'consultation-back',
        type: 'navigation',
        label: 'Lobby',
        targetSceneId: 'lobby',
        position: { x: 0, y: -0.2, z: 4 },
      },
    ],
  },
  {
    id: 'private-lounge',
    name: 'Private Lounge',
    environment: { type: 'panorama', source: 'placeholder://private-lounge' },
    preload: ['high-jewellery'],
    hotspots: [
      {
        id: 'private-lounge-back',
        type: 'navigation',
        label: 'High Jewellery',
        targetSceneId: 'high-jewellery',
        position: { x: 0, y: -0.2, z: 4 },
      },
      {
        id: 'private-lounge-drops',
        type: 'product',
        productId: 'qween-drop-004',
        position: { x: 2.4, y: 0.4, z: -2.8 },
      },
    ],
  },
];

/** The scene shown first when no `?scene=` deep-link is provided. */
export const DEFAULT_SCENE_ID = 'entrance';

const sceneIndex = new Map(scenes.map((s) => [s.id, s]));

export function getSceneById(id: string): VRScene | undefined {
  return sceneIndex.get(id);
}

export function sceneExists(id: string): boolean {
  return sceneIndex.has(id);
}
