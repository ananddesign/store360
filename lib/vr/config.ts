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
