'use client';

import { useState } from 'react';
import type { EditableHotspot } from '@/lib/vr/engine';
import { scenes } from '@/data/scenes';
import { getFloorIdForScene } from '@/data/floors';

interface HotspotEditorProps {
  /** Current scene's hotspots (live positions), emitted by the engine. */
  hotspots: EditableHotspot[];
  sceneName: string | null;
  currentSceneId: string | null;
  /** Jump to any scene (so every scene's pads can be edited). */
  onGoToScene: (sceneId: string) => void;
}

/**
 * Desktop hotspot placement editor (§?edit=true).
 *
 * Drag a hotspot in the 3D view to move it — floor pads slide across the floor,
 * billboards swing around the view sphere. The engine mutates the in-memory
 * scene data as you drag; this panel mirrors the live positions and generates a
 * `data/floors.ts`-ready snippet to copy back (runtime edits aren't persisted).
 */
export function HotspotEditor({
  hotspots,
  sceneName,
  currentSceneId,
  onGoToScene,
}: HotspotEditorProps) {
  const [copied, setCopied] = useState(false);

  const exportText = generateFloorsSnippet();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the <pre> below is selectable as a fallback */
    }
  };

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-50 flex max-h-[92vh] w-[320px] flex-col rounded-md border border-white/10 bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-qween-diamond backdrop-blur">
      <div className="mb-1 font-sans text-[10px] uppercase tracking-brand text-qween-gold-soft">
        Hotspot Editor
      </div>
      <div className="mb-2 text-qween-mist">
        Drag a hotspot to move it. Clicks don’t navigate in edit mode — use the
        floor selector to change scenes. Positions update live below.
      </div>

      <div className="text-qween-mist">
        scene: <span className="text-qween-diamond">{sceneName ?? currentSceneId ?? '—'}</span>
      </div>

      <div className="mt-1 border-t border-white/10 pt-1">
        <div className="mb-1 text-qween-mist">hotspots here (click → to open its view):</div>
        {hotspots.length === 0 && <div className="text-qween-mist">no hotspots here</div>}
        {hotspots.map((h) => (
          <div key={h.id} className="flex items-baseline justify-between gap-2 py-0.5">
            <button
              onClick={() => onGoToScene(h.targetSceneId)}
              title={`Open ${h.targetSceneId}`}
              className="text-left text-qween-gold-soft underline decoration-dotted underline-offset-2 hover:text-qween-diamond"
            >
              → {h.targetSceneId}
            </button>
            <span className="shrink-0 text-qween-mist">
              {fmt(h.position.x)}, {fmt(h.position.y)}, {fmt(h.position.z)}
            </span>
          </div>
        ))}
      </div>

      {/* Jump to any scene so every scene's pads can be edited. */}
      <div className="mt-2 border-t border-white/10 pt-1">
        <div className="mb-1 text-qween-mist">go to scene:</div>
        {sceneGroups.map(({ floorId, ids }) => (
          <div key={floorId} className="mb-1">
            <div className="text-[10px] uppercase tracking-widest text-qween-mist">{floorId}</div>
            <div className="flex flex-wrap gap-1">
              {ids.map((id) => (
                <button
                  key={id}
                  onClick={() => onGoToScene(id)}
                  className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                    id === currentSceneId
                      ? 'border-qween-gold bg-qween-gold/80 text-qween-void'
                      : 'border-qween-line text-qween-diamond hover:bg-white/10'
                  }`}
                >
                  {nodeOf(id, floorId)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
        <button
          onClick={copy}
          className="rounded border border-qween-line bg-qween-gold/90 px-3 py-1 font-sans text-[10px] uppercase tracking-widest text-qween-void transition hover:bg-qween-gold"
        >
          {copied ? 'Copied ✓' : 'Copy all positions'}
        </button>
        <span className="font-sans text-[10px] text-qween-mist">→ data/floors.ts</span>
      </div>

      <pre className="mt-2 max-h-[40vh] select-text overflow-auto rounded border border-white/10 bg-black/60 p-2 text-[10px] leading-snug text-qween-mist">
        {exportText}
      </pre>
    </div>
  );
}

/** All scenes grouped by floor, in graph order — for the "go to scene" list. */
const sceneGroups: { floorId: string; ids: string[] }[] = (() => {
  const groups: { floorId: string; ids: string[] }[] = [];
  for (const s of scenes) {
    const floorId = getFloorIdForScene(s.id) ?? 'other';
    let g = groups.find((x) => x.floorId === floorId);
    if (!g) {
      g = { floorId, ids: [] };
      groups.push(g);
    }
    g.ids.push(s.id);
  }
  return groups;
})();

/** Bare node name of a scene id within its floor (e.g. "ground-middle2" → "middle2"). */
function nodeOf(sceneId: string, floorId: string): string {
  return sceneId.startsWith(`${floorId}-`) ? sceneId.slice(floorId.length + 1) : sceneId;
}

/** Strip the floor prefix from a scene id → the bare node name. */
function targetNode(sceneId: string): string {
  const floor = getFloorIdForScene(sceneId);
  return floor ? sceneId.slice(floor.length + 1) : sceneId;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * Build a `data/floors.ts`-ready snippet from the live (edited) scene graph.
 * Grouped by scene; one line per hotspot. `style` is emitted only when it
 * isn't the default `'floor'`.
 */
function generateFloorsSnippet(): string {
  const out: string[] = ['// QWEEN hotspot positions — paste into data/floors.ts'];
  for (const s of scenes) {
    const floorId = getFloorIdForScene(s.id);
    const nodeId = floorId ? s.id.slice(floorId.length + 1) : s.id;
    const navs = s.hotspots.filter((h) => h.type === 'navigation');
    if (navs.length === 0) continue;
    out.push('', `// ${floorId} · ${nodeId}`);
    for (const h of navs) {
      if (h.type !== 'navigation') continue;
      const p = h.position;
      const style = h.style && h.style !== 'floor' ? `, style: '${h.style}'` : '';
      out.push(
        `{ target: '${targetNode(h.targetSceneId)}', position: { x: ${r(p.x)}, y: ${r(p.y)}, z: ${r(p.z)} }${style} },`,
      );
    }
  }
  return out.join('\n');
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}
