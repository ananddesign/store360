/**
 * Central tuning knobs for the VR experience. Keep magic numbers here so the
 * whole system can be re-balanced from one file.
 */
export const VR_CONFIG = {
  /** Conceptual standing eye height (m). See note in engine.ts — with a
   *  panorama the eye sits at the camera's capture height; this is retained
   *  for documentation and future floor-anchored (3D) environments. */
  playerHeight: 1.6,

  /** Inverted panorama sphere radius (m). Large enough to feel infinite. */
  panoramaRadius: 500,

  /** Field of view for the desktop / fallback camera (deg). */
  desktopFov: 70,

  /** Scene fade transition duration (ms) — §16 target 300–700ms. */
  transitionMs: 500,

  /** Pitch clamp for desktop drag-look (deg) to avoid gimbal flip. */
  maxPitchDeg: 85,

  /** Desktop drag-look sensitivity (deg per pixel). */
  dragSensitivity: 0.12,

  /** Keyboard yaw step for desktop arrow-key look (deg). */
  keyboardYawStep: 4,

  hotspot: {
    /** On-screen size of a hotspot marker in metres at its placement distance. */
    navScale: 0.55,
    productScale: 0.32,
    /** Extra scale applied while hovered. */
    hoverScale: 1.25,
  },

  productPanel: {
    /** Distance the panel floats in front of the user (m) — §14: 1.5–2m. */
    distance: 1.85,
    width: 1.1,
    height: 1.4,
  },

  /** Target headset framerate we design against (§22). */
  targetFps: 72,
} as const;

/** Degrees → radians. */
export const DEG2RAD = Math.PI / 180;

/**
 * Defaults/ranges for the live "View Controls" debug panel
 * (components/vr/ViewControlsPanel.tsx, shown only via `?debug=true`).
 *
 * Deliberately a separate baseline from VR_CONFIG's shipped production
 * values above — the panel exists to explore settings different from what's
 * currently baked in, so entering debug mode seeds these values rather than
 * whatever VR_CONFIG happens to say. Leaving debug mode / a fresh page load
 * without `?debug=true` is unaffected and keeps the VR_CONFIG production
 * behaviour untouched.
 */
export const DEBUG_VIEW_DEFAULTS = {
  eyeHeight: 1.6,
  pitchLimitDeg: 55,
  panoramaRadius: 50,
  initialPitchDeg: 0,
} as const;

export const DEBUG_VIEW_RANGES = {
  eyeHeight: { min: 1.4, max: 1.9, step: 0.01 },
  pitchLimitDeg: { min: 30, max: 80, step: 1 },
  panoramaRadius: { min: 20, max: 100, step: 1 },
  initialPitchDeg: { min: -20, max: 20, step: 1 },
  initialYawDeg: { min: -180, max: 180, step: 1 },
} as const;

/**
 * Tap-step size for the in-headset 3D View Controls panel
 * (lib/vr/viewControlsPanel3D.ts). Coarser than DEBUG_VIEW_RANGES' `step`
 * (which sizes the desktop 2D slider) — precise continuous dragging via a
 * controller ray is uncomfortable in practice, so the in-VR panel uses
 * discrete +/- taps instead; these sizes keep a full sweep across each
 * range to a reasonable number of taps.
 */
export const DEBUG_VIEW_VR_STEPS = {
  eyeHeight: 0.05,
  pitchLimitDeg: 5,
  panoramaRadius: 10,
  initialPitchDeg: 5,
  initialYawDeg: 15,
} as const;

/**
 * Always-on "hide the nadir" mask (lib/vr/nadirMask.ts) — softly obscures the
 * extreme downward view, where a tripod mount or a stitching seam commonly
 * ruins 360° photography. Independent of the desktop pitch-look clamp
 * (`maxPitchDeg` / the View Controls pitch limit): it never touches camera
 * rotation — it can't, for a headset, since head tracking is authoritative —
 * it only renders an increasingly opaque overlay as the gaze direction
 * approaches `limitDeg`. Full 360° horizontal look is completely unaffected.
 */
export const NADIR_MASK_CONFIG = {
  /** Elevation (deg, negative = downward) where the fade begins. */
  fadeStartDeg: -45,
  /** Elevation (deg, negative = downward) beyond which the view is fully masked. */
  limitDeg: -55,
  /** Mask colour — matches the QWEEN void background. */
  color: 0x0a0a0b,
} as const;
