# Authoring hotspot coordinates

Hotspots are positioned in **3D space relative to the user's eye** (the camera
origin). You do not need a 3D tool — the coordinate system is simple and there is
a debug workflow to read positions directly off the running experience.

## The coordinate system

- Right-handed, metres. **+X** is right, **+Y** is up, **−Z** is forward (the
  direction the user faces when a scene loads).
- The camera sits at the origin `(0, 0, 0)`. A hotspot at `(x, y, z)` is placed
  at that offset from the eye.
- Two things matter:
  - **Direction** of the vector `(x, y, z)` → *where on the panorama* the marker
    appears (which way the user must look to see it).
  - **Length** of the vector → *how far away* the marker floats. **3–5 m** reads
    well; closer feels cramped, much farther makes markers tiny.

### Quick intuition

| Want the marker… | Set roughly |
|------------------|-------------|
| Straight ahead, eye level | `{ x: 0, y: 0, z: -4 }` |
| Ahead but on the floor (a "walk here" pad) | `{ x: 0, y: -0.3, z: -4 }` |
| To the right | `{ x: 3.5, y: 0, z: -2 }` |
| To the left | `{ x: -3.5, y: 0, z: -2 }` |
| Behind the user (turn around) | `{ x: 0, y: -0.2, z: 4 }` |
| Up on a wall/display | `{ x: 1.5, y: 0.6, z: -3 }` |

Angles, if you prefer to think that way, for a point at yaw θ (0 = forward,
+90° = right) and distance d at height y:

```
x =  d · sin(θ)
z = -d · cos(θ)
```

## Reading coordinates off the running scene (recommended)

1. Run `npm run dev` and open `/vr?debug=true`.
2. The debug HUD (top-left) shows `cam.rot°` (your current yaw/pitch) and lists
   the scene's hotspot ids. In-scene, each hotspot also renders a small
   wireframe **octahedron gizmo** at its exact position.
3. Drag to look directly at where you want a new marker. Note the yaw from
   `cam.rot°` (the middle value is yaw in degrees).
4. Plug that yaw + a distance (say 4 m) into the formula above, choose a `y`
   for height, and add the hotspot to `data/scenes.ts`.
5. Reload — the gizmo/marker appears where you're looking. Nudge `x/y/z` until
   it sits right.

## Tips

- Keep navigation markers near eye level or slightly below (`y` between `-0.3`
  and `0.1`) so they read as "go here".
- Keep product markers near the jewellery they represent in the panorama —
  usually a bit above eye level on a display (`y` around `0.3`–`0.6`).
- Don't cluster markers within ~15° of each other or the rays become fiddly.
- Distances between ~2.5 m and ~5 m keep marker size consistent (markers are
  billboarded sprites; the engine scales them by their configured size, not by
  distance, so very different distances change apparent size).

## Later: a visual authoring tool

V1 intentionally does **not** ship a hotspot editor. The data model and debug
gizmos are designed so a small click-to-place authoring tool can be added later
without changing the scene format.
