import type { CameraOrientation, Vec3 } from '@/types/vr';

/**
 * Centralised floor / node navigation graph for the multi-floor showroom.
 *
 * Pure data — data/scenes.ts turns this into the actual VRScene graph the
 * engine consumes (one VRScene per node, one NavigationHotspot per
 * configured connection). See docs/HOTSPOTS.md for the position
 * convention: a hotspot's world position is relative to the camera origin;
 * its *direction* decides where the marker sits on the panorama and its
 * *length* the comfortable placement distance (3–5m).
 *
 * Positions below are sensible showroom defaults (straight ahead / straight
 * behind, slightly below eye level) — tune per node once the real doorway
 * direction in each photo is known, independently of any other node.
 */

export interface FloorHotspotConfig {
  /** Node id (within the same floor) this hotspot travels to. */
  target: string;
  /** World position, camera-relative — see docs/HOTSPOTS.md. */
  position: Vec3;
  /** Hover / tap label. Defaults to "Explore". */
  label?: string;
  /**
   * Visual treatment. Omit for the default camera-facing diamond marker;
   * `'floor'` renders a flat, floor-anchored luminous projection (a QWEEN
   * "floor pad"). For a floor pad, `position` should sit on the ground —
   * y ≈ −(eye height) and a few metres ahead.
   */
  style?: 'billboard' | 'floor';
  /** Optional accent colour override (hex). Floor pads default to ice-cyan. */
  color?: string;
}

export interface FloorNodeConfig {
  /** Filename under /public/vr/panoramas/. */
  image: string;
  /**
   * Camera orientation on arrival. Omit to preserve the look direction the
   * user already had — hotspot-to-hotspot travel should feel like walking
   * forward, not snapping to a fixed heading. Only a floor's `entry` node
   * (reached via the floor selector or a fresh load) needs a deliberate
   * starting orientation.
   */
  initialCamera?: CameraOrientation;
  hotspots: FloorHotspotConfig[];
}

export interface FloorConfig {
  id: string;
  label: string;
  /** Node id shown when this floor is freshly selected. */
  entry: string;
  nodes: Record<string, FloorNodeConfig>;
}

/**
 * Floor-pad positions sit on the ground (y ≈ −eye height), placed per scene in
 * the open floor area. Every navigation hotspot renders as a flat QWEEN floor
 * projection (style defaults to 'floor' in data/scenes.ts). These values were
 * dialled in with the in-app editor (pencil icon / ?edit=true) — retune there
 * and paste the exported snippet back here.
 */
export const floors: Record<string, FloorConfig> = {
  ground: {
    id: 'ground',
    label: 'Ground Floor',
    entry: 'entry',
    nodes: {
      entry: {
        image: 'groundfloor-entry.jpg',
        initialCamera: { yaw: 0, pitch: 0 },
        hotspots: [{ target: 'middle2', position: { x: 1.88, y: -1.5, z: 2.61 } }],
      },
      middle2: {
        image: 'groundfloor-middle2.jpg',
        hotspots: [
          { target: 'entry', position: { x: -4.75, y: -1.5, z: 1.65 } },
          { target: 'last', position: { x: 0, y: -1.5, z: -3 } },
        ],
      },
      last: {
        image: 'groundfloor-last.jpg',
        hotspots: [{ target: 'middle2', position: { x: 0.86, y: -1.5, z: -4.94 } }],
      },
    },
  },
  first: {
    id: 'first',
    label: 'First Floor',
    entry: 'entry',
    nodes: {
      entry: {
        image: 'firstfloor-entry.jpg',
        initialCamera: { yaw: 0, pitch: 0 },
        hotspots: [{ target: 'middle', position: { x: 0.48, y: -1.5, z: 2.02 } }],
      },
      middle: {
        image: 'firstfloor-middle.jpg',
        hotspots: [
          { target: 'entry', position: { x: 0.9, y: -1.5, z: 4.79 } },
          { target: 'last', position: { x: 0, y: -1.5, z: -3 } },
        ],
      },
      last: {
        image: 'firstfloor-last.jpg',
        hotspots: [{ target: 'middle', position: { x: -0.33, y: -1.5, z: -2.25 } }],
      },
    },
  },
};

/** Display / iteration order for the floor selector. */
export const floorOrder: readonly string[] = ['ground', 'first'];

export function sceneIdFor(floorId: string, nodeId: string): string {
  return `${floorId}-${nodeId}`;
}

/** Which floor a scene id belongs to, or null if it isn't a floor node. */
export function getFloorIdForScene(sceneId: string): string | null {
  for (const id of floorOrder) {
    if (sceneId.startsWith(`${id}-`)) return id;
  }
  return null;
}

/** The scene id for a floor's entry node (used by the floor selector). */
export function getFloorEntrySceneId(floorId: string): string | null {
  const floor = floors[floorId];
  if (!floor) return null;
  return sceneIdFor(floor.id, floor.entry);
}
