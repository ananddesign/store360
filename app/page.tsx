import Link from 'next/link';
import { QweenWordmark } from '@/components/QweenWordmark';

/**
 * Landing → Enter QWEEN Store (§1). Deliberately quiet: the QWEEN wordmark, one
 * line of intent, a single call to action into the immersive experience.
 */
export default function Landing() {
  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-qween-void px-6 text-center">
      {/* Subtle radial glow backdrop. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 42%, rgba(201,161,90,0.10), rgba(10,10,11,0) 70%)',
        }}
      />

      <div className="relative flex flex-col items-center">
        <h1 className="sr-only">QWEEN</h1>
        <QweenWordmark className="h-11 w-auto text-qween-gold-soft" />
        <p className="mt-8 max-w-md font-display text-2xl font-light leading-relaxed text-qween-diamond">
          A spatial jewellery showroom, crafted for Meta Quest and the web.
        </p>

        <Link
          href="/vr"
          className="mt-10 rounded-full border border-qween-line bg-qween-gold/90 px-9 py-3 font-sans text-sm font-medium uppercase tracking-widest text-qween-void transition hover:bg-qween-gold"
        >
          Enter QWEEN Store
        </Link>

        <p className="mt-6 font-sans text-[11px] tracking-wide text-qween-mist">
          Best experienced in a Meta Quest headset · Works on desktop too
        </p>
      </div>
    </main>
  );
}
