# Fixed-viewpoint calibration

`calibrate.html` is stages 1–9 of the two-monitor virtual-replica brief: one shared scene, one
replica root, one manually placed eye, two off-axis projections, nothing else. No webcam, no room,
no props, no seam-overlap slider. Head tracking is stage 10 and is deliberately absent — adding it
earlier only makes two wrong views move.

Run `node calibrate.test.cjs` (Node 18+, no network) and open `calibrate.html` from
`python3 -m http.server 8000`.

## Why "it looks right" is not a result

The illusion is defined to be exact from exactly one point in the room. Judging it from anywhere
else measures your head position, not the software. Two people looking at the same corner will
honestly disagree, and neither is wrong. So every claim below is tied to a number that someone
else can reproduce with a ruler, a tripod and the same page.

One rule follows from the geometry and is worth stating early: **do the perceptual tests with one
eye closed.** Both of your eyes see the same flat image, so binocular disparity always contradicts
the rendered perspective. That conflict is not a geometry error and cannot be calibrated away; with
one eye it disappears and what remains is the thing you are actually testing.

## The measurement chain

Six layers, weakest assumption first. Each one catches something the previous one cannot.

| # | Test | Instrument | Catches | Blind to |
|---|---|---|---|---|
| 0 | Model self-consistency | `calibrate.test.cjs`, the page's own panel | Projection, matrix and seam bugs | Everything about your actual room |
| 1 | On-glass registration | Ruler, masking tape | Panel dimensions, window split, pixel mapping | Eye position, absolute scale |
| 2 | Zero-parallax anchors | Your eye, or a camera | Eye/projection inconsistency | Absolute scale |
| 3 | Parallax gain | Ruler + a measured head move | Wrong depth response, wrong eye distance | Lateral offsets |
| 4 | Physical coincidence | A real object at a known place | Absolute scale and placement | Little — but it is the fiddliest |
| 5 | Seam step | Photograph from the eye point | The "two independent windows" symptom | Absolute scale |

### Layer 0 — model self-consistency (free, automatic)

The page computes the projection matrices in `calibrate-verify.js` and hands *those same matrices*
to the renderer; a check in the panel confirms the renderer did not modify them. The verifier then
proves, over a sweep of eye positions and world points, that:

- the matrices reproduce the plain ray/plane intersection of `eye → point → panel`, to 1e-12 m;
- any point in the plane through the eye and the hinge lands on the **same** world point on both
  panels — one world, continuous across the corner;
- a mark on a panel plane never moves on the glass when the eye moves;
- on-glass motion equals `delta x depth/(depth − standoff)` exactly, the closed-form parallax law;
- no world point is drawn on both panels.

This proves the code implements the geometry it claims. It proves nothing about your room, and it
will happily pass with a completely mis-measured setup. That is what layers 1–5 are for.

### Layer 1 — on-glass registration (ruler)

The page draws crosses at 10%, 50% and 90% of each panel's width and height, exactly on the panel
plane, and prints where each one must land in millimetres from that panel's seam edge and from its
bottom edge. Stick tape at those positions, look at the screen, compare.

This is a pure geometry check: no viewpoint, no perception. If a cross is 6 mm out, your entered
width is wrong, or the window is not split at the real pixel boundary, or the display is scaling.

**Accept:** every cross within 2 mm of its predicted position.

### Layer 2 — zero-parallax anchors (binary, no judgement)

The anchors are drawn *on the glass plane*. Their parallax gain is exactly zero, so a correct system
pins them to the same physical spot for every eye position. Move your head over ±80 mm, or turn on
the built-in sweep. Either they sit still against the tape, or they do not.

There is no "looks about right" here — drift is visible against a fixed reference or it is not. If
they drift, the projection is not off-axis, or the eye position is not shared between the panels.

**Accept:** no drift you can see against tape; under a camera, under 1 mm over ±80 mm.

### Layer 3 — parallax gain (the quantitative one)

For an eye translation parallel to a panel, the image of a point at plane-depth `d` slides along the
glass by exactly

```
displacement = movement × d / (d − h)        h = eye standoff from that panel plane
```

At a 90° corner, **vertical** head motion is parallel to both panels at once, so one predicted number
covers both screens. That is why the protocol measures parallax by moving the head up, not sideways.

Choose the depth-comb target. The panel prints the gain and the predicted on-glass displacement for a
60 mm head rise — for the default 53.1 × 29.9 cm panels at 45 cm, a marker 20 cm behind the seam
moves 18.5 mm, one 12 cm in front moves 21.8 mm **the other way**. Mark a start and end head height,
photograph or mark the feature's position on the glass at each, measure the shift.

Getting the sign right matters as much as the magnitude: foreground and background must move in
opposite directions. A system that moves everything together is not showing depth.

**Accept:** within 10% of prediction at three depths, including one negative gain.

### Layer 4 — physical coincidence (absolute scale)

Nothing above can tell a correct replica from one rendered at 90% scale. Put a real object — a pencil
taped upright, a ruler — at the physical position of a virtual one, and look from the eye point with
one eye. They must overlap.

**Accept:** overlap within 5 mm at 45 cm.

### Layer 5 — seam step (photograph from the eye)

Put a camera where the eye is meant to be, at the entered distance and height. Select the
seam-crossing rod. In the photograph, the rod's two halves must be one straight line, apart from the
strip hidden behind the bezels — whose width the page predicts (16.6 mm of world at 20 cm behind the
seam, with 8 mm bezels). Measure the residual kink in pixels and convert with the camera's angular
resolution; a phone at ~60° across 4000 px resolves about 0.9′ per pixel.

**Accept:** kink under 2′, about 2 pixels on that phone. Keep the corner near the centre of frame so
lens distortion does not contribute.

## Where to spend your measuring effort

Measured, not assumed. Each row perturbs one input by a realistic slip and reports the angular error
the viewer receives. The two columns are different failures and must not be averaged:
**whole scene** is a rigid shift of the replica — forgiving, it just sits a few millimetres off.
**Seam step** is the differential part, the step a straight line takes across the corner. Human
vernier acuity is about 1′, so anything above ~2′ reads as two separate windows.

| Wrong by | Whole scene | Seam step |
|---|---:|---:|
| Window split +0.5 % | 16.4′ | **29.7′** |
| Edge-to-hinge (bezel) +2 mm | 21.6′ | **11.5′** |
| Eye distance +50 mm | 121.8′ | 5.5′ |
| Corner angle +3° | 22.2′ | 5.2′ |
| Panel height +2 mm | 6.9′ | 4.4′ |
| Eye distance +20 mm | 54.3′ | 2.4′ |
| Corner angle +1° | 7.6′ | 1.7′ |
| Eye sideways +10 mm | 69.1′ | 1.3′ |
| Panel width +2 mm | 13.0′ | 0.2′ |
| Eye height +10 mm | 70.2′ | 0.2′ |

Four conclusions, none of them obvious beforehand:

1. **The window split is the most damaging parameter by a factor of five.** Half a percent — 10 px
   out of 1920 — steps the seam by 30′, fifteen times the visible threshold. Spanning one browser
   window across two monitors makes this a critical setting that browser chrome, taskbars and
   fractional scaling all disturb. **Use two fullscreen windows instead** (Open left / Open right).
   Each viewport is then exactly one panel and the error is structurally zero, not merely small.
2. **Measure the gap from each active area to the hinge.** It is the second most damaging input and
   the one nobody measures. 2 mm costs 11.5′.
3. **Eye position barely affects seam continuity** — ±10 mm costs under 1.5′ — even though it
   dominates the whole-scene error. A broken corner is therefore almost never a seating problem, and
   head-tracking accuracy is not what makes the corner join. This is the quantitative reason the
   brief puts tracking last: it cannot fix what it is not causing.
4. **Panel width hardly matters at the seam, because the geometry is anchored at the hinge.** Width
   errors push the outer edge around, not the join. Keep that convention.

Resulting tolerances: split pixel-exact (separate windows), edge-to-hinge ±0.5 mm, panel height
±0.5 mm, corner angle ±0.5°, panel width ±5 mm, eye ±10 mm for corner work and ±3 mm if you care
about where the replica sits in absolute terms.

### Calibrate by nulling, not by measuring

Edge-to-hinge is easier to *null* than to measure. Select the rod, photograph from the eye, and adjust
the value until the kink is minimised. Nulling against a straight line resolves well under the
±0.5 mm a caliper gives you, and it absorbs whatever the caliper could not reach.

The corner angle has its own independent check: measure the straight-line distance between the two
outer edges of the active areas with a tape and enter it. From `chord² = a² + b² − 2ab·cos(angle)`
the page recovers the angle the hardware actually has; 1 mm of tape error is about 0.08°, far finer
than the ±0.5° that matters.

## Negative controls

A test that cannot fail is not a test. `calibrate.test.cjs` runs four known-wrong configurations and
asserts that the checks reject them:

- **Two ordinary per-monitor cameras**, each aimed at its own panel — the approach the brief
  diagnoses. Mis-places content by 54 mm and lets glass-fixed marks drift 45 mm.
- **A 5% seam overlap**, as offered by `concave-geometry.js`. Preserves scale and vertical alignment,
  which is why it looks harmless, and slides content 27 mm off its true place on each panel.
- **A 75% scene follow**, as used by `concave-room.js` for its room. Turns a parallax gain of 0.471
  into 0.868: geometry drawn 40 cm behind the seam reports itself at nearly 3 m. Anything else in the
  same frame rendered honestly contradicts it, which is exactly how a scene starts reading as two
  windows.
- **A 2° corner error**, which passes every self-check because the model is consistent with itself,
  and is caught only by the tape measure.

## Order of work

1. Mount both monitors at 90°, inner edges as close as the bezels allow.
2. Measure: active width and height of each panel, and the gap from each active area to the hinge.
3. Open `calibrate.html` on the left monitor, use **Open left** / **Open right**, drag each window to
   its monitor, fullscreen both. Keep the controller open.
4. Enter the dimensions and the tape chord. Confirm every check in the panel is green.
5. Layer 1 with tape and a ruler, then layer 2 with the sweep.
6. Layer 5 with the rod; null the edge-to-hinge value against the kink.
7. Layer 3 with the depth comb — three depths, both signs.
8. Layer 4 with a real object.
9. Only now: cube → sphere → robot, then the rest of the scene, then head tracking.

Record the numbers at each step. A calibration nobody wrote down has to be redone.
