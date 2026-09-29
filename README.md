# Concave Room: head-tracked 3D on two angled screens

Two identical portrait monitors meet at a concave corner. A webcam on top of
the seam tracks the viewer's eyes, and each screen gets its own **off-axis
projection** from that eye position. The two screens then act like one
window into a 3D room with a floating panda.

| Version | Status | Where |
|---|---|---|
| **v1.0** | Original demos: flat screen, 90° concave, portrait room (90° only). | Tag [`v1.0`](../../tree/v1.0) · details in [`docs/v1-README.md`](docs/v1-README.md) |
| **v2.0** | In progress: one app with calibration (adjustable angle, seam gap), a fully responsive room and a debug mini-view. | Spec: [`docs/UX.md`](docs/UX.md) |

## Run

```bash
bash run.sh          # serves this folder on http://localhost:8000
```

Open `http://localhost:8000/concave-room.html` in Chrome and stretch the
window across both monitors. It needs a webcam, localhost or HTTPS, and
internet access for the Three.js and MediaPipe CDNs.

Tests (Node 18+): `node concave-room.test.cjs` and `node concave.test.cjs`.

---

## ⚠️ Workflow rule: UX first, then code

**Always update [`docs/UX.md`](docs/UX.md) before writing code.**

1. Create a branch for the task (`camera-calib/<short-name>`).
2. **First commit:** change `docs/UX.md` so it describes the new behaviour,
   including UI, flow, fields and edge cases.
3. Open a pull request with only the UX change and get it reviewed.
4. **Then** write the code, matching the approved UX. If the code needs to
   differ, update the UX again first.
5. Tick the task below in this README in the same pull request.

Pull requests with code but no matching UX change will be sent back.

---

## Task list

### 🎥 Camera calibration (collaborator)

Goal: turn the **Camera auto-calibration** view from a placeholder into a
working feature. It uses a second USB webcam (the *calibration camera*) and
a printed board to measure the *tracking camera's* position and facing
angle, plus the screen pair's inside angle, gap and offset.

Read first: [`docs/UX.md` §0, §3, §4.3, §5.1](docs/UX.md). Camera
calibration is **optional**, and manual input must always keep working.

Method (from the UX spec): a flat printed **ChArUco board** is held about
1 m in front of the screens. The tracking camera sees the board. The
calibration camera sees the board and the marker patterns on both screens.
Chaining the two gives every pose relative to the screens. Nothing is
attached to the tracking camera.

- [ ] **C0 · UX detail:** expand `docs/UX.md` §4.3 into the full working
      flow: exact screens and states, capture guidance text, error messages
      and what "good capture" means. Get it reviewed **before any code**.
- [ ] **C1 · Camera selection:** list USB cameras, exclude the tracking
      camera, show a live preview and remember the choice.
- [ ] **C2 · Board:** generate a ChArUco board PDF (A4/A3, 100% scale)
      with the square size printed on it, and enable **Download board PDF**.
- [ ] **C3 · Screen markers:** the **Show screen markers** toggle shows
      marker patterns full-screen on both monitors, placed using the current
      screen geometry.
- [ ] **C4 · Detection and capture:** detect the board and markers with
      OpenCV.js in both camera feeds, accept only frames where both cameras
      see the board, and drive the "N / 8 good captures" progress bar.
- [ ] **C5 · Tracking camera intrinsics:** estimate the tracking camera's
      real field of view from the board captures.
- [ ] **C6 · Pose solver:** board → tracking camera and board → screens,
      chained into the profile fields (see contract below), with a
      confidence value for each field.
- [ ] **C7 · Results and Copy to Manual:** fill the results table and
      enable **Copy to Manual**. Never overwrite manual values without the
      user confirming.
- [ ] **C8 · Mini-view:** draw the solved tracking camera and screens in
      the debug mini-view, next to the manual values, so differences are
      visible.
- [ ] **C9 · Tests:** synthetic tests that render the board and markers
      from known camera poses. The solver must recover them within
      tolerance (target: angle ±1°, positions ±0.5 cm).
- [ ] **C10 · Docs:** update this README and the UX spec to match the
      final behaviour.

**Output contract.** The solver returns the same fields as the Manual page
(units: cm and degrees):

```js
{
  screen: { width, height, angle, gap, vOffset },
  trackingCamera: { top, forward, yaw, tilt, fov },
  confidence: { /* same keys, 0–1 */ }
}
```

**Depends on:** the v2 app shell (tasks V1–V3 below), which provides the
placeholder UI and the saved-profile format. Tasks C0–C2 can start now.

### 🧱 v2 core app

- [ ] **V1 · Geometry:** make the screen pair geometry take the inside
      angle, gap and vertical offset (UX §3), with tests for several angles.
- [ ] **V2 · Full room response:** remove the 75% room follow. Remove the
      separate display windows (Open left/right).
- [ ] **V3 · Layout:** left 20% column with the foldable setup panel above
      and the debug mini-view below. Home / Manual / Camera (placeholder)
      views and a sticky **Apply & start experience** footer.
- [ ] **V4 · Saved profile:** automatic save and load, editable fields,
      JSON export and import, and a last-calibrated timestamp.
- [ ] **V5 · Manual page:** angle helper (outer-edge distance → angle),
      live diagram and alignment test pattern.
- [ ] **V6 · Debug mini-view:** top and side views with eye, frusta,
      screens, tracking camera and parameter tags.

---

## Files

| File | Purpose |
|---|---|
| `concave-room.html/.js/.css` | Portrait concave room app (becomes the v2 app) |
| `concave-geometry.js` | Screen corners and off-axis projection |
| `concave-tracking.js`, `concave-room-tracking.js` | MediaPipe iris tracking → eye position |
| `models/panda.glb` | Panda model |
| `index.html`, `concave.html` | v1.0 demos (kept) |
| `docs/UX.md` | v2 UX specification: the source of truth |
