'use client';

import { useEffect, useState } from 'react';
import type { XRSupport } from '@/lib/vr/webxr';

export interface FloorOption {
  id: string;
  label: string;
}

interface VRControlsProps {
  xrSupport: XRSupport | 'unknown';
  isVRMode: boolean;
  sceneName: string | null;
  isProductPanelOpen: boolean;
  isMuted: boolean;
  debugEnabled: boolean;
  floors: FloorOption[];
  activeFloorId: string | null;
  onEnterVR: () => void;
  onCloseProduct: () => void;
  onToggleMute: () => void;
  onToggleDebug: () => void;
  onSelectFloor: (floorId: string) => void;
  onPreloadFloor: (floorId: string) => void;
  onRecenter: () => void;
}

const IDLE_AFTER_MS = 3000;
const IDLE_OPACITY = 0.25;

/**
 * Fades the auto-hiding chrome (floor selector, mute/recenter/debug icons)
 * to ~25% opacity after 3s of inactivity, restoring smoothly on any
 * interaction (§6). Hotspots and the primary Enter-VR CTA are untouched —
 * they're not part of this idle-fade group.
 */
function useIdleFade(): number {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
    };
    reset();
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'pointerdown',
      'touchstart',
      'keydown',
      'wheel',
    ];
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, []);

  return idle ? IDLE_OPACITY : 1;
}

/**
 * 2D chrome shown outside the immersive session: the current-zone label,
 * the minimal floor selector (§4), the Enter-VR / desktop-fallback call to
 * action (§8), Recenter + View Controls + mute icons (§5), and a desktop
 * convenience Close button for the (in-scene) product panel (§13/§20).
 *
 * Kept minimal and out of the field of view (§14). Hidden entirely once a VR
 * session is presenting — the headset shows only the spatial UI (the ambient
 * track itself keeps playing through the headset's audio output).
 */
export function VRControls({
  xrSupport,
  isVRMode,
  sceneName,
  isProductPanelOpen,
  isMuted,
  debugEnabled,
  floors,
  activeFloorId,
  onEnterVR,
  onCloseProduct,
  onToggleMute,
  onToggleDebug,
  onSelectFloor,
  onPreloadFloor,
  onRecenter,
}: VRControlsProps) {
  const chromeOpacity = useIdleFade();

  if (isVRMode) return null;

  const immersive = xrSupport === 'immersive';

  return (
    <>
      {/* Zone label + floor selector — top centre. */}
      <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 text-center">
        {sceneName && (
          <>
            <div className="font-sans text-[10px] uppercase tracking-brand text-qween-mist">
              QWEEN
            </div>
            <div className="mt-1 font-display text-xl font-light text-qween-gold-soft">
              {sceneName}
            </div>
          </>
        )}

        {floors.length > 1 && (
          <div
            className="pointer-events-auto mt-3 flex items-center justify-center gap-3 rounded-full border border-qween-line bg-black/35 px-5 py-1.5 backdrop-blur transition-opacity duration-500"
            style={{ opacity: chromeOpacity }}
          >
            {floors.map((f, i) => (
              <div key={f.id} className="flex items-center gap-3">
                {i > 0 && <span className="text-[10px] text-qween-line">·</span>}
                <button
                  onClick={() => onSelectFloor(f.id)}
                  onMouseEnter={() => onPreloadFloor(f.id)}
                  onTouchStart={() => onPreloadFloor(f.id)}
                  aria-current={f.id === activeFloorId}
                  className={`font-sans text-[10px] uppercase tracking-widest transition ${
                    f.id === activeFloorId
                      ? 'text-qween-gold-soft'
                      : 'text-qween-mist hover:text-qween-diamond'
                  }`}
                >
                  {f.label}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Icon stack — top right: mute, recenter, View Controls. */}
      <div
        className="absolute right-5 top-5 z-30 flex flex-col gap-3 transition-opacity duration-500"
        style={{ opacity: chromeOpacity }}
      >
        <button
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute ambient music' : 'Mute ambient music'}
          title={isMuted ? 'Unmute ambient music' : 'Mute ambient music'}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-qween-line bg-black/50 text-qween-diamond backdrop-blur transition hover:bg-black/70"
        >
          <SpeakerIcon muted={isMuted} />
        </button>

        <button
          onClick={onRecenter}
          aria-label="Recenter view"
          title="Recenter view"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-qween-line bg-black/50 text-qween-diamond backdrop-blur transition hover:bg-black/70"
        >
          <RecenterIcon />
        </button>

        {/* View Controls toggle. Enables the debug HUD + tuning panel (2D
            here, in-scene 3D once in VR) without needing ?debug=true. */}
        <button
          onClick={onToggleDebug}
          aria-label={debugEnabled ? 'Hide View Controls' : 'Show View Controls'}
          title={debugEnabled ? 'Hide View Controls' : 'Show View Controls'}
          className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur transition ${
            debugEnabled
              ? 'border-qween-gold bg-qween-gold/90 text-qween-void hover:bg-qween-gold'
              : 'border-qween-line bg-black/50 text-qween-diamond hover:bg-black/70'
          }`}
        >
          <GearIcon />
        </button>
      </div>

      {/* Desktop convenience close for the spatial product panel. */}
      {isProductPanelOpen && (
        <button
          onClick={onCloseProduct}
          className="pointer-events-auto absolute right-5 top-44 z-30 rounded-full border border-qween-line bg-black/50 px-4 py-2 font-sans text-xs uppercase tracking-widest text-qween-diamond backdrop-blur transition hover:bg-black/70"
        >
          Close ✕
        </button>
      )}

      {/* Bottom call-to-action / hints. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex flex-col items-center gap-3">
        {immersive ? (
          <button
            onClick={onEnterVR}
            className="pointer-events-auto rounded-full border border-qween-line bg-qween-gold/90 px-8 py-3 font-sans text-sm font-medium uppercase tracking-widest text-qween-void shadow-lg transition hover:bg-qween-gold"
          >
            Enter VR
          </button>
        ) : (
          <div className="rounded-full border border-white/10 bg-black/45 px-5 py-2 font-sans text-[11px] uppercase tracking-widest text-qween-diamond backdrop-blur">
            {xrSupport === 'unknown' ? 'Preparing…' : 'View Store'}
          </div>
        )}

        {!immersive && (
          <div className="font-sans text-[11px] tracking-wide text-qween-mist">
            Drag to look around · Click a hotspot to explore
          </div>
        )}
      </div>
    </>
  );
}

/** Minimal gear glyph for the View Controls toggle. */
function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M12 3.5v2.1M12 18.4v2.1M20.5 12h-2.1M5.6 12H3.5M17.66 6.34l-1.49 1.49M7.83 16.17l-1.49 1.49M17.66 17.66l-1.49-1.49M7.83 7.83 6.34 6.34"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Minimal speaker glyph, with a slash overlay when muted. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4Z"
        fill="currentColor"
        opacity={0.9}
      />
      {!muted && (
        <path
          d="M16.5 8.5a5 5 0 0 1 0 7"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.8}
        />
      )}
      {muted && (
        <path
          d="M15.5 9.5 20 14M20 9.5l-4.5 4.5"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}
    </svg>
  );
}

/** Minimal crosshair glyph for the Recenter control. */
function RecenterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
