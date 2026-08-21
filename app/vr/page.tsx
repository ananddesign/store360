'use client';

import dynamic from 'next/dynamic';
import { QweenWordmark } from '@/components/QweenWordmark';

/**
 * The immersive route (§25).
 *
 * The experience is 100% browser-only (WebGL / WebXR / window). We load it with
 * `next/dynamic` + `ssr: false` so it never renders on the server — this is the
 * idiomatic pattern for a Three.js page and avoids prerendering a client-only
 * tree. Nothing here is meaningful to statically generate.
 *
 * Deep links handled inside VRExperience:
 *   /vr?scene=diamond-bar   → open directly into a scene
 *   /vr?debug=true          → developer debug overlay
 *   /vr?test=true           → live 360° tester (upload / list panoramas)
 */
const VRExperience = dynamic(
  () => import('@/components/vr/VRExperience').then((m) => m.VRExperience),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-qween-void">
        <QweenWordmark className="h-8 w-auto text-qween-gold-soft" />
      </div>
    ),
  },
);

export default function VRPage() {
  return (
    <main className="h-full w-full">
      <VRExperience />
    </main>
  );
}
