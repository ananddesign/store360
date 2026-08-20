'use client';

import { useEffect, useRef, useState } from 'react';
import type { VRSceneEngine } from '@/lib/vr/engine';
import { DEBUG_VIEW_DEFAULTS, DEBUG_VIEW_RANGES } from '@/lib/vr/config';
import { getSceneById } from '@/data/scenes';

interface ViewControlsPanelProps {
  engine: VRSceneEngine | null;
  currentSceneId: string | null;
}

interface Tuning {
  eyeHeight: number;
  pitchLimit: number;
  panoramaRadius: number;
  initialPitch: number;
  initialYaw: number;
}

/**
 * Compact "View Controls" debug panel — visible only via `?debug=true`.
 *
 * Live-tunes camera eye height, desktop pitch clamp, panorama sphere radius,
 * and the current look orientation, all applied immediately through
 * VRSceneEngine's own setters (no scene reload, no architecture change: this
 * panel is a thin UI over methods the engine already exposes for this
 * purpose). Values are for exploration/tuning on Quest — "Copy Settings"
 * hands the numbers back as a config object to hardcode once they feel right.
 */
export function ViewControlsPanel({ engine, currentSceneId }: ViewControlsPanelProps) {
  const sceneYawDefault = currentSceneId
    ? getSceneById(currentSceneId)?.initialCamera?.yaw ?? 0
    : 0;

  const [open, setOpen] = useState(true);
  const [tuning, setTuning] = useState<Tuning>(() =>
    engine
      ? fromEngine(engine)
      : {
          eyeHeight: DEBUG_VIEW_DEFAULTS.eyeHeight,
          pitchLimit: DEBUG_VIEW_DEFAULTS.pitchLimitDeg,
          panoramaRadius: DEBUG_VIEW_DEFAULTS.panoramaRadius,
          initialPitch: DEBUG_VIEW_DEFAULTS.initialPitchDeg,
          initialYaw: sceneYawDefault,
        },
  );
  const [copied, setCopied] = useState(false);

  // Once the engine becomes available, mirror its (already debug-seeded)
  // eye height / pitch limit / panorama radius.
  const syncedEngineRef = useRef(false);
  useEffect(() => {
    if (!engine || syncedEngineRef.current) return;
    syncedEngineRef.current = true;
    const t = fromEngine(engine);
    setTuning((prev) => ({ ...prev, eyeHeight: t.eyeHeight, pitchLimit: t.pitchLimit, panoramaRadius: t.panoramaRadius }));
  }, [engine]);

  // Scene navigation re-applies each scene's own initialCamera orientation
  // (existing engine behaviour) — reflect that here so the sliders never show
  // a stale look direction after travelling to a new scene.
  useEffect(() => {
    if (!engine) return;
    const t = fromEngine(engine);
    setTuning((prev) => ({ ...prev, initialPitch: t.initialPitch, initialYaw: t.initialYaw }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneId, engine]);

  const update = (patch: Partial<Tuning>) => {
    const next = { ...tuning, ...patch };
    setTuning(next);
    engine?.setEyeHeight(next.eyeHeight);
    engine?.setPitchLimit(next.pitchLimit);
    engine?.setPanoramaRadius(next.panoramaRadius);
    engine?.setLookOrientation(next.initialYaw, next.initialPitch);
  };

  const handleReset = () => {
    const yaw = currentSceneId ? getSceneById(currentSceneId)?.initialCamera?.yaw ?? 0 : 0;
    update({
      eyeHeight: DEBUG_VIEW_DEFAULTS.eyeHeight,
      pitchLimit: DEBUG_VIEW_DEFAULTS.pitchLimitDeg,
      panoramaRadius: DEBUG_VIEW_DEFAULTS.panoramaRadius,
      initialPitch: DEBUG_VIEW_DEFAULTS.initialPitchDeg,
      initialYaw: yaw,
    });
  };

  const handleCopy = async () => {
    const text = [
      '{',
      `  eyeHeight: ${tuning.eyeHeight.toFixed(2)},`,
      `  pitchLimit: ${tuning.pitchLimit},`,
      `  panoramaRadius: ${tuning.panoramaRadius},`,
      `  initialPitch: ${tuning.initialPitch},`,
      `  initialYaw: ${tuning.initialYaw},`,
      '}',
    ].join('\n');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-40 w-72 max-w-[80vw] font-sans">
      <div className="overflow-hidden rounded-xl border border-qween-line bg-black/75 backdrop-blur">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[11px] uppercase tracking-widest text-qween-gold-soft">
            View Controls
          </span>
          <span className="text-qween-mist">{open ? '▾' : '▸'}</span>
        </button>

        {open && (
          <div className="px-4 pb-4">
            <SliderRow
              label="Eye Height"
              value={tuning.eyeHeight}
              range={DEBUG_VIEW_RANGES.eyeHeight}
              unit="m"
              decimals={2}
              onChange={(v) => update({ eyeHeight: v })}
            />
            <SliderRow
              label="Vertical View / Pitch"
              value={tuning.pitchLimit}
              range={DEBUG_VIEW_RANGES.pitchLimitDeg}
              unit="°"
              onChange={(v) => update({ pitchLimit: v })}
            />
            <SliderRow
              label="Panorama Radius"
              value={tuning.panoramaRadius}
              range={DEBUG_VIEW_RANGES.panoramaRadius}
              unit=""
              onChange={(v) => update({ panoramaRadius: v })}
            />
            <SliderRow
              label="Initial Pitch"
              value={tuning.initialPitch}
              range={DEBUG_VIEW_RANGES.initialPitchDeg}
              unit="°"
              onChange={(v) => update({ initialPitch: v })}
            />
            <SliderRow
              label="Initial Yaw"
              value={tuning.initialYaw}
              range={DEBUG_VIEW_RANGES.initialYawDeg}
              unit="°"
              onChange={(v) => update({ initialYaw: v })}
            />

            <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
              <button
                onClick={handleReset}
                className="flex-1 rounded-md border border-qween-line px-3 py-1.5 text-[11px] uppercase tracking-wider text-qween-diamond transition hover:bg-white/5"
              >
                Reset
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 rounded-md bg-qween-gold/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-qween-void transition hover:bg-qween-gold"
              >
                {copied ? 'Copied ✓' : 'Copy Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fromEngine(engine: VRSceneEngine): Tuning {
  const t = engine.getViewTuning();
  return {
    eyeHeight: t.eyeHeight,
    pitchLimit: t.pitchLimitDeg,
    panoramaRadius: t.panoramaRadius,
    initialPitch: t.initialPitchDeg,
    initialYaw: t.initialYawDeg,
  };
}

interface SliderRowProps {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  unit: string;
  decimals?: number;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, range, unit, decimals = 0, onChange }: SliderRowProps) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-qween-diamond">{label}</span>
        <span className="font-mono text-qween-gold-soft">
          {value.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-qween-gold"
      />
    </div>
  );
}

/** Clipboard write with a manual fallback for contexts lacking the async API. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy fallback below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
