---
name: demo_3d_testing
description: Run the fixed-viewpoint calibration and verification protocol for the two-monitor 90° virtual-replica demo. Use when the user wants to test, calibrate, verify or debug the corner illusion — seam kinks, wrong parallax, "it looks like two separate monitors", panel measurement, bezel gap, model distance, or before adding head tracking. Covers calibrate.html, calibrate-verify.js and calibrate.test.cjs.
---

# Two-monitor 90° corner: calibration and verification

Match the user's language in your replies. `OPERATION.zh.md` is the Chinese operator
guide; `CALIBRATION.md` is the English methodology and the sensitivity derivation.

## What this repository contains

| Page | What it is | Use for calibration? |
|---|---|---|
| `index.html` | Single-camera prototype | **No** |
| `concave.html` | Dancer demo, webcam head tracking | **No** |
| `concave-room.html` | Panda room demo, webcam head tracking | **No** |
| `calibrate.html` | Fixed-viewpoint rig: one cube, black background, verification panel, no webcam | **Yes — only this one** |

The two demo pages carry deliberate non-physical adjustments — `concave-room.js`
moves the room with 75 % of the eye translation, and `concave-geometry.js` offers a
±20 % seam-overlap shift. Both hide geometry errors. Never calibrate on them, and
never reproduce either adjustment in the calibration path.

## Hard rules

- **Never** add a seam-overlap or image-shift control to close the seam gap. The strip
  the bezels hide is physically correct. Closing it means the two panels show
  duplicated world.
- **Never** add webcam tracking before the fixed-viewpoint protocol passes. Tracking is
  stage 10 of the brief and cannot fix what it does not cause (a ±10 mm eye error costs
  only 1.3′ of seam step, against 29.7′ for a 0.5 % window-split error).
- **Never** use `MeshNormalMaterial` for a calibration target. The two cameras differ by
  the corner angle, so a view-space normal colours the same face differently on each
  panel and fakes a kink. Use Lambert or flat colours.
- All perceptual steps are done **with one eye closed**. Both eyes see the same flat
  image, so binocular disparity always contradicts the rendered perspective; that is not
  a geometry error and cannot be calibrated away.

## Start here

```bash
node calibrate.test.cjs          # offline, no CDN, must be fully green first
python3 -m http.server 8000      # then open http://localhost:8000/calibrate.html
```

If `calibrate.test.cjs` fails, stop and fix that before touching the hardware — the
maths is broken, not the room.

## Compute the user's target numbers

Every acceptance number depends on their panel sizes. Derive them, do not quote the
defaults:

```bash
node -e "
require('./calibrate-verify.js'); const V = globalThis.CalibrationVerify;
const setup = { angleDeg: 90,
  left:  { width: .531, height: .299, bezel: .005, pixels: 1920 },
  right: { width: .531, height: .299, bezel: .005, pixels: 1920 },
  eye: { x: 0, y: 0, z: .45 } };                       // <- their measurements
const screens = V.screens(setup), eye = V.eyeOf(V.setup(setup));
for (const s of screens) console.log(s.name, 'crosses at mm from seam edge:',
  [.1,.5,.9].map(u => ((s.name === 'left' ? 1-u : u)*s.width*1000).toFixed(1)).join(' / '));
console.log('tape chord should be', (V.predictedChord(setup)*100).toFixed(2), 'cm');
console.log('hidden at -20 cm:', (V.seamGap(setup, -.2)*1000).toFixed(1), 'mm');
for (const row of V.sensitivity(setup)) console.log(row.id.padEnd(26),
  'whole', row.arcminutes.toFixed(1) + \"'\", 'seam', row.seamStepArcminutes.toFixed(1) + \"'\");
"
```

`V.runAll(setup)` returns every check plus `predictions`; `V.sensitivity(setup)` says
which of their measurements is worth a second trip with the ruler.

## The protocol

Work these in order and record each result. Do not skip ahead on a failure — a later
layer cannot diagnose an earlier one.

0. **Measure**: each panel's active width and height, each panel's active-area edge to
   the hinge, each panel's horizontal pixel count, and the tape distance between the two
   outer active-area edges. Enter all of it; the `Measured corner angle` check must be
   green. Corner angle is forgiving (±0.5° is fine) — do not over-invest there.
1. **Display**: use **Open left / Open right** and fullscreen each window on its own
   monitor, not one spanning window. The window split is the single most damaging
   parameter (0.5 % → 29.7′ seam step); separate windows make it structurally zero.
   Confirm `Viewport aspect` is green.
2. **Ruler**: target `Nothing`. The panel prints where each on-glass cross must land in
   mm from the seam edge and from the bottom edge. Tape and measure.
   **Accept: every cross within 2 mm.** Failure ⇒ wrong dimensions, window not
   fullscreen, or display scaling.
3. **Anchors**: turn on `Automatic eye sweep`, or move the head ±80 mm. The on-glass
   crosses have parallax gain exactly zero and must not move against the tape. This is
   binary — drift or no drift. Failure ⇒ projection is not off-axis, or the two panels
   are not sharing one eye position.
4. **Null the seam**: target `Seam-crossing rod`. Photograph from the eye point, then
   **drag the `Edge to hinge` slider until the kink disappears**. Nulling resolves far
   finer than a caliper. A phone at ~60° across 4000 px gives ~0.9′ per pixel.
   **Accept: residual kink under 2 px.** The hidden strip stays — do not close it.
5. **Reference photograph**: tick `Show what a camera at the eye should photograph` and
   set the field of view to the camera's. Off-axis projection is defined by the property
   that the two panels reproduce, at the eye, the image of looking straight at the
   scene, so this ordinary perspective render is the correct target. Photograph the real
   corner from the eye position and compare the two pictures: panel outlines, the dark
   bezel band, and the object's silhouette should coincide. This compares software
   against the physical world; comparing two renders on screen proves nothing the
   numeric checks do not already prove to 1e-12 m.
6. **Parallax**: target `Depth comb`. Raise the head by a measured 60 mm — **vertically**,
   because at a 90° corner that is the only translation parallel to both panels at once.
   Measure each marker's on-glass displacement against the panel's predictions.
   **Accept: three depths within 10 %, and the nearest marker must move opposite to the
   head.** Direction matters more than magnitude. The foreground markers sit off-axis so
   their reverse signal is weak (~4 mm); for a stronger one, push `Replica centre`
   negative and use the cube.
7. **Absolute scale**: nothing above separates a correct replica from one at 90 % scale.
   Put a real object at the virtual object's physical position and look from the eye
   point with one eye. **Accept: overlap within 5 mm at 45 cm.**
8. **Restore**: cube → sphere → robot → full scene → head tracking, in that order.

## Diagnosis

| Symptom | Check in this order | Cost of that error |
|---|---|---|
| Step or kink at the seam | window split → edge-to-hinge → panel height → corner angle | 29.7′ / 11.5′ / 4.4′ / 5.2′ (at 3°) |
| Whole replica offset, seam fine | eye position; leave the geometry alone | 10 mm sideways = 69′ whole, 1.3′ seam |
| Anchors drift | projection is not off-axis, or eyes not shared | — |
| Object the wrong size | only step 7 finds it; re-check active-area dimensions | — |
| Duplicated content at the seam | someone added a seam overlap; remove it | 5 % = 27 mm per panel |

## Recording

Write results to `calibration-log.md` in the repo root (create it if absent), one dated
block per session using the template at the end of `OPERATION.zh.md`. An unrecorded
calibration has to be redone. Commit the log; it is the evidence that a configuration
was ever verified.
