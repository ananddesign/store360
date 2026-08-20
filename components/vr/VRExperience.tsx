'use client';

import { useEffect, useRef, useState } from 'react';
import { useVRStore } from '@/lib/vrStore';
import { VRSceneEngine } from '@/lib/vr/engine';
import { detectXRSupport } from '@/lib/vr/webxr';
import { trackEvent, flushSession } from '@/lib/vr/analytics';
import { AmbientAudio } from '@/lib/vr/ambientAudio';
import { DEFAULT_SCENE_ID, getSceneById, sceneExists } from '@/data/scenes';
import { LoadingScreen } from './LoadingScreen';
import { VRControls } from './VRControls';
import { DebugOverlay } from './DebugOverlay';
import { PanoramaTester } from './PanoramaTester';
import { ViewControlsPanel } from './ViewControlsPanel';

/**
 * Top-level VR experience (client component).
 *
 * Responsibilities:
 *  - detect WebXR support (§8)
 *  - own the Three.js engine instance across React re-renders
 *  - route engine callbacks → Zustand store + analytics
 *  - render the 2D chrome (loading, controls, debug)
 *
 * Deep links: `?scene=<id>` opens directly into a scene (§25); `?debug=true`
 * enables the debug overlay + in-scene gizmos (§21).
 */
export function VRExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VRSceneEngine | null>(null);
  const audioRef = useRef<AmbientAudio | null>(null);
  const [testMode, setTestMode] = useState(false);

  const {
    isReady,
    isLoading,
    loadingProgress,
    xrSupport,
    isVRMode,
    isProductPanelOpen,
    currentScene,
    debugEnabled,
    debugInfo,
    isMuted,
  } = useVRStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const store = useVRStore.getState();
    let cancelled = false;

    // Read deep-link params.
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('scene');
    const initialScene =
      requested && sceneExists(requested) ? requested : DEFAULT_SCENE_ID;
    const debug = params.get('debug') === 'true';
    store.setDebugEnabled(debug);
    setTestMode(params.get('test') === 'true');

    trackEvent('session_started', { initialScene });

    const engine = new VRSceneEngine(container, {
      onReady: () => store.setReady(true),
      onLoadingProgress: (f) => store.setLoadingProgress(f),
      onSceneChange: (scene) => {
        const prev = store.currentScene;
        store.setScene(scene.id, prev);
        store.setLoading(false);
        // Keep the URL's ?scene= in sync for shareable deep links (skip ad-hoc
        // tester panoramas, which aren't part of the scene graph).
        if (!scene.id.startsWith('custom:')) syncSceneParam(scene.id);
      },
      onTransitionStart: () => store.setTransitioning(true),
      onTransitionComplete: () => store.setTransitioning(false),
      onProductOpen: (productId) => store.setProduct(productId),
      onProductClose: () => store.setProduct(null),
      onVRSessionChange: (active) => store.setVRMode(active),
      onDebugUpdate: (info) => store.setDebugInfo(info),
      onEvent: (event, payload) => trackEvent(event as never, payload as never),
    });
    engineRef.current = engine;
    engine.setDebug(debug);
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __vrEngine?: VRSceneEngine }).__vrEngine = engine;
    }

    // Detect XR support in parallel with the first scene load.
    void detectXRSupport().then((support) => {
      if (!cancelled) store.setXRSupport(support);
    });

    void engine.start(initialScene);

    // Ambient background music — starts muted-by-policy until a user gesture;
    // AmbientAudio retries automatically on the first click/keypress.
    const audio = new AmbientAudio('/vr/audio/ambient.mp3');
    audio.setMuted(store.isMuted);
    audio.start();
    audioRef.current = audio;
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __vrAudio?: AmbientAudio }).__vrAudio = audio;
    }

    const onUnload = () => flushSession();
    window.addEventListener('beforeunload', onUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onUnload);
      flushSession();
      engine.dispose();
      engineRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleEnterVR = () => {
    engineRef.current?.enterVR().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to enter VR:', err);
    });
  };

  const handleCloseProduct = () => {
    engineRef.current?.closeProductPanel();
  };

  const handleToggleMute = () => {
    const next = !useVRStore.getState().isMuted;
    audioRef.current?.setMuted(next);
    useVRStore.getState().setMuted(next);
  };

  const sceneName = currentScene
    ? currentScene.startsWith('custom:')
      ? currentScene.slice('custom:'.length)
      : getSceneById(currentScene)?.name ?? null
    : null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-qween-void">
      {/* Three.js mounts its canvas here. */}
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'grab' }} />

      <LoadingScreen visible={!isReady || isLoading} progress={loadingProgress} />

      <VRControls
        xrSupport={xrSupport}
        isVRMode={isVRMode}
        sceneName={sceneName}
        isProductPanelOpen={isProductPanelOpen}
        isMuted={isMuted}
        onEnterVR={handleEnterVR}
        onCloseProduct={handleCloseProduct}
        onToggleMute={handleToggleMute}
      />

      {testMode && !isVRMode && (
        <PanoramaTester
          activeSceneId={currentScene}
          onLoad={(url, name) => engineRef.current?.showPanoramaFromURL(url, name)}
        />
      )}

      {debugEnabled && <DebugOverlay info={debugInfo} />}

      {debugEnabled && !isVRMode && (
        <ViewControlsPanel engine={engineRef.current} currentSceneId={currentScene} />
      )}
    </div>
  );
}

/** Reflect the active scene in the URL without adding history entries. */
function syncSceneParam(sceneId: string) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('scene', sceneId);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* ignore */
  }
}
