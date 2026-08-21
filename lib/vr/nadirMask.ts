import * as THREE from 'three';
import { DEG2RAD } from './config';

/**
 * A soft, always-on mask that hides the extreme downward view (the "nadir")
 * — typically an unfinished tripod mount or stitching seam in 360°
 * photography. Deliberately independent of the desktop pitch-look clamp
 * (`VRSceneEngine.setPitchLimit` / the View Controls "Vertical View / Pitch"
 * limit): the camera itself is never forcibly stopped from rotating, so
 * there is no hard "wall" to hit. That's not just a style choice — WebXR
 * head tracking can't be clamped at all (the headset's own tracked
 * orientation is authoritative), so a rotation-limit approach would only
 * ever work on desktop. Rendering an overlay that fades in works
 * identically on both, and never fights the headset.
 *
 * Implemented as a spherical cap that is *not* parented to the camera or rig
 * — its geometry never rotates, only its position follows the camera each
 * frame — so it always represents a fixed downward region regardless of
 * which way the user is currently looking. A fragment shader computes each
 * point's absolute elevation angle and fades in a solid colour between
 * `fadeStartDeg` and `limitDeg`, so the transition reads as a soft vignette
 * rather than a hard edge.
 *
 * Note: this is a colour/opacity fade, not a true pixel blur of the
 * panorama behind it — a real blur would need a render-to-texture pass,
 * which this project avoids for Quest frame budget (§22: no heavy
 * post-processing). The eased fade already reads as "soft," not abrupt.
 */
export class NadirMask {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(fadeStartDeg: number, limitDeg: number, color: number) {
    // Geometry spans elevation -30°..-90°: a 15° buffer above fadeStartDeg
    // (so the shader's own alpha=0 region always has real geometry behind
    // it, not a hard mesh edge) down to straight-down, so there is never a
    // seam even if a VR user tilts all the way down.
    const geo = new THREE.SphereGeometry(
      6,
      48,
      16,
      0,
      Math.PI * 2,
      (90 + 30) * DEG2RAD,
      60 * DEG2RAD,
    );
    // Render the inside surface — the camera sits inside this sphere, same
    // convention as the main panorama sphere.
    geo.scale(-1, 1, 1);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uFadeStart: { value: fadeStartDeg * DEG2RAD },
        uLimit: { value: limitDeg * DEG2RAD },
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float uFadeStart;
        uniform float uLimit;
        uniform vec3 uColor;
        void main() {
          float elevation = asin(clamp(vDir.y, -1.0, 1.0));
          // 0 above uFadeStart, 1 at/beyond uLimit, eased in between.
          float t = 1.0 - smoothstep(uLimit, uFadeStart, elevation);
          gl_FragColor = vec4(uColor, t);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'nadir-mask';
    // Above the panorama, below hotspots/panels/the scene-transition fade.
    this.mesh.renderOrder = 5;
    // A partial cap's bounding sphere is off-centre from the mesh origin;
    // never let an incorrect culling check hide it.
    this.mesh.frustumCulled = false;
  }

  /** Call every frame with the camera's current world position. */
  update(cameraWorldPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraWorldPosition);
  }

  /** Live-update the fade start / hard limit (deg, negative = downward). */
  setLimits(fadeStartDeg: number, limitDeg: number): void {
    this.material.uniforms.uFadeStart!.value = fadeStartDeg * DEG2RAD;
    this.material.uniforms.uLimit!.value = limitDeg * DEG2RAD;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
