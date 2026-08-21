import * as THREE from 'three';
import { DEG2RAD } from './config';

/**
 * World-fixed nadir (floor) blur cap.
 *
 * The immersive headset owns the camera pose and must never be fought, so we
 * can't "stop" a real head from tilting down to the floor. The previous
 * approach counter-rotated the whole world past the limit — which made the
 * entire panorama slide with the head (uncomfortable). Instead this leaves the
 * world perfectly still and simply *blurs the floor*: a thin spherical cap over
 * the bottom of the panorama sphere, sampling the same panorama texture with a
 * small multi-tap blur and fading in as the region drops past the limit.
 *
 * It is parented to the world rig, so it is world-fixed: the floor stays put,
 * nothing slides, and it's a soft blur — never a dark overlay. On desktop the
 * look is hard-clamped above the limit, so the cap is simply never in view.
 *
 * Colour space: the fragment samples and outputs raw texels with no decode /
 * re-encode, matching the panorama's own MeshBasicMaterial round-trip — so the
 * blurred floor reads at the same brightness as the sharp floor above it (an
 * earlier decode-without-encode attempt darkened it, which is avoided here).
 */
export class NadirBlur {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private baseRadius: number;

  /**
   * @param radius      Panorama sphere radius; the cap sits just inside it.
   * @param limitDeg    Elevation (deg below horizon, negative) at which the
   *                    floor is fully blurred. The fade begins ~10° above it.
   */
  constructor(radius: number, limitDeg = -55) {
    // Fully-blurred at `limitDeg`, fully-sharp (transparent) ~10° above it, so
    // the transition is a soft fade rather than a hard ring.
    const fadeStartDeg = limitDeg + 10; // e.g. −45°
    // Polar angle (from +Y) = 90° − elevation. Cover from fadeStart to nadir.
    const thetaStart = (90 - fadeStartDeg) * DEG2RAD; // e.g. 135°
    const thetaLength = Math.PI - thetaStart; // down to 180° (nadir)

    this.baseRadius = radius * 0.985;
    const geo = new THREE.SphereGeometry(
      this.baseRadius, // just inside the panorama so it wins the depth-free draw
      64,
      24,
      0,
      Math.PI * 2,
      thetaStart,
      thetaLength,
    );
    geo.scale(-1, 1, 1); // render the inside surface

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        blurRadius: { value: 0.006 }, // in equirect UV units
        fadeStartY: { value: Math.sin(fadeStartDeg * DEG2RAD) },
        fadeEndY: { value: Math.sin(limitDeg * DEG2RAD) },
        // How far the blurred floor is lifted toward white (0 = raw floor,
        // 1 = pure white). Keeps the treatment a soft, bright frost rather
        // than a muddy grey smear.
        whiteness: { value: 0.78 },
        // Peak opacity of the frost at the nadir.
        maxAlpha: { value: 0.9 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          // Direction from sphere centre to this vertex (object space is fine —
          // the cap is centred on the rig origin, i.e. the viewer).
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D map;
        uniform float blurRadius;
        uniform float fadeStartY;
        uniform float fadeEndY;
        uniform float whiteness;
        uniform float maxAlpha;
        varying vec3 vDir;

        const float PI = 3.141592653589793;

        vec2 dirToUv(vec3 d) {
          // Equirectangular mapping matching three's SphereGeometry UVs.
          float u = atan(d.x, -d.z) / (2.0 * PI) + 0.5;
          float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
          return vec2(u, v);
        }

        void main() {
          vec3 d = normalize(vDir);
          vec2 uv = dirToUv(d);

          // Gaussian-weighted 7x7 blur in UV space. The horizontal step is only
          // gently widened toward the pole and hard-capped, so the taps never
          // fan out into the patchy smear the old box blur produced.
          float horiz = blurRadius * clamp(1.0 / sqrt(1.0 - d.y * d.y), 1.0, 2.5);
          vec3 sum = vec3(0.0);
          float wsum = 0.0;
          for (int i = -3; i <= 3; i++) {
            for (int j = -3; j <= 3; j++) {
              float w = exp(-(float(i * i + j * j)) / 8.0); // gaussian falloff
              vec2 o = vec2(float(i) * horiz, float(j) * blurRadius);
              sum += texture2D(map, uv + o).rgb * w;
              wsum += w;
            }
          }
          vec3 blurred = sum / wsum;

          // Lift toward white so the floor reads as a soft, bright frost rather
          // than a grey smear.
          vec3 col = mix(blurred, vec3(1.0), whiteness);

          // Fade the frost in as the fragment drops from fadeStartY → fadeEndY.
          float a = smoothstep(fadeStartY, fadeEndY, d.y) * maxAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'nadir-blur';
    this.mesh.renderOrder = 5; // above the panorama (0), below hotspots (10)
    this.mesh.frustumCulled = false;
    this.mesh.visible = false; // shown only while presenting in VR
  }

  /** Point the cap at the current panorama texture. */
  setTexture(texture: THREE.Texture | null): void {
    this.material.uniforms.map!.value = texture;
  }

  /** Match a live panorama-radius change (debug panel). */
  setRadius(radius: number): void {
    this.mesh.scale.setScalar((radius * 0.985) / this.baseRadius);
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
