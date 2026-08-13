import { create } from 'zustand';
import type { XRSupport } from '@/lib/vr/webxr';
import type { DebugInfo } from '@/lib/vr/engine';

/**
 * Minimal global UI state (§2). The Three.js engine is the source of truth for
 * the scene; this store only holds what the React UI layer needs to render
 * (loading, panels, VR status, debug). Keep it small.
 */
interface VRState {
  // Scene.
  currentScene: string | null;
  previousScene: string | null;

  // Product panel.
  selectedProduct: string | null;
  isProductPanelOpen: boolean;

  // Chrome.
  isNavigationVisible: boolean;
  isVRMode: boolean;

  // Boot / loading.
  xrSupport: XRSupport | 'unknown';
  isReady: boolean;
  isLoading: boolean;
  loadingProgress: number;
  isTransitioning: boolean;

  // Debug.
  debugEnabled: boolean;
  debugInfo: DebugInfo | null;

  // Actions.
  setScene: (current: string, previous: string | null) => void;
  setProduct: (productId: string | null) => void;
  setNavigationVisible: (visible: boolean) => void;
  setVRMode: (on: boolean) => void;
  setXRSupport: (support: XRSupport) => void;
  setReady: (ready: boolean) => void;
  setLoading: (loading: boolean) => void;
  setLoadingProgress: (fraction: number) => void;
  setTransitioning: (transitioning: boolean) => void;
  setDebugEnabled: (on: boolean) => void;
  setDebugInfo: (info: DebugInfo) => void;
}

export const useVRStore = create<VRState>((set) => ({
  currentScene: null,
  previousScene: null,
  selectedProduct: null,
  isProductPanelOpen: false,
  isNavigationVisible: true,
  isVRMode: false,
  xrSupport: 'unknown',
  isReady: false,
  isLoading: true,
  loadingProgress: 0,
  isTransitioning: false,
  debugEnabled: false,
  debugInfo: null,

  setScene: (current, previous) => set({ currentScene: current, previousScene: previous }),
  setProduct: (productId) =>
    set({ selectedProduct: productId, isProductPanelOpen: productId !== null }),
  setNavigationVisible: (visible) => set({ isNavigationVisible: visible }),
  setVRMode: (on) => set({ isVRMode: on }),
  setXRSupport: (support) => set({ xrSupport: support }),
  setReady: (ready) => set({ isReady: ready }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadingProgress: (fraction) => set({ loadingProgress: fraction }),
  setTransitioning: (transitioning) => set({ isTransitioning: transitioning }),
  setDebugEnabled: (on) => set({ debugEnabled: on }),
  setDebugInfo: (info) => set({ debugInfo: info }),
}));

// Dev-only: expose the store for inspection from the console.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __vrStore?: typeof useVRStore }).__vrStore = useVRStore;
}
