import type { NavigationHotspot, VRScene } from '@/types/vr';
import { floors, floorOrder, sceneIdFor } from './floors';

/**
 * V1 scene graph — generated from the floor/node navigation config in
 * data/floors.ts. Each floor node becomes a VRScene; each configured
 * hotspot becomes a NavigationHotspot pointing at another node's scene id.
 * Same-floor neighbours are preloaded automatically (§9 performance).
 *
 * To ship more photography: add a node (and its hotspots) to data/floors.ts
 * — no rendering code changes needed. Hotspot positioning is documented in
 * docs/HOTSPOTS.md.
 */
function buildScenes(): VRScene[] {
  const scenes: VRScene[] = [];
  for (const floorId of floorOrder) {
    const floor = floors[floorId];
    if (!floor) continue;
    for (const [nodeId, node] of Object.entries(floor.nodes)) {
      const id = sceneIdFor(floorId, nodeId);
      const hotspots: NavigationHotspot[] = node.hotspots.map((h) => ({
        id: `${id}-to-${h.target}`,
        type: 'navigation',
        label: h.label ?? 'Explore',
        targetSceneId: sceneIdFor(floorId, h.target),
        position: h.position,
      }));
      scenes.push({
        id,
        name: floor.label,
        environment: { type: 'panorama', source: `/vr/panoramas/${node.image}` },
        initialCamera: node.initialCamera,
        hotspots,
        preload: node.hotspots.map((h) => sceneIdFor(floorId, h.target)),
      });
    }
  }
  return scenes;
}

export const scenes: VRScene[] = buildScenes();

/** The scene shown first when no `?scene=` deep-link is provided. Also "home". */
export const DEFAULT_SCENE_ID = sceneIdFor('ground', floors.ground!.entry);

const sceneIndex = new Map(scenes.map((s) => [s.id, s]));

export function getSceneById(id: string): VRScene | undefined {
  return sceneIndex.get(id);
}

export function sceneExists(id: string): boolean {
  return sceneIndex.has(id);
}
