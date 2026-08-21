'use client';

import type { DebugInfo } from '@/lib/vr/engine';

interface DebugOverlayProps {
  info: DebugInfo | null;
}

/**
 * Development-only debug overlay (§21). Activated via `/vr?debug=true`.
 * Shows scene, FPS, WebXR status, camera pose, loaded textures and hotspot ids.
 * Hotspot *positions* are visualised in-scene as wireframe octahedra (see
 * engine.rebuildDebugGizmos).
 */
export function DebugOverlay({ info }: DebugOverlayProps) {
  if (!info) return null;
  const [px, py, pz] = info.cameraPosition;
  const [rx, ry, rz] = info.cameraRotationDeg;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-50 max-w-xs rounded-md border border-white/10 bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-qween-diamond backdrop-blur">
      <Row k="scene" v={info.sceneId ?? '—'} />
      <Row k="fps" v={String(info.fps)} accent={info.fps < 60} />
      <Row k="webxr" v={info.xr} />
      <Row k="cam.pos" v={`${px}, ${py}, ${pz}`} />
      <Row k="cam.rot°" v={`${rx}, ${ry}, ${rz}`} />
      <Row
        k="VR Pitch"
        v={info.vrPitchDeg === null ? '— (desktop)' : `${info.vrPitchDeg}°`}
      />
      <Row
        k="VR Pitch Limit"
        v={
          info.vrPitchLimitDeg[0] === -info.vrPitchLimitDeg[1]
            ? `±${info.vrPitchLimitDeg[1]}°`
            : `${info.vrPitchLimitDeg[0]}° / +${info.vrPitchLimitDeg[1]}°`
        }
      />
      <Row k="textures" v={info.loadedTextures.join(', ') || '—'} />
      <Row k="hovered" v={info.hovered ?? '—'} />
      <div className="mt-1 border-t border-white/10 pt-1 text-qween-mist">
        hotspots
      </div>
      {info.hotspotIds.map((id) => (
        <div key={id} className="text-qween-gold-soft">
          ● {id}
        </div>
      ))}
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-qween-mist">{k}</span>
      <span className={accent ? 'text-red-400' : 'text-qween-diamond'}>{v}</span>
    </div>
  );
}
