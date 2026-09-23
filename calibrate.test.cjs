// Run with Node 18+: node calibrate.test.cjs
// Offline on purpose — no CDN, no DOM. The geometry must be checkable anywhere.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./calibrate-verify.js');
const V = globalThis.CalibrationVerify;

const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const length = a => Math.sqrt(dot(a,a));
const unit = a => mul(a, 1/length(a));
const mm = value => `${(value*1000).toFixed(2)} mm`;

/* ---- 1. the page is wired to its own controls -------------------------- */
{
  const source = fs.readFileSync(path.join(__dirname, 'calibrate.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'calibrate.html'), 'utf8');
  for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(html.includes(`id="${id}"`), `Missing control: ${id}`);
  assert.ok(!/getUserMedia|FaceMesh|mediapipe/i.test(source), 'Stage 1-9 must not touch the webcam');
  assert.ok(!/overlap\s*[:=]|projectionMatrix\.elements\[8\]/.test(source), 'No seam-overlap fudge on the calibration page');
  assert.ok(/replicaRoot/.test(source) && /replicaCenter/.test(source), 'One replica root and one replica centre');
  console.log('PASS: control wiring, no webcam, no seam-overlap fudge, replica root present.');
}

/* ---- 2. every check passes across realistic, asymmetric setups ---------- */
{
  let configurations = 0;
  for (const angleDeg of [80, 90, 100])
    for (const left of [{width:.531,height:.299,bezel:.008,pixels:1920}, {width:.6,height:1.067,bezel:.012,pixels:1080}])
      for (const right of [{width:.531,height:.299,bezel:.008,pixels:1920}, {width:.48,height:.299,bezel:.004,pixels:1736}])
        for (const eye of [{x:0,y:0,z:.45}, {x:.05,y:-.04,z:.62}, {x:-.08,y:.06,z:.9}]) {
          if (left.height !== right.height) continue;
          const report = V.runAll({ angleDeg, left, right, eye });
          for (const check of report.checks) {
            if (check.pass === null) continue;
            assert.ok(check.pass, `${check.id} failed at angle ${angleDeg}: ${check.value} ${check.units}`);
          }
          configurations++;
        }
  console.log(`PASS: ${configurations} setups — matrices, seam registration, zero parallax, parallax law, coverage, pixel scale.`);
}

/* ---- 3. the corner definition still matches the existing demos ---------- */
{
  const q = Math.SQRT1_2, width = .6, height = 1.067;
  const legacy = [
    { pa: [-width*q, -height/2, width*q], pb: [0, -height/2, 0], pc: [-width*q, height/2, width*q] },
    { pa: [0, -height/2, 0], pb: [width*q, -height/2, width*q], pc: [0, height/2, 0] }
  ];
  const screens = V.screens({ angleDeg: 90, left: {width, height, bezel: 0}, right: {width, height, bezel: 0} });
  screens.forEach((screen, index) => {
    for (const corner of ['pa', 'pb', 'pc'])
      assert.ok(length(sub(screen[corner], legacy[index][corner])) < 1e-12, `corner ${corner} matches concave-geometry`);
  });
  console.log('PASS: zero-bezel 90° corner reproduces concave-geometry.js exactly.');
}

/* ---- 4. bezels hide a wedge, and that is the expected seam behaviour ---- */
{
  const none = V.seamGap({ left: {bezel: 0}, right: {bezel: 0} }, -.2);
  assert.ok(Math.abs(none) < 1e-12, `zero bezel must hide nothing, got ${mm(none)}`);
  let previous = 0;
  for (const bezel of [.002, .006, .012, .02]) {
    const gap = V.seamGap({ left: {bezel}, right: {bezel} }, -.2);
    assert.ok(gap > previous, 'wider bezels hide more');
    previous = gap;
  }
  console.log(`PASS: hidden wedge is 0 without bezels and grows with them (8 mm bezels hide ${mm(V.seamGap({left:{bezel:.008},right:{bezel:.008}}, -.2))} at 20 cm behind the seam).`);
}

/* ---- 5. NEGATIVE CONTROL: two ordinary cameras, one rotated to the panel  */
{
  // The approach the brief rejects: a symmetric perspective view per monitor,
  // aimed at the centre of that monitor and sized to fit it.
  function naiveUV(screen, eye, point) {
    const b = V.basis(screen), centre = V.uvToWorld(screen, .5, .5);
    const forward = unit(sub(centre, eye));
    const right = unit(cross(forward, [0,1,0])), up = cross(right, forward);
    const distance = length(sub(centre, eye));
    const tangent = (b.height/2)/distance, aspect = b.width/b.height;
    const rel = sub(point, eye), w = dot(forward, rel);
    if (w <= 1e-9) return null;
    return { u: dot(right, rel)/w/(tangent*aspect)/2 + .5, v: dot(up, rel)/w/tangent/2 + .5 };
  }
  const setup = V.setup({});
  const screens = V.screens(setup), eye = V.eyeOf(setup);
  let worstShape = 0, worstDrift = 0;
  for (const screen of screens) {
    for (const u of [.05,.5,.95]) for (const v of [.05,.5,.95]) for (const depth of [-.6,-.2,.1]) {
      const point = add(V.uvToWorld(screen, u, v), mul(V.basis(screen).normal, depth));
      const truth = V.worldToUV(screen, eye, point), naive = naiveUV(screen, eye, point);
      if (!truth || !naive) continue;
      worstShape = Math.max(worstShape, Math.abs(truth.u-naive.u)*screen.width, Math.abs(truth.v-naive.v)*screen.height);
    }
    for (const u of [.15,.5,.85]) for (const v of [.15,.5,.85]) {
      const onGlass = V.uvToWorld(screen, u, v);
      for (const moved of [[.06,0,.45], [0,.06,.45], [-.06,.03,.5]]) {
        const naive = naiveUV(screen, moved, onGlass);
        if (!naive) continue;
        worstDrift = Math.max(worstDrift, Math.abs(naive.u-u)*screen.width, Math.abs(naive.v-v)*screen.height);
      }
    }
  }
  assert.ok(worstShape > .005, 'the naive view must visibly disagree with the eye->panel ray');
  assert.ok(worstDrift > .005, 'the naive view must let on-glass marks drift as the eye moves');
  console.log(`PASS (negative control): two ordinary per-monitor views mis-place content by ${mm(worstShape)} and let glass-fixed marks drift ${mm(worstDrift)}. The checks reject it.`);
}

/* ---- 6. NEGATIVE CONTROL: shifting the images to tidy up the seam -------- */
{
  // concave-geometry.js offers a +/-20% seam overlap. It preserves scale, so it
  // looks harmless — but it breaks the one-world property outright.
  const setup = V.setup({}), screens = V.screens(setup), eye = V.eyeOf(setup);
  const overlap = .05;
  let worst = 0;
  for (const depth of [-.6,-.25,-.05]) for (const height of [-.2,0,.2]) {
    const point = [0, height, depth];
    screens.forEach((screen, index) => {
      const truth = V.worldToUV(screen, eye, point);
      if (!truth) return;
      // The overlap shifts NDC x by +/-2*overlap, i.e. u by +/-overlap.
      const shifted = truth.u + (index === 0 ? -overlap : overlap);
      worst = Math.max(worst, Math.abs(shifted - truth.u)*screen.width);
    });
  }
  assert.ok(worst > .02, 'a 5% overlap must move content by centimetres');
  console.log(`PASS (negative control): a 5% seam overlap slides content ${mm(worst)} off its true position on each panel — duplicated or missing world, not a fix.`);
}

/* ---- 7. NEGATIVE CONTROL: letting the scene follow the viewer ------------ */
{
  // concave-room.js moves the room with 25% of the eye translation to keep the
  // corner tidy. Measure what that does to the depth the room reports.
  const setup = V.setup({}), screens = V.screens(setup), eye = V.eyeOf(setup);
  const follow = .75, move = .06, screen = screens[0];
  const truthDepth = -.4;
  const point = [0, 0, truthDepth];
  const moved = [eye[0], eye[1] + move, eye[2]];
  const before = V.worldToUV(screen, eye, point);
  const after = V.worldToUV(screen, moved, add(point, [0, move*follow, 0]));
  const effective = (after.v - before.v)*screen.height/move;
  const standoff = V.standoff(screen, eye);
  const honest = V.parallaxGain(screen, eye, point);
  const apparentPlaneDepth = effective/(effective - 1)*standoff;
  const apparentSeamDepth = apparentPlaneDepth*Math.SQRT2;
  assert.ok(Math.abs(effective - honest) > .1, 'a 75% follow must change the reported parallax');
  assert.ok(Math.abs(apparentSeamDepth - truthDepth) > .05, 'a 75% follow must change the reported depth');
  console.log(`PASS (negative control): a 75% scene follow turns gain ${honest.toFixed(3)} into ${effective.toFixed(3)}; geometry drawn at ${(truthDepth*100).toFixed(0)} cm reports itself at ${(apparentSeamDepth*100).toFixed(0)} cm. Anything rendered honestly in the same frame contradicts it.`);
}

/* ---- 8. NEGATIVE CONTROL: the maths cannot see a mis-measured room ------- */
{
  // Hardware really at 88 degrees, code told 90. Every numeric check still passes,
  // because they all verify the model against itself. Only the tape catches it.
  assert.ok(V.runAll({ angleDeg: 90 }).pass, 'the wrong angle is internally consistent — that is the point');
  const whole = V.misalignment({ angleDeg: 88 }, { angleDeg: 90 });
  const step = V.seamStep({ angleDeg: 88 }, { angleDeg: 90 });
  assert.ok(whole.arcminutes > 5, 'a 2 degree error must be visible against vernier acuity');
  assert.ok(step.arcminutes > 1, 'and it must step the seam');
  const flagged = V.checkCornerAngle({ angleDeg: 90 }, V.predictedChord({ angleDeg: 88 }));
  assert.equal(flagged.pass, false);
  assert.ok(Math.abs(flagged.detail.impliedAngleDeg - 88) < 1e-6);
  console.log(`PASS (negative control): a 2° corner error shifts the scene ${whole.arcminutes.toFixed(1)}′ and steps the seam ${step.arcminutes.toFixed(1)}′, passes every self-check, and is caught only by the tape measure (implied ${flagged.detail.impliedAngleDeg.toFixed(2)}° vs entered 90°).`);
}

/* ---- 9. the published parallax predictions are the ones being drawn ------ */
{
  const setup = V.setup({}), screens = V.screens(setup), eye = V.eyeOf(setup);
  const report = V.runAll(setup), move = .06;
  for (const probe of report.predictions.probes) {
    const point = [0, 0, probe.seamDepthMm/1000];
    assert.ok(probe.matched, 'bisector probes must have one gain for both panels');
    screens.forEach((screen, index) => {
      const before = V.projectViaMatrix(screen, eye, point, setup.near, setup.far);
      const after = V.projectViaMatrix(screen, [eye[0], eye[1]+move, eye[2]], point, setup.near, setup.far);
      const measured = (after.v - before.v)*screen.height*1000;
      assert.ok(Math.abs(measured - probe.verticalShiftMm[index]) < 1e-9,
        `published shift ${probe.verticalShiftMm[index]} != drawn ${measured}`);
    });
  }
  console.log('PASS: every millimetre the panel predicts for a 60 mm head rise is the millimetre the projection produces.');
}
/* ---- 10. what actually breaks the corner, measured not guessed ---------- */
{
  const rows = {};
  for (const row of V.sensitivity()) rows[row.id] = row;
  // A benign fault shifts the whole replica; a fatal one shifts the two panels
  // by different amounts. These are different numbers and must not be conflated.
  assert.ok(rows['eye sideways +10 mm'].arcminutes > 30, 'a 10 mm eye error shifts the whole scene a lot');
  assert.ok(rows['eye sideways +10 mm'].seamStepArcminutes < 3, 'but it barely steps the seam');
  assert.ok(rows['eye height +10 mm'].seamStepArcminutes < 3, 'nor does an eye-height error');
  assert.ok(rows['window split +0.5 %'].seamStepArcminutes > 10, 'a mis-split window is what really breaks the corner');
  assert.ok(rows['left edge-to-hinge +2 mm'].seamStepArcminutes > 5, 'so does an unmeasured bezel');
  assert.ok(rows['window split +0.5 %'].seamStepArcminutes > rows['eye sideways +10 mm'].seamStepArcminutes*5,
    'the split dominates the eye position for seam continuity');
  assert.ok(rows['left width +2 mm'].seamStepArcminutes < 1,
    'measuring panels from the seam outward keeps a width slip away from the seam');
  const order = V.sensitivity().sort((a, b) => b.seamStepArcminutes - a.seamStepArcminutes).map(row => row.id);
  console.log('PASS: seam-continuity sensitivity, worst first — ' + order.slice(0, 3).join(' > ') + '.');
  for (const row of V.sensitivity()) {
    console.log(`      ${row.id.padEnd(26)} whole scene ${row.arcminutes.toFixed(1).padStart(6)}'   seam step ${row.seamStepArcminutes.toFixed(1).padStart(5)}'`);
  }
}

/* ---- 11. a perfect model is still only a model -------------------------- */
{
  // Sanity: with nothing perturbed, both error metrics must be exactly zero.
  const clean = V.misalignment({}, {}), step = V.seamStep({}, {});
  assert.ok(clean.degrees < 1e-9 && step.arcminutes < 1e-6, 'an unperturbed model must report no error');
  assert.ok(clean.samples > 50 && step.samples > 5, 'the error metrics must actually sample something');
  console.log(`PASS: unperturbed model reports zero error over ${clean.samples} directions and ${step.samples} seam crossings.`);
}

console.log('\nAll calibration checks passed. The maths is sound; the room still has to be measured.');
