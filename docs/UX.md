# Concave Room — UX specification (v2 draft)

Versioning: the existing demos (`index.html`, `concave.html`,
`concave-room.html` with the 90°-only geometry) are tagged **v1.0** in git.
This document describes **v2.0**.

Status: design document only. Nothing here is implemented yet. It describes how
the current `concave-room.html` demo becomes a single app that does both
screen calibration and the head-tracked, off-axis 3D experience.

---

## 0. Answers to open questions

**Is the current program an off-axis projection?**
Yes. `concave-geometry.js → project()` implements the generalized (Kooima)
off-axis projection: each physical screen is described by three corners, a
camera is placed at the tracked eye, and an asymmetric frustum is built from
the eye through that exact rectangle. Both screens share one eye position.
Current limitations, all addressed below:

| Limitation today | Decision |
|---|---|
| Screen corners are hard-coded for a 90° inside angle (√½ factors). | Inside angle becomes a calibration input (§3). |
| No bezel/gap: the two visible areas touch at the seam. | Physical gap at the seam is modelled (§3). |
| Room follows only 25% of eye x/y movement (75% "follow"). Only the panda is physically correct. | Removed. Whole scene uses the full, physically correct response. |
| "Seam overlap" slider shifts images away from the exact projection. | Not a gap simulation. Moved to *Advanced* and defaults to 0. The gap is handled physically instead (§3). |
| Separate display windows (Open left / Open right, BroadcastChannel). | Removed. One app, one window that spans both screens. |

**Webcam mount:** top of the seam (centred on the shared edge, above the
top of the screens, facing the viewer). This is the default and the only
position the UI needs to describe in detail.

**Two cameras, two jobs:**

| Camera | Where | Job |
|---|---|---|
| **Tracking camera** | Fixed on top of the seam, facing the viewer | Eye tracking, live, during the experience. |
| **Calibration camera** (optional) | A second USB webcam on a tripod or shelf in front of the screens, a little above the screen top, about 1 m from the seam, used only during calibration | Measures where the tracking camera is and which way it faces (plus the screen pair's angle, gap and offset). |

**Screens:** always the same model and size. They are described *together*
as a pair by their relative position, not as two independently placed
screens.

---

## 1. Principles

1. **One app, one window.** A single page, stretched across both monitors.
   No second terminal, window, or page.
2. **Calibrate every session.** Screens get nudged. The app always offers
   calibration on launch but remembers the last values so it takes seconds.
3. **Physically correct first.** Everything in the 3D scene (room, frame,
   panda, shadows) uses the same off-axis projection from the same eye.
4. **Make errors visible.** A debug mini-view shows where the app *thinks*
   the screens, webcam, and eye are, with the numbers you typed.

---

## 2. App structure

```
one browser window spanning both screens (edge to edge)
┌──────────────── LEFT SCREEN ────────────────╥──────────────── RIGHT SCREEN ───────────────┐
│ ┌── 20% ───┐                                 ║                                             │
│ │ SETUP    │                                 ║                                             │
│ │ (fold ▲) │                                 ║                                             │
│ │ Home     │                                 ║                                             │
│ │ ├ Manual │                                 ║                                             │
│ │ └ Camera │     3D experience               ║      3D experience                          │
│ │[Apply ▶] │                                 ║                                             │
│ ├──────────┤                                 ║                                             │
│ │ DEBUG    │                                 ║                                             │
│ │ MINI-VIEW│                                 ║                                             │
│ │ top/side │                                 ║                                             │
│ │ + tags   │                                 ║                                             │
│ └──────────┘                                 ║                                             │
└──────────────────────────────────────────────╨─────────────────────────────────────────────┘
```

- **Side column:** the leftmost **20% of the left screen** is a column split
  into two horizontal sections:
  - **Upper:** the foldable **setup panel** (§4).
  - **Lower:** the **debug mini-view** (§5.1).
- **Folding:** when the setup panel is folded, it shrinks to a one-line
  header ("Setup ▼") and the mini-view grows to fill the column. When it's
  unfolded, the two sections split the column height about 50/50.
- **H** hides the whole column for a clean experience. **H** again brings it
  back.
- The column is an overlay. The 3D projection still covers the *entire*
  left screen, so hiding the column never changes the image geometry.
- The experience is always live, so every setup change is visible on the
  real screens straight away.
- The setup panel has three views: **Home**, **Manual measurement** and
  **Camera auto-calibration**.
- Every view has the same sticky footer button: **Apply & start experience**.

### Launch flow

```
Open app
  │
  ├─ saved profile exists? ── no ──▶ Setup Home (drawer open)
  │
  yes
  ▼
Setup Home shows: "Last calibrated 2026-09-29 14:10 · 97° · gap 1.8 cm"
  │   [Manual measurement]   [Camera auto-calibration]
  │   [Apply & start experience]   ← reuse saved values as they are
  ▼
Experience (drawer folded, fullscreen, tracking on)
```

---

## 3. Screen pair geometry (what the user enters)

The pair is described relative to the **seam**, the shared vertical edge
where the two screens meet.

| Parameter | Unit | Default | How to measure |
|---|---|---|---|
| Visible width (each screen) | cm | 33.6 | Lit display area only, no bezel |
| Visible height (each screen) | cm | 59.8 | Lit display area only |
| **Inside angle** θ | ° | 90 | Angle between the two *display surfaces*, measured on the viewer side (not the monitor backs). 180° = flat. |
| Gap at seam | cm | 1.5 | Straight-line distance from the inner edge of the left lit area to the inner edge of the right lit area (a ruler laid across the corner). Covers both bezels and any air gap. |
| Vertical offset | cm | 0 | How much higher the right lit area sits than the left (+ = right higher). |
| Seam position in window | % | 50 | Where the spanning window is split. 50% for two equal monitors. |

**Angle helper.** A protractor is awkward on a concave corner, so the
Manual page also accepts a tape measurement:
*"Distance between the two outer lit edges, straight across (cm)"*.
The app turns this into the angle and shows both values. The user can type
either one and the other updates. With outer-edge distance D, gap g and
width w: `sin(θ/2) = (D − g) / (2w)`.

**How the app places the screens.** The seam is the vertical z-axis. The
viewer is on +z. Each panel leans back by half the inside angle from the
bisector, so the left panel runs along `(−sin θ/2, 0, cos θ/2)` and the
right along `(+sin θ/2, 0, cos θ/2)`. The corner (origin) is where the
two display planes meet. Each lit area starts `g / (2·sin θ/2)` from the
corner along its panel, so the straight gap between the inner edges is `g`.
The vertical offset moves the right panel up by `+v/2` and the left down by
`v/2`. The off-axis projection math is unchanged; only the
corner positions change.

**Gap handling.** The 3D world is continuous across the corner. The gap
region simply has no pixels, like looking through two window panes with a
mullion between them. Straight lines therefore stay straight across the
seam from the calibrated eye. The seam overlap slider is no longer needed
for this.

### Webcam (top of seam)

| Parameter | Unit | Default |
|---|---|---|
| Height above top of screens | cm | 3 |
| Forward from seam (toward viewer) | cm | 0 |
| Tilt down | ° | 25 |
| Horizontal field of view | ° | 60 |
| Yaw | ° | 0 (along the bisector; shown under *Advanced*) |

### Saved profile

- Saved automatically in the browser on **Apply**, and loaded on the next
  launch. Every field stays editable.
- **Export / Import profile (.json)** buttons allow a backup or moving the
  setup to another computer.
- A timestamp records when the profile was last calibrated.
- The profile also stores the chosen foreground model and eye detector (§4.2).

---

## 4. Setup drawer views

### 4.1 Home

- Status card: last calibration time, angle, gap, screen size, webcam state.
- Two large buttons:
  - **Manual measurement**: "Measure with a tape and type the numbers."
  - **Camera auto-calibration** (optional, shows a *Preview* badge): "Use a
    second camera to measure the screens automatically."
- **Manual measurement is the primary path**, and it alone is enough to run
  the full experience.
- Footer: **Apply & start experience**.

### 4.2 Manual measurement

Sections, top to bottom:

1. **Screens:** width, height, inside angle *or* outer-edge distance, gap,
   vertical offset.
2. **Tracking camera:** a camera dropdown (needed because a second USB
   camera may be connected), an **Eye detector** dropdown, then height,
   forward, tilt and FOV. Yaw and left/right offset are under *Advanced*.
   Eye detector options (all give the 478-point face + iris landmarks the
   tracker reads; the iris size gives the distance):
   - **Face Mesh + zoom search** (default): MediaPipe Face Mesh on a crop
     around the face once found (more iris pixels); while no face is found
     it cycles the full frame and zoomed centre/left/right crops so a
     distant face is found too.
   - **Face Mesh only**: MediaPipe Face Mesh on the whole frame (the v2.0
     behaviour, short range, about 2 m). Fastest.
   - **Face Landmarker (experimental)**: the newer MediaPipe Tasks
     Face Landmarker on the same crop. Needs internet to load its model; if
     it fails to load the status line says so and the previous detector is
     used.
   Changing the detector restarts tracking and discards the eye calibration
   (iris sizes differ slightly per detector), so recalibrate afterwards. The
   choice is saved in the profile (`detector`: `two-stage`, `fullframe`,
   `landmarker`). The Home status card shows the active detector.
3. **Foreground model:** a dropdown for the object floating in front of
   the seam. Options: **Panda** (default, `models/panda.glb`), **Cube**
   (edged cube, good for judging perspective), **Sphere** (checker pattern)
   and **Load file…** (a local `.glb`/`.gltf`, used for this session only;
   too big to store, so the next launch falls back to Panda). Every model
   is scaled to the same height and centred. The choice takes effect
   immediately and is saved in the profile on **Apply** (`model`: `panda`,
   `cube` or `sphere`). If a model fails to load, the status line says so and
   the previous model stays.
4. **Live diagram:** the debug mini-view directly below the setup panel
   (§5.1) *is* the live diagram. It redraws the screen pair to scale at the
   entered angle and gap, with the webcam and its view cone, on every
   keystroke. No second copy is shown.
5. **Alignment test pattern** (toggle): replaces the scene with a grid
   floor, a gridded back wall, a vertical pole on the seam line (x = 0)
   behind the screens, and horizontal lines running across both screens. When the numbers are right, the lines look
   straight and continuous from the calibrated eye position.
6. **Eye-distance calibration:** the live webcam preview, a slider for the
   measured eye → webcam distance, and a **Calibrate tracking** button.
   This step is the same on both setup paths.
7. **Advanced** (collapsed): seam overlap (default 0, labelled *non-physical
   correction*), webcam yaw, webcam left/right offset, and tracking
   smoothing time (default 180 ms).
8. **Profile:** Export JSON / Import JSON buttons, and a link to the v1.0
   demos.

Footer: **Apply & start experience**.

### 4.3 Camera auto-calibration (optional)

Camera calibration is **optional**. Manual measurement (§4.2) is always
enough. This view never changes the profile until the user confirms **Copy
to Manual**.

**What it measures.** A second USB webcam (the *calibration camera*) and a
rigid ChArUco board measure:

- the tracking camera's pose: height above the screens, forward, left/right,
  yaw and tilt, plus its real horizontal field of view;
- the screen pair's inside angle, gap and vertical offset.

Screen width and height are **not** measured. The screen markers are sized
from them, so enter them on the Manual page first.

**How it works.** The board lies face up in front of the screens, and both
cameras see it at the same moment:

- tracking camera + board → the tracking camera's pose relative to the board;
- calibration camera + board + screen markers → the screen pair's pose
  relative to the board.

Chaining the two gives the tracking camera relative to the screens. Every
capture is a complete estimate on its own. The result is the median of 8
captures, and their spread gives the confidence.

*Why face up:* the tracking camera sits on the screens and looks toward the
viewer, while the calibration camera sits on the viewer side and looks toward
the screens. If the board is held upright facing the screens, the
calibration camera sees its back. Lying flat (or tilted up toward the
ceiling), its face is seen from above by both cameras.

```
side view
              ▼ tracking camera (top of seam, looks at the viewer)
             ┌┐                          ◣ calibration camera
   screens   ││                            (tripod/shelf, a little above the
             ││                             screen top, about 1 m from the
             ││      ▭ board, face up       seam, looks down)
             ││    ┌───┐ on a box
             └┘────┴───┴──── desk ──────────
              ◀ 40–50 cm ▶
```

*Range:* a camera can read a marker only with about 3 px per marker cell.
A 6×6 marker is 8 cells wide including its black border, so the lab
board's 13 mm markers can be read by a 1080p camera with a 60–70° field of
view up to about 60–75 cm away, and less when the board is seen at an
angle. Keep the board within about 60 cm of **both** cameras. The live
checklist (step 4) reports the cell size. If that isn't possible, print a
bigger board with larger markers from step 2.

**Layout.** The view is a list of numbered steps. Each step header shows its
state: **○** to do, **✓** done, **⚠** needs attention. All steps can be
opened at any time, but **Capture** (step 5) stays disabled until steps 1–3
are ✓.

At the top, a short note replaces the v2.0 banner: "Optional. Manual
measurement is always enough." with a **Go to Manual measurement** link.

#### Step 1 · Cameras

- **Tracking camera:** a read-only line with the camera chosen on the Manual
  page and its stream resolution, e.g. "Astra Pro FHD Camera · 1920 × 1080".
- **Calibration camera** dropdown: lists USB cameras except the tracking
  camera, plus a **Refresh** button. The choice is saved in the profile
  (`calibration.deviceId`) and preselected next time if that camera is
  connected.
- Two live previews side by side (tracking left, calibration right). Once
  OpenCV has loaded, found board corners are drawn in green and screen
  markers in blue, with a one-line status under each preview.
- The tracking preview reuses the eye-tracking stream, because a camera is
  opened only once. Eye tracking pauses while step 3 or step 5 is capturing
  ("Capturing… eye tracking paused") and resumes afterwards.

#### Step 2 · Board

- Fields: **Columns × rows** (squares), **Square size (mm)**, **Marker size
  (mm)**, **Dictionary** (Auto-detect, 4×4, 5×5, 6×6, 7×7, ArUco original).
  Defaults match the lab board: 9 × 7 squares, 23.5 mm squares, 13 mm
  markers, 6×6 (`DICT_6X6_250`; the 6×6 families share their first IDs, so
  any 6×6 size works).
- **Size check** line under the fields: "Pattern 211.5 × 164.5 mm (9 × 23.5 mm
  by 7 × 23.5 mm). Measure across all 9 squares with a ruler. If it differs by
  more than 1 mm, correct the square size." (A 1% error in the square size
  becomes a 1% error in every distance.)
- **Auto-detect** tries each dictionary on the live frames, keeps the one
  that finds board markers, and shows it ("Detected: 5×5"). The detected
  dictionary is saved.
- **Download board PDF** (for users without a board): a paper size dropdown
  (A4 / A3) and the button. The PDF is drawn from these settings at 100%
  scale, with the settings printed in the margin. Hint: "Print at Actual
  size (100%), measure it, and glue it to card or foam board so it stays
  flat."
- Board settings are saved in the profile (`calibration.board`). Changing a
  board field clears unsaved captures (steps 3 and 5) but keeps finished lens
  results.

#### Step 3 · Lens calibration

One row per camera:

- "Tracking camera ✓ FOV 63.4° · error 0.32 px · 2026-10-01 **[Redo]**"
- "Calibration camera ○ not calibrated **[Start]**"

**Start** opens a guided capture for that camera. Its preview is shown
large over the 3D view on the left screen, so it is readable from the
board-holding position. It shows:

- a 3 × 3 coverage grid over the preview (a cell turns green once board
  corners have been seen there);
- a counter "4 / 10 good views", plus **Capture now**, **Done** (enabled at
  10) and **Cancel**;
- one guidance line, chosen in this order:
  1. "Hold the board 30–60 cm from the camera, filling about a third of the
     picture." (no board, or board too small)
  2. "Hold still…" (board seen but moving)
  3. "Already have this view. Move or tilt the board." (not new)
  4. "Move the board to the top-left of the picture." (names the first
     empty grid cell)
  5. "Tilt the board about 30° left / right / up / down." (until 3 tilted
     views exist)

A **good lens view** has:

- at least 24 of the 48 inner corners (half the board);
- the board still: corners move less than 1 px on average over 0.5 s;
- a new view: it differs from every earlier view by at least 10° of tilt or
  15% of the picture width in position.

Good views are captured automatically. **Capture now** captures the current
frame if it has at least 24 corners, even when it isn't steady or new.

After 10 views the lens is solved. The row shows the horizontal FOV and the
error (RMS reprojection, px):

- error ≤ 0.8 px: ✓.
- error > 0.8 px: ⚠ "Lens result is poor (1.4 px). Redo: keep the board
  flat and still, and fill more of the picture."

Lens results are saved per camera and resolution
(`calibration.lenses["<label> @ 1920x1080"]`), so this step is done once per
camera. If the stream resolution changes, the row reads "○ not calibrated
for 1280 × 720". The tracking camera's solved FOV becomes the **FOV** row
in Results. Lens distortion is stored but not yet used by tracking.

#### Step 4 · Placement and screen markers

- **Show screen markers** toggle: covers both screens (except the setup
  column) with a white background and a grid of ArUco markers, 3 × 5 per
  screen and each about 6 cm, placed from the current width, height and seam
  position. The markers use a different dictionary from the board (4×4, or 5×5 if
  the board is 4×4), so the two are never confused. **Esc**,
  turning the toggle off, or leaving the Camera view hides them. **H**
  (hide column) redraws the markers over the full screens.
- If the window doesn't span both screens: ⚠ "The window doesn't cover both
  screens. Press **Span both screens** (F) first." The toggle stays off.
- Placement text, with the side-view sketch above: "Lay the board face up on
  a box, 40–50 cm in front of the seam. Put the calibration camera on a
  tripod or shelf about 1 m from the seam, a little higher than the top of
  the screens, looking down so it sees both screens and the board. Keep the
  board within about 60 cm of both cameras. Don't hold the board upright
  facing the screens: the calibration camera would see its back."
- Live checklist, updated about 5 times a second:

| Check | ✓ | ✗ / ⚠ hint |
|---|---|---|
| Tracking camera sees board | "31 corners · 4 px/cell" | "Not found: move the board into the tracking preview, or raise it on a box." / ⚠ "Markers too small to read (2 px per cell): move the board closer to the screens." |
| Calibration camera sees board | "40 corners · 4 px/cell" | "Not found." / ⚠ "Markers too small to read (2 px per cell): move the camera closer to the board." |
| Left screen markers | "15 / 15" | "Turn screen brightness up and avoid reflections." (fewer than 6) |
| Right screen markers | "15 / 15" | same |
| Still | "Still" | "Hold still…" |

"Too small" means fewer than 3 px per marker cell (marker width in pixels ÷
(dictionary bits + 2)).

#### Step 5 · Capture

- Enabled when steps 1–3 are ✓ and the screen markers are showing.
  Otherwise the hint names the missing step, e.g. "Calibrate both lenses
  first (step 3)."
- **Capture** button, **Auto** checkbox (default on: capture whenever every
  check is ✓ and the view is new), progress bar "N / 8 good captures", and
  **Clear**.
- Guidance between captures: "Slide or turn the board (10 cm or 15°). Lift
  one edge for a few captures."
- A **good pose capture** has:
  - every step-4 check ✓, from frames taken from both cameras at the same moment;
  - at least 12 board corners in each camera, and at least 6 markers on
    each screen;
  - a reprojection error of 1.0 px or less in each camera;
  - a board moved at least 5 cm or turned at least 10° compared with every
    earlier capture.
- A rejected capture shows its reason in one line, e.g. "Not used: the
  board is almost edge-on to the tracking camera (75°)." (board more than
  70° from facing a camera).
- After each capture the Results table updates with the running median.
- A capture that disagrees with the rest (more than 3× the median absolute
  deviation on any field, once there are at least 5) is dropped and the
  counter goes back: "Capture 5 dropped: it doesn't agree with the others.
  Take one more."
- The calibration camera may move between captures, because each capture
  stands alone, but it must be still during one. A tripod or shelf is
  recommended.

#### Step 6 · Results

| Field | Manual | Camera | Δ | Conf. |
|---|---|---|---|---|
| Inside angle | 90.0° | 96.8° | +6.8° | High |
| … | | | | |

- Rows: inside angle, gap, vertical offset, camera height above top,
  forward, left/right, yaw, tilt, FOV. Screen width and height are listed
  as "from Manual (not measured)".
- **Camera** is the median of the captures, or "—" before the first one.
- **Conf.** comes from the spread of the captures: `1 − σ / (2 × tolerance)`,
  clamped to 0–1. The tolerance is 1° for angles and 0.5 cm for distances.
  FOV confidence comes from the lens error instead (0.3 px → 1, 1.0 px →
  0). It is shown as **High** (≥ 0.8), **Medium** (0.5–0.8) or **Low**
  (< 0.5, amber).
- A value outside the profile range is red and cannot be copied, e.g.
  "Angle 205°: outside 30–180°. Check the board square size."
- **Copy to Manual** is enabled after 8 good captures. It opens a confirm
  panel that lists the changed fields with tick boxes (ticked for High and
  Medium, unticked for Low): "Copy 7 values to Manual? The old values are
  replaced. You can still edit them on the Manual page." **[Copy]**
  **[Cancel]**.
- On **Copy**, the values go through `RoomProfile.sanitize()` and are saved,
  and the experience updates live. Status: "Copied 7 values. Check the
  alignment pattern, then Apply." `calibratedAt` is still stamped on
  **Apply**, as before.
- While the Camera view is open, the debug mini-view (§5.1) draws the
  camera result dashed next to the manual values.

#### Step 7 · Eye-distance calibration

The same as on the Manual page.

Footer: **Apply & start experience**. It uses the current Manual values,
including any copied ones.

#### States and errors

| Situation | What the user sees |
|---|---|
| OpenCV loading (first open of the view) | "Loading OpenCV (about 9 MB)…" Steps 2–5 are disabled; step 1 previews work. |
| OpenCV failed to load | "Couldn't load OpenCV. Camera calibration is unavailable. Use Manual measurement." |
| Only one camera connected | "Only one camera found. Connect a second USB webcam, then press **Refresh**." |
| Calibration camera in use | "The calibration camera is in use by another app." |
| Calibration camera unplugged | "Calibration camera disconnected. Captures are kept. Reconnect it to continue." |
| Auto-detect finds no board | "No board found. Show the whole board to the camera, or pick the dictionary by hand." |
| Marker IDs don't fit the board | "Found markers that aren't on a 9 × 7 board. Check columns and rows." |
| Lens step not done | Capture is disabled with the step-5 hint. |
| Window not spanning both screens | The step-4 warning. Markers stay off. |
| Result out of range | That row is red and its tick box is disabled. |

#### Profile additions

A new `calibration` group, sanitized like the rest and included in JSON
export/import:

```js
calibration: {
  deviceId: '',                 // calibration camera
  board: { cols: 9, rows: 7, squareMm: 23.5, markerMm: 13, dictionary: '6x6' },
  lenses: {                     // key: "<camera label> @ <width>x<height>"
    'Astra Pro FHD Camera @ 1920x1080':
      { fx, fy, cx, cy, dist: [k1, k2, p1, p2, k3], rmsPx, at }
  }
}
```

Pose captures aren't saved. They are kept while the page is open.

## 5. Experience view

- **Apply** saves the profile, stamps the calibration time and folds the
  setup panel. It does *not* use browser fullscreen: Chrome's fullscreen
  covers only one monitor. Instead the window is spanned edge to edge
  across both monitors by `tools/span_window.py` (see README). The script
  launches Chrome as a frameless app window and asks the window manager to
  make it fullscreen across both monitors.
- If tracking is not yet calibrated, **Apply** calibrates automatically as
  soon as 12 steady samples exist, using the eyes → webcam distance from the
  slider (the user must sit at that distance). Without calibration the eye
  distance stays fixed at the slider value.
- **Auto-apply on launch:** when a saved profile exists, the app opens with
  the setup panel folded and tracking running. The eye calibration (and the
  eyes → webcam distance) is saved on Apply and Calibrate, and restored on
  launch if the webcam pose and camera aspect are unchanged. Otherwise
  recalibrate.
- **Zoom-search tracking (range):** once a face is found, Face Mesh runs on
  a crop around it so a distant face gives the iris enough pixels; while
  searching it cycles the full frame and zoomed crops. (A separate MediaPipe
  face-finder was tried and removed: it crashed in the browser.)
- **Tracking accuracy test** (Home, Scene section): **Run accuracy test**
  simulates the webcam and shows the worst eye error (cm) per viewing
  distance for wrong FOV, tilt, slider distance and iris-pixel error.
  Same code as `node tracking-accuracy.test.cjs`.
- **Steadiness filter (shake reduction):** the eye position from the
  webcam is noisy (mostly the distance, from the iris size), which makes
  the picture shake while the viewer sits still. A speed-adaptive
  (One Euro) filter smooths heavily when the head is still and lightly
  when it moves, so it removes the shake without adding lag to real
  movement. **Advanced → Steadiness (%)**, default 50: higher = steadier
  but slightly slower to follow, 0 = almost no filtering. Saved in the
  profile (`advanced.steadiness`). It runs before the existing smoothing
  time; lower the smoothing time if the picture feels laggy.
- **Span both screens** button (Home view, Scene section, key **F**): uses
  the Window Management API (`getScreenDetails`, asks the browser's
  permission once) to find the bounding box of all monitors, then moves and
  resizes the window to it. If the browser refuses to resize a normal tab,
  it opens the app in a popup window at that box instead. Status text
  reports failures (no permission, single monitor). `tools/span_window.py`
  remains the true-fullscreen option.
- Eye tracking runs on the seam-top webcam and drives one eye position for
  both screen projections.
- The whole scene responds fully and physically correctly: room, frame,
  panda and shadows.
- Keys: **H** shows or hides the whole left column, **D** cycles the
  mini-view between *both views*, *top only* and *side only*, **P** pauses
  motion, **R** restarts the camera. Keys are ignored while typing in a
  field.
- If tracking is lost, the last view is held and a small status pill shows
  "Tracking lost: eyes not visible".

### 5.1 Debug mini-view (digital review)

The lower section of the left-side 20% column (§2). It is always visible
while the column is shown. **D** cycles *both → top → side*.

**Top view, to scale:**
- the two screen segments at the calibrated angle, with the gap drawn;
- the **tracking camera** position, facing direction and view cone (as entered
  manually or as solved by the calibration camera);
- the live eye position (dot), with a short trail;
- the eye → screen frusta, one colour per screen: lines from the eye to
  each lit area's outer edges, showing the view range;
- the virtual scene's outline (room box and panda position).

**Side view:** the same elements seen from the side, including the webcam
tilt and the eye height.

**Parameter tags** (the values typed in setup, in bold):
- **θ 97.0°**, **gap 1.5 cm**, **33.6 × 59.8 cm**, **offset 0 cm**
- **Cam: +3 cm top, 0 cm fwd, 25° tilt, 60° FOV**
- Eye (live): x / y / z in cm, distance to seam, distance to webcam
- Tracking: FPS, sample age (ms), calibrated yes/no, calibration time
- Warnings in red, e.g. "Eye outside supported area" or "Eye behind
  left-screen plane".

This panel is how you find what's wrong. If the eye dot jumps while you
sit still, tracking is the problem. If the frusta don't meet the screen
edges, the screen geometry is the problem.

---

## 6. What changes from the current code (for implementation)

| Area | Change |
|---|---|
| `concave-geometry.js` | `screens(width, height, {angle, gap, vOffset})`. The options default to the v1 90°/gapless pair, so the v1 demos are unchanged. Adds `planeDistance`, `inFront`, `angleFromOuterDistance`, `outerDistance`. `project()` is unchanged. |
| `concave-room.js` | Remove the 75% room follow. Remove the display-window / BroadcastChannel mode. The profile lives in `room-profile.js` and the mini-view drawing in `room-miniview.js`. |
| `concave-room.html` | Restructure the controls into the foldable drawer with Home / Manual / Camera views and a sticky **Apply** footer. Remove Open left/right. |
| New | `calibration-camera.js`: v2.0 = placeholder UI plus calibration-camera selection and preview only. Then (§4.3): ChArUco and screen-marker detection, lens calibration and the shared-board pose solver, using OpenCV.js (a build with ArUco/ChArUco and calib3d) served locally from `vendor/` so it works offline, and loaded only when the Camera view first opens. |
| Layout | Left 20% column on the left screen: setup panel above, mini-view below. |
| Versioning | The current demos are tagged `v1.0` and stay in the repo. v2.0 turns `concave-room.html` into the single app. |
| Tests | `room-v2.test.cjs`: corner positions for angles 60°–180°, gaps and offsets; a flat 180°, 0-gap pair must match a single wide screen; the angle helper; profile sanitizing. |

---

## 7. Decisions

1. The v1.0 demo files (`index.html`, `concave.html`) **stay in the repo**.
2. Camera calibration is **optional**. It is a placeholder UI in v2.0, and
   manual input is the primary path.
3. The calibration camera is a **second USB webcam** (no phone support).
4. Method: a **shared board** seen by both cameras at the same moment. No
   marker is attached to the tracking camera.
5. The board can be the user's own rigid ChArUco board (any size, square
   count and dictionary) or a printed PDF from the app. The lab board is
   9 × 7 squares of 23.5 mm, 13 mm markers, `DICT_6X6_250`.
6. The board lies **face up** in front of the screens during pose captures,
   so both cameras see its face (§4.3).
7. Both cameras get a one-time lens calibration, saved per camera and
   resolution. The calibration camera needs it for accurate poses, and it
   gives the tracking camera's real FOV.
