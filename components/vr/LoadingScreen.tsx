'use client';

interface LoadingScreenProps {
  /** 0–1; when omitted the bar shows an indeterminate shimmer. */
  progress?: number;
  visible: boolean;
}

/**
 * QWEEN-branded loading screen (§19). Restrained: a monogram, a wordmark, and a
 * thin progress line. No heavy splash animation.
 */
export function LoadingScreen({ progress, visible }: LoadingScreenProps) {
  const pct = progress !== undefined ? Math.round(progress * 100) : undefined;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-qween-void transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="flex flex-col items-center">
        <div className="font-display text-6xl font-light text-qween-gold-soft animate-shimmer">
          Q
        </div>
        <div className="mt-6 font-sans text-xs uppercase tracking-brand text-qween-diamond/80">
          Entering QWEEN
        </div>
        <div className="mt-2 font-sans text-[11px] text-qween-mist">
          Preparing your experience…
        </div>

        <div className="mt-8 h-px w-56 overflow-hidden bg-white/10">
          {pct !== undefined ? (
            <div
              className="h-full bg-qween-gold transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-[shimmer_1.6s_ease-in-out_infinite] bg-qween-gold" />
          )}
        </div>
      </div>
    </div>
  );
}
