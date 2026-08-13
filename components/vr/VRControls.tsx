'use client';

import type { XRSupport } from '@/lib/vr/webxr';

interface VRControlsProps {
  xrSupport: XRSupport | 'unknown';
  isVRMode: boolean;
  sceneName: string | null;
  isProductPanelOpen: boolean;
  onEnterVR: () => void;
  onCloseProduct: () => void;
}

/**
 * 2D chrome shown outside the immersive session: the current-zone label, the
 * Enter-VR / desktop-fallback call to action (§8), and a desktop convenience
 * Close button for the (in-scene) product panel (§13/§20).
 *
 * Kept minimal and out of the field of view (§14). Hidden entirely once a VR
 * session is presenting — the headset shows only the spatial UI.
 */
export function VRControls({
  xrSupport,
  isVRMode,
  sceneName,
  isProductPanelOpen,
  onEnterVR,
  onCloseProduct,
}: VRControlsProps) {
  if (isVRMode) return null;

  const immersive = xrSupport === 'immersive';

  return (
    <>
      {/* Zone label — top centre. */}
      {sceneName && (
        <div className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 text-center">
          <div className="font-sans text-[10px] uppercase tracking-brand text-qween-mist">
            QWEEN
          </div>
          <div className="mt-1 font-display text-xl font-light text-qween-gold-soft">
            {sceneName}
          </div>
        </div>
      )}

      {/* Desktop convenience close for the spatial product panel. */}
      {isProductPanelOpen && (
        <button
          onClick={onCloseProduct}
          className="pointer-events-auto absolute right-5 top-5 z-30 rounded-full border border-qween-line bg-black/50 px-4 py-2 font-sans text-xs uppercase tracking-widest text-qween-diamond backdrop-blur transition hover:bg-black/70"
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
