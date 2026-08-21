import * as THREE from 'three';
import { DEG2RAD } from './config';

/**
 * A soft "frosted glass" treatment of the extreme downward view (the nadir),
 * where 360° photography usually shows a tripod mount or a stitching seam.
 *
 * Rather than a solid mask (which would read as a dark spot / vignette), this
 * is a second sphere that samples the *same* panorama texture, blurred in the
 * fragment shader, and alpha-fades in over an elevation band. The underlying
 * environment therefore stays visible — it just goes progressively out of
 * focus toward straight-down — so there is no black hole, no hard edge, and no
 * vignette; only a smooth defocus.
 *
 * Geometry, radius and UVs mirror SceneManager's panorama sphere exactly, so
 * along every view ray the blurred texel lines up with the sharp one behind
 * it; the crossfade between them is what produces "subtle blur at fadeStart →
 * fully blurred at limit". A `discard` above the band means the blur taps only
 * run for the small bottom cap actually on screen when looking down — no
 * whole-frame post-processing, so Quest frame budget is unaffected (§22).
 *
 * This is purely visual: it never rotates the camera. The desktop pitch clamp
 * (VRSceneEngine) stops the camera at the limit; in an immersive session, where
 * head tracking can't be clamped, this blur is what the user sees if they tilt
 * all the way down.
 */
export class NadirBlur {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(
    radius: number,
    fadeStartDeg: number,
    limitDeg: number,
    blurRadius: number,
  ) {
    // Same construction as the panorama sphere → identical UVs, so sampling
    // the shared texture reproduces the environment (then blurs it).
    const geo = new THREE.SphereGeometry(radius, 64, 40);
    geo.scale(-1, 1, 1);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uMap: { value: null as THREE.Texture | null },
        uFadeStart: { value: fadeStartDeg * DEG2RAD },
        uLimit: { value: limitDeg * DEG2RAD },
        uBlur: { value: blurRadius },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vDir;
        void main() {
          vUv = uv;
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vDir;
        uniform sampler2D uMap;
        uniform float uFadeStart;
        uniform float uLimit;
        uniform float uBlur;

        // sRGB → linear so this matches the panorama's MeshBasicMaterial, which
        // three auto-decodes; the renderer re-encodes our linear output on write.
        vec3 toLinear(vec3 c) {
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }

        void main() {
          float elevation = asin(clamp(vDir.y, -1.0, 1.0));
          // 0 above fadeStart, eased up to 1 at/below the limit.
          float t = 1.0 - smoothstep(uLimit, uFadeStart, elevation);
          if (t <= 0.002) discard; // skip the whole upper sphere — no blur cost

          // Two rings of taps → a smooth frosted defocus. u is halved to keep
          // the kernel roughly circular in world space on a 2:1 equirect map.
          vec3 acc = toLinear(texture2D(uMap, vUv).rgb);
          float wsum = 1.0;
          for (int i = 0; i < 8; i++) {
            float a = (float(i) / 8.0) * 6.2831853;
            vec2 dir = vec2(cos(a) * 0.5, sin(a));
            acc += toLinear(texture2D(uMap, vUv + dir * uBlur).rgb);
            acc += toLinear(texture2D(uMap, vUv + dir * uBlur * 0.5).rgb);
            wsum += 2.0;
          }
          vec3 col = acc / wsum;
          gl_FragColor = vec4(col, t);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'nadir-blur';
    // Above the panorama, below hotspots / panels / the scene-transition fade,
    // so markers and UI stay crisp over the blurred floor.
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false; // shown once a texture is assigned
  }

  /** Share the current panorama texture (called on every scene swap). */
  setTexture(texture: THREE.Texture): void {
    this.material.uniforms.uMap!.value = texture;
    this.mesh.visible = true;
  }

  /** Match the panorama sphere's live radius scaling. */
  setRadiusScale(scale: number): void {
    this.mesh.scale.setScalar(scale);
  }

  /** Live-update the fade band (deg, negative = downward). */
  setLimits(fadeStartDeg: number, limitDeg: number): void {
    this.material.uniforms.uFadeStart!.value = fadeStartDeg * DEG2RAD;
    this.material.uniforms.uLimit!.value = limitDeg * DEG2RAD;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
