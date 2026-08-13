import type {
  AnalyticsEvent,
  AnalyticsPayload,
  AnalyticsProvider,
} from '@/types/vr';

/**
 * Lightweight, vendor-agnostic analytics abstraction (§24).
 *
 * In development everything is console-logged. In production a real provider
 * can be registered via `setAnalyticsProvider()` — nothing in the UI needs to
 * change. This deliberately avoids coupling the experience to any one vendor.
 */

const isDev = process.env.NODE_ENV !== 'production';

/** Default sink: console in dev, no-op in prod until a provider is set. */
class ConsoleProvider implements AnalyticsProvider {
  track(event: AnalyticsEvent, payload?: AnalyticsPayload): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(`%c[analytics] ${event}`, 'color:#c9a15a', payload ?? {});
    }
  }
}

let provider: AnalyticsProvider = new ConsoleProvider();

/** Swap the analytics sink (e.g. wire GA / Segment / Amplitude in production). */
export function setAnalyticsProvider(next: AnalyticsProvider): void {
  provider = next;
}

/* ------------------------------------------------------------------ *
 * Session-level metrics (§24): duration, scene dwell time, scenes
 * explored, products viewed. Kept in-memory; flushed on demand.
 * ------------------------------------------------------------------ */

interface SessionMetrics {
  startedAt: number;
  scenesExplored: Set<string>;
  productsViewed: Set<string>;
  currentSceneId: string | null;
  currentSceneEnteredAt: number;
}

let session: SessionMetrics | null = null;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function trackEvent(
  event: AnalyticsEvent,
  payload?: AnalyticsPayload,
): void {
  // Maintain derived session metrics as a side effect of key events.
  if (event === 'session_started') {
    session = {
      startedAt: now(),
      scenesExplored: new Set(),
      productsViewed: new Set(),
      currentSceneId: null,
      currentSceneEnteredAt: now(),
    };
  }

  if (session) {
    if (event === 'scene_viewed' && typeof payload?.sceneId === 'string') {
      // Emit dwell time for the scene we're leaving.
      if (session.currentSceneId && session.currentSceneId !== payload.sceneId) {
        const dwellMs = Math.round(now() - session.currentSceneEnteredAt);
        provider.track('scene_transition_completed', {
          from: session.currentSceneId,
          to: payload.sceneId,
          dwellMs,
        });
      }
      session.scenesExplored.add(payload.sceneId);
      session.currentSceneId = payload.sceneId;
      session.currentSceneEnteredAt = now();
    }
    if (
      (event === 'product_hotspot_viewed' || event === 'product_panel_opened') &&
      typeof payload?.productId === 'string'
    ) {
      session.productsViewed.add(payload.productId);
    }
  }

  provider.track(event, payload);
}

/** Snapshot of the current session for a summary/flush (e.g. on unload). */
export function getSessionSummary(): AnalyticsPayload {
  if (!session) return {};
  return {
    durationMs: Math.round(now() - session.startedAt),
    scenesExplored: session.scenesExplored.size,
    productsViewed: session.productsViewed.size,
  };
}

/** Call on page unload / VR exit to emit the rolled-up session metrics. */
export function flushSession(): void {
  if (!session) return;
  provider.track('scene_transition_completed', getSessionSummary());
}
