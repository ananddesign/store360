/**
 * WebXR capability detection (§8).
 *
 * We distinguish three states so the UI can show the right call to action:
 *  - 'immersive'  → a VR headset session is available → "ENTER VR"
 *  - 'inline'     → WebXR exists but no immersive-vr → desktop fallback ("View Store")
 *  - 'unsupported'→ no WebXR at all → desktop fallback
 */

export type XRSupport = 'immersive' | 'inline' | 'unsupported';

export async function detectXRSupport(): Promise<XRSupport> {
  if (typeof navigator === 'undefined' || !('xr' in navigator) || !navigator.xr) {
    return 'unsupported';
  }
  try {
    const immersive = await navigator.xr.isSessionSupported('immersive-vr');
    return immersive ? 'immersive' : 'inline';
  } catch {
    return 'unsupported';
  }
}

/** True when the current document is served in a secure context (HTTPS/localhost). */
export function isSecureContextOk(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}
