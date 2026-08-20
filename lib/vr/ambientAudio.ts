/**
 * Ambient background music (§14 — comfortable, non-intrusive spatial feel).
 *
 * A single looping HTML5 `<audio>` element — not spatial/positional audio
 * (that's a later layer per §26). Browsers block autoplay until a user
 * gesture, so `start()` is safe to call immediately: it attempts playback and,
 * if blocked, keeps listening for the next pointer/key interaction anywhere on
 * the page and retries then — on every interaction until it succeeds, not just
 * the first one, since a single missed/late gesture shouldn't mean permanent
 * silence.
 *
 * Guards against a disposed instance still reacting to a late-arriving promise
 * rejection or a queued gesture (notably React StrictMode's dev-only
 * double-invoke of effects, which briefly creates and tears down a first
 * instance before the real one mounts).
 */
export class AmbientAudio {
  private el: HTMLAudioElement;
  private muted = false;
  private started = false;
  private disposed = false;
  private retryHandler: (() => void) | null = null;

  constructor(src: string, volume = 0.35) {
    this.el = new Audio(src);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = volume;
  }

  /** Attempt to start playback; if blocked, arms a retry for the next user gesture. */
  start(): void {
    if (this.started || this.disposed) return;
    this.attemptPlay();
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
    this.disposed = true;
    this.clearRetry();
    this.el.pause();
    this.el.src = '';
  }

  private attemptPlay(): void {
    if (this.disposed) return;
    void this.el
      .play()
      .then(() => {
        if (this.disposed) return;
        this.started = true;
        this.clearRetry();
      })
      .catch(() => {
        // Blocked (no user gesture yet, or the gesture wasn't enough this
        // time) — stay armed and try again on the next interaction.
        if (this.disposed || this.started) return;
        this.armRetry();
      });
  }

  private armRetry(): void {
    if (this.retryHandler || this.disposed) return;
    this.retryHandler = () => this.attemptPlay();
    window.addEventListener('pointerdown', this.retryHandler);
    window.addEventListener('keydown', this.retryHandler);
  }

  private clearRetry(): void {
    if (!this.retryHandler) return;
    window.removeEventListener('pointerdown', this.retryHandler);
    window.removeEventListener('keydown', this.retryHandler);
    this.retryHandler = null;
  }
}
