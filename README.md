# QWEEN VR Store — V1

A premium WebXR 360° virtual jewellery showroom for **Meta Quest**, with a
first-class desktop fallback. V1 uses high-resolution equirectangular panoramas
as environments with lightweight interactive navigation and product hotspots
layered on top — a spatial QWEEN experience, not a generic 360° tour.

> **Status:** V1 minimal prototype is complete and verified on desktop
> (Scene A → product panel, Scene A → Scene B navigation). Ships with procedural
> placeholder panoramas so it runs with **zero binary assets** — drop in real
> photography when ready (see below).

---

## 1. Architecture overview

```
┌────────────────────────────────────────────────────────────┐
│  React / Next.js (App Router)   ← 2D chrome only            │
│  • Landing (/)  • /vr route                                 │
│  • Zustand store (loading, panels, VR status, debug)        │
│  • LoadingScreen · VRControls · DebugOverlay                │
└───────────────┬────────────────────────────────────────────┘
                │ mounts + commands + callbacks
┌───────────────▼────────────────────────────────────────────┐
│  VRSceneEngine  (lib/vr/engine.ts) — imperative Three.js    │
│  • WebGLRenderer + WebXR (immersive-vr)                     │
│  • Desktop drag-look  ·  Quest controller rays              │
│  • Raycast interaction (hotspots + panel buttons)           │
│                                                             │
│  composes:                                                  │
│   ├ TextureManager   load / preload / dispose panoramas     │
│   ├ SceneManager     inverted-sphere panorama + fades       │
│   ├ HotspotManager   3D markers, labels, hover, hit-test    │
│   └ ProductPanel3D   spatial product card (in-scene)        │
└───────────────┬────────────────────────────────────────────┘
                │ reads
┌───────────────▼────────────────────────────────────────────┐
│  Content (pure data)                                        │
│   • data/scenes.ts   • data/products.ts   • types/vr.ts     │
└────────────────────────────────────────────────────────────┘
```

**Why raw Three.js (not React-Three-Fiber)?** The spec permits it explicitly,
and for a panorama + WebXR-controller experience an imperative engine is more
stable across React re-renders and avoids `@react-three/xr` version coupling.
React owns the 2D UI; Three.js owns the immersive scene. The two touch only
through a small callback/command surface, so either side can change freely.

**Key design properties (map to the spec's acceptance criteria):**

- Scene data is fully separated from rendering (`data/scenes.ts`).
- Product data is fully separated from rendering (`data/products.ts`).
- Panoramas can be replaced without touching rendering code (change one string).
- New scenes/hotspots/products are pure data additions.
- Analytics is a pluggable abstraction (`lib/vr/analytics.ts`) — swap the
  provider without touching any component.
- The environment is modelled as `Environment = PanoramaEnvironment | ThreeDEnvironment`
  so a future 3D environment slots in without rewriting the scene engine.

## 2. File structure

```
app/
  layout.tsx            Root layout, metadata, fonts
  page.tsx              Landing → "Enter QWEEN Store"
  globals.css           Tailwind + base styles + font vars
  vr/page.tsx           The /vr immersive route

components/vr/
  VRExperience.tsx      Client orchestrator: mounts engine, wires store/analytics
  VRControls.tsx        Enter-VR / desktop hints / zone label / close
  LoadingScreen.tsx     QWEEN-branded loader
  DebugOverlay.tsx      /vr?debug=true HUD

lib/
  vrStore.ts            Zustand global UI state
  vr/
    engine.ts           VRSceneEngine — the imperative core
    sceneManager.ts     Panorama sphere + fade transitions
    hotspotManager.ts   Hotspot markers, labels, hover, raycast
    productPanel.ts     Spatial 3D product panel
    textureManager.ts   Panorama load/preload/dispose (§17)
    placeholder.ts      Procedural placeholder panoramas/products/markers
    webxr.ts            WebXR capability detection
    analytics.ts        Vendor-agnostic trackEvent (§24)
    config.ts           Tuning constants (height, radius, timings…)

data/
  scenes.ts             Scene graph (currently: a single Main Store scene)
  products.ts           Placeholder catalogue

types/
  vr.ts                 Scene/hotspot/product/analytics types

public/vr/panoramas|products|icons/   Drop real assets here

docs/HOTSPOTS.md        How to author hotspot coordinates
```

## 3. Setup instructions

Requirements: **Node 18.18+** (Node 20/22/24 fine), npm.

```bash
npm install
```

Optional environment (see `.env.example`):

```
NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_API_URL=
```

## 4. How to run locally

```bash
npm run dev
```

Open <http://localhost:3000> → **Enter QWEEN Store**, or go straight to
<http://localhost:3000/vr>.

Useful URLs:

- `/vr?scene=<id>` — deep-link directly into a scene (§25), e.g. `?scene=main-store`
- `/vr?debug=true` — developer HUD + in-scene hotspot gizmos (§21)

Desktop controls: **drag** to look, **click** a hotspot, **arrow keys** to look,
**H** to go home, **Esc** to close the product panel.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run lint        # next lint
```

## 5. How to test on Meta Quest

WebXR requires a **secure context (HTTPS)**. Localhost is exempt but the Quest
loads over your LAN, so you need HTTPS or a tunnel. Pick one:

**Option A — Next's built-in HTTPS (same Wi-Fi):**

```bash
npm run dev:https
```

Find your machine's LAN IP (e.g. `192.168.1.42`) and, in the **Meta Quest
Browser**, open `https://192.168.1.42:3000/vr`. Accept the self-signed
certificate warning.

**Option B — a tunnel (works anywhere):**

```bash
npx localtunnel --port 3000     # or: cloudflared tunnel --url http://localhost:3000
```

Open the returned `https://…` URL + `/vr` in the Quest Browser.

**Option C — adb reverse (headset via USB):**

```bash
adb reverse tcp:3000 tcp:3000
```

Then open `http://localhost:3000/vr` in the Quest Browser.

In-headset: press **Enter VR**, look around naturally, point a controller (a
subtle gold ray appears), and pull the **trigger** to select navigation or
product hotspots. **Squeeze the grip ("pinch") on either controller to jump
back to the home scene** at any time. There is no forced locomotion —
you travel only by selecting hotspots or the home gesture (§23).

## 6. How to add a new 360 scene

1. Drop a **2:1 equirectangular JPEG** into `public/vr/panoramas/` (e.g.
   `vault.jpg`). Recommended source sizes: 4096×2048 / 6144×3072 / 8192×4096 —
   pick per Quest performance. *(Skip this to use a placeholder for now.)*
2. Add an entry to `data/scenes.ts`:

```ts
{
  id: 'vault',
  name: 'The Vault',
  environment: { type: 'panorama', source: '/vr/panoramas/vault.jpg' },
  // or, before real photography: source: 'placeholder://vault'
  initialCamera: { yaw: 0, pitch: 0 },
  preload: ['main-store'],
  hotspots: [ /* see below */ ],
}
```

3. Point a navigation hotspot in another scene at `targetSceneId: 'vault'`.

No rendering code changes. Placeholder themes live in `lib/vr/placeholder.ts`
(add a colour theme keyed by the id if you use `placeholder://vault`).

## 7. How to add a new hotspot

Add to a scene's `hotspots` array. **Navigation:**

```ts
{
  id: 'vault-to-main-store',
  type: 'navigation',
  label: 'Main Store',
  targetSceneId: 'main-store',
  position: { x: 0, y: -0.1, z: -4 },
}
```

**Product:**

```ts
{
  id: 'vault-riviere',
  type: 'product',
  productId: 'qween-riviere-002',
  position: { x: 1.8, y: 0.4, z: -3.2 },
}
```

Coordinates are relative to the user's eye — the **direction** decides where on
the panorama the marker appears, the **length** is placement distance (3–5 m
works well). Full method (including using `?debug=true` to read them off) is in
[`docs/HOTSPOTS.md`](docs/HOTSPOTS.md).

## 8. How to add a product

Add to `data/products.ts`:

```ts
{
  id: 'qween-tennis-005',
  name: 'Tennis Bracelet',
  price: 760000,
  currency: 'INR',
  image: '/vr/products/tennis.jpg',   // or 'placeholder://bracelet'
  spec: '5.00 CT · VVS · F',
  description: 'A continuous line of brilliants.',
  category: 'Bracelets',
  pdpUrl: 'https://qween.com/products/tennis-bracelet',
}
```

Reference it from a product hotspot via `productId: 'qween-tennis-005'`. When the
real QWEEN product API exists, map its response into the `VRProduct` shape (or
replace `getProductById`) — nothing downstream changes.

## 9. How to deploy to Vercel

1. Push to a Git repo and **Import Project** in Vercel (Framework: Next.js —
   auto-detected). No special config required; served over HTTPS automatically,
   which satisfies WebXR.
2. Set env vars in Vercel if used (`NEXT_PUBLIC_ANALYTICS_ID`, `NEXT_PUBLIC_API_URL`).
3. Deploy. Open `https://<your-app>.vercel.app/vr` in the Quest Browser.

The build is a standard `next build` (verified). `outputFileTracingRoot` is
pinned in `next.config.mjs` for correct tracing.

## 10. Known limitations of V1

- **Placeholder assets:** panoramas/products are procedurally generated on
  canvas until real photography is supplied. They exist to prove the flow.
- **No real Quest performance pass yet:** targets (72 FPS, texture memory) are
  designed for (no post-processing, no mipmaps on panoramas, single resident
  panorama + preloads) but must be measured on-device (§8 / Phase 8).
- **"View Jewellery"** opens the PDP via `window.open` in a new tab. From within
  an immersive session the Quest Browser surfaces this as a 2D window; deep
  in-VR PDP behaviour is intentionally out of scope for V1.
- **Product panel is world-anchored** (placed in front of you on open, does not
  follow your head) — chosen for comfort; it does not reflow if you walk away.
- **Not implemented by design (kept extensible):** full 3D store, physics,
  multiplayer, hand tracking, try-on, spatial audio, in-VR checkout, CMS,
  accounts, backend. The `Environment` union and pluggable analytics/data are
  the seams for these later.
- **WebXR only:** requires a WebXR-capable browser (Quest Browser) and HTTPS.
  Non-XR browsers get the desktop 360 fallback automatically.

---

## Development phases (spec §28) — status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Next.js + `/vr` + Three.js panorama + desktop drag | ✅ |
| 2 | WebXR detection + Enter VR + Quest controllers | ✅ (needs on-device test) |
| 3 | Scene data model + multi-panorama + preload + transition | ✅ |
| 4 | Navigation hotspots + ray interaction + hover + select | ✅ |
| 5 | Product hotspots + data + panel + PDP link | ✅ |
| 6 | QWEEN polish: typography, loading, transitions, spatial UI | ✅ |
| 7 | Analytics abstraction + scene/product/session tracking | ✅ |
| 8 | On-device performance pass (FPS, memory, latency) | ⏳ needs Quest |
