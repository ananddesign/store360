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
  /** Nudge one axis of a hotspot by ±step (metres). */
  onNudge: (id: string, axis: 'x' | 'y' | 'z', delta: number) => void;
  /** Set an exact position (from a typed value). */
  onSetPosition: (id: string, pos: { x: number; y: number; z: number }) => void;
}

const STEPS = [0.1, 0.25, 0.5, 1] as const;

/**
 * Desktop hotspot placement editor (§?edit=true).
 *
 * Two ways to place a hotspot:
 *  - Drag it in the 3D view (coarse) — floor pads slide across the floor,
 *    billboards swing around the view sphere.
 *  - Fine-tune each axis with the −/+ nudge buttons or type an exact value.
 *
 * The engine mutates the in-memory scene data live; this panel mirrors the
 * positions and generates a `data/floors.ts`-ready snippet to copy back
 * (runtime edits aren't persisted — paste the snippet to bake them in).
 */
export function HotspotEditor({
  hotspots,
  sceneName,
  currentSceneId,
  onGoToScene,
  onNudge,
  onSetPosition,
}: HotspotEditorProps) {
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<number>(0.25);
  const [selected, setSelected] = useState<string | null>(null);

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
    <div className="pointer-events-auto absolute left-3 top-3 z-50 flex max-h-[94vh] w-[340px] flex-col rounded-md border border-white/10 bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-qween-diamond backdrop-blur">
      <div className="mb-1 font-sans text-[10px] uppercase tracking-brand text-qween-gold-soft">
        Hotspot Editor
      </div>
      <div className="mb-2 text-qween-mist">
        Drag a pad in the view for coarse placement, or use −/+ (or type) below
        for precise nudges. Clicks don’t navigate in edit mode.
      </div>

      <div className="text-qween-mist">
        scene: <span className="text-qween-diamond">{sceneName ?? currentSceneId ?? '—'}</span>
      </div>

      {/* Step size selector — shared by all nudge buttons. */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-qween-mist">step</span>
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                s === step
                  ? 'border-qween-gold bg-qween-gold/80 text-qween-void'
                  : 'border-qween-line text-qween-diamond hover:bg-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-qween-mist">m</span>
      </div>

      {/* Per-hotspot precise controls. */}
      <div className="mt-2 border-t border-white/10 pt-2">
        {hotspots.length === 0 && (
          <div className="text-qween-mist">no hotspots in this scene</div>
        )}
        {hotspots.map((h) => {
          const isSel = selected === h.id;
          return (
            <div
              key={h.id}
              className={`mb-2 rounded border p-2 transition ${
                isSel ? 'border-qween-gold/60 bg-white/[0.03]' : 'border-white/10'
              }`}
              onMouseEnter={() => setSelected(h.id)}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  onClick={() => onGoToScene(h.targetSceneId)}
                  title={`Open ${h.targetSceneId}`}
                  className="text-left text-qween-gold-soft underline decoration-dotted underline-offset-2 hover:text-qween-diamond"
                >
                  → {h.targetSceneId}
                </button>
                <span className="text-[9px] uppercase tracking-widest text-qween-mist">
                  {h.style}
                </span>
              </div>

              {(['x', 'y', 'z'] as const).map((axis) => (
                <AxisRow
                  key={axis}
                  axis={axis}
                  value={h.position[axis]}
                  onDec={() => onNudge(h.id, axis, -step)}
                  onInc={() => onNudge(h.id, axis, step)}
                  onSet={(v) => onSetPosition(h.id, { ...h.position, [axis]: v })}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Jump to any scene so every scene's pads can be edited. */}
      <div className="mt-1 border-t border-white/10 pt-1">
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
        <span className="font-sans text-[10px] text-qween-mist">→ paste to Claude / data/floors.ts</span>
      </div>

      <pre className="mt-2 max-h-[32vh] select-text overflow-auto rounded border border-white/10 bg-black/60 p-2 text-[10px] leading-snug text-qween-mist">
        {exportText}
      </pre>
    </div>
  );
}

/** One X/Y/Z row: −  [editable value]  + */
function AxisRow({
  axis,
  value,
  onDec,
  onInc,
  onSet,
}: {
  axis: 'x' | 'y' | 'z';
  value: number;
  onDec: () => void;
  onInc: () => void;
  onSet: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft);
    if (!Number.isNaN(v)) onSet(Math.round(v * 100) / 100);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="w-3 text-qween-mist">{axis}</span>
      <button
        onClick={onDec}
        className="h-5 w-5 rounded border border-qween-line text-qween-diamond transition hover:bg-white/10"
      >
        −
      </button>
      <input
        value={draft ?? value.toFixed(2)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setDraft(value.toFixed(2));
          e.currentTarget.select();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(null);
        }}
        inputMode="decimal"
        className="w-16 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 text-center text-qween-diamond outline-none focus:border-qween-gold/60"
      />
      <button
        onClick={onInc}
        className="h-5 w-5 rounded border border-qween-line text-qween-diamond transition hover:bg-white/10"
      >
        +
      </button>
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
