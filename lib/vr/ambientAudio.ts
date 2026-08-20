/**
 * Ambient background music (§14 — comfortable, non-intrusive spatial feel).
 *
 * A single looping HTML5 `<audio>` element — not spatial/positional audio
 * (that's a later layer per §26). Browsers block autoplay until a user
 * gesture, so `start()` is safe to call immediately: it attempts playback and,
 * if blocked, retries once on the first pointer/key interaction anywhere on
 * the page.
 */
export class AmbientAudio {
  private el: HTMLAudioElement;
  private muted = false;
  private started = false;
  private retryHandler: (() => void) | null = null;

  constructor(src: string, volume = 0.35) {
    this.el = new Audio(src);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = volume;
  }

  /** Attempt to start playback; silently retries after the next user gesture if blocked. */
  start(): void {
    if (this.started) return;
    void this.el
      .play()
      .then(() => {
        this.started = true;
      })
      .catch(() => {
        // Autoplay blocked — wait for the first real interaction.
        if (this.retryHandler) return;
        this.retryHandler = () => {
          void this.el.play().then(() => {
            this.started = true;
          });
          this.clearRetry();
        };
        window.addEventListener('pointerdown', this.retryHandler, { once: true });
        window.addEventListener('keydown', this.retryHandler, { once: true });
      });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.el.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** True once playback has actually started (useful for debugging autoplay). */
  isPlaying(): boolean {
    return this.started && !this.el.paused;
  }

  dispose(): void {
    this.clearRetry();
    this.el.pause();
    this.el.src = '';
  }

  private clearRetry(): void {
    if (!this.retryHandler) return;
    window.removeEventListener('pointerdown', this.retryHandler);
    window.removeEventListener('keydown', this.retryHandler);
    this.retryHandler = null;
  }
}
