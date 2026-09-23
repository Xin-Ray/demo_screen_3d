/* Fixed-viewpoint calibration: panel geometry, off-axis matrices and numeric checks.
   Pure math. No Three.js, no DOM, no network — runs in the browser and under Node.

   World frame, metres: +x right, +y up, +z from the seam toward the viewer.
   The hinge is the vertical line x = 0, z = 0. Both panels open toward +z, so an
   eye at (0, 0, d) sits on the bisector d metres in front of the corner.
   Each panel's active area starts `bezel` metres out from the hinge; the wedge
   between the two active areas is hidden by the physical bezels, not by a bug. */
(function (root) {
  'use strict';
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const length = a => Math.sqrt(dot(a,a));
  const unit = a => mul(a, 1/length(a));

  const DEFAULT_SETUP = {
    angleDeg: 90,
    left:  { width: .531, height: .299, bezel: .008, pixels: 1920 },
    right: { width: .531, height: .299, bezel: .008, pixels: 1920 },
    eye: { x: 0, y: 0, z: .45 },
    measuredChord: 0,
    near: .005, far: 10
  };
  // Acceptance thresholds. The first three are float-noise limits on the maths;
  // the physical ones live in CALIBRATION.md and are measured with a ruler.
  const TOLERANCE = { matrixMm: 1e-6, seamMm: 1e-6, driftMm: 1e-6, lawMm: 1e-6, scaleRatio: .01 };

  function setup(overrides) {
    const o = overrides || {};
    return Object.assign({}, DEFAULT_SETUP, o, {
      left: Object.assign({}, DEFAULT_SETUP.left, o.left),
      right: Object.assign({}, DEFAULT_SETUP.right, o.right),
      eye: Object.assign({}, DEFAULT_SETUP.eye, o.eye)
    });
  }
  function eyeOf(config) { return [config.eye.x, config.eye.y, config.eye.z]; }

  /* Two panels meeting at the hinge, each described by three physical corners in
     the one shared world frame: pa = lower-left, pb = lower-right, pc = upper-left
     as the seated viewer sees that panel. u therefore runs left-to-right across
     the pair: left outer edge -> seam -> right outer edge. */
  function screens(config) {
    const c = setup(config);
    const half = c.angleDeg*Math.PI/360;
    const direction = { left: [-Math.sin(half), 0, Math.cos(half)], right: [Math.sin(half), 0, Math.cos(half)] };
    return ['left', 'right'].map(name => {
      const panel = c[name], out = direction[name];
      const inner = mul(out, panel.bezel), outer = mul(out, panel.bezel + panel.width);
      const low = [0, -panel.height/2, 0], high = [0, panel.height/2, 0];
      const first = name === 'left' ? outer : inner, second = name === 'left' ? inner : outer;
      return { name, width: panel.width, height: panel.height, bezel: panel.bezel, pixels: panel.pixels,
        outward: out, pa: add(first, low), pb: add(second, low), pc: add(first, high) };
    });
  }
  function basis(screen) {
    const right = sub(screen.pb, screen.pa), up = sub(screen.pc, screen.pa);
    const width = length(right), height = length(up);
    const r = mul(right, 1/width), u = mul(up, 1/height);
    return { origin: screen.pa, right: r, up: u, normal: unit(cross(r, u)), width, height };
  }
  function uvToWorld(screen, u, v) {
    const b = basis(screen);
    return add(b.origin, add(mul(b.right, u*b.width), mul(b.up, v*b.height)));
  }
  /* Ground truth: where the line eye->point crosses this panel's plane.
     Everything the renderer does must reproduce this, to float precision. */
  function worldToUV(screen, eye, point) {
    const b = basis(screen), toPoint = sub(point, eye);
    const denominator = dot(b.normal, toPoint);
    if (Math.abs(denominator) < 1e-12) return null;
    const t = dot(b.normal, sub(b.origin, eye))/denominator;
    const hit = add(eye, mul(toPoint, t)), local = sub(hit, b.origin);
    const u = dot(local, b.right)/b.width, v = dot(local, b.up)/b.height;
    return { u, v, t, hit, visible: t > 0 && u >= 0 && u <= 1 && v >= 0 && v <= 1 };
  }
  // Signed distance of the eye in front of a panel plane; must stay positive.
  function standoff(screen, eye) { const b = basis(screen); return dot(b.normal, sub(eye, b.origin)); }
  // Signed depth of a point relative to a panel plane; + is toward the viewer.
  function planeDepth(screen, point) { const b = basis(screen); return dot(b.normal, sub(point, b.origin)); }

  function frustum(screen, eye, near) {
    const b = basis(screen);
    const va = sub(screen.pa, eye), vb = sub(screen.pb, eye), vc = sub(screen.pc, eye);
    const distance = -dot(b.normal, va);
    return { left: dot(b.right, va)*near/distance, right: dot(b.right, vb)*near/distance,
      bottom: dot(b.up, va)*near/distance, top: dot(b.up, vc)*near/distance, distance };
  }
  /* Column-major 4x4s, laid out exactly like Three.js Matrix4 so the page can hand
     them straight to a camera. The page renders with these very matrices, so the
     checks below cannot drift away from what is drawn. */
  function matrices(screen, eye, near, far) {
    const b = basis(screen), f = frustum(screen, eye, near);
    const x = 2*near/(f.right-f.left), y = 2*near/(f.top-f.bottom);
    const a = (f.right+f.left)/(f.right-f.left), c = (f.top+f.bottom)/(f.top-f.bottom);
    const d = -(far+near)/(far-near), e = -2*far*near/(far-near);
    const proj = [x,0,0,0, 0,y,0,0, a,c,d,-1, 0,0,e,0];
    const axes = [b.right, b.up, b.normal];
    const view = [
      axes[0][0], axes[1][0], axes[2][0], 0,
      axes[0][1], axes[1][1], axes[2][1], 0,
      axes[0][2], axes[1][2], axes[2][2], 0,
      -dot(axes[0], eye), -dot(axes[1], eye), -dot(axes[2], eye), 1
    ];
    return { view, proj, frustum: f };
  }
  // The same point pushed through the matrices the renderer uses.
  function projectViaMatrix(screen, eye, point, near, far) {
    const m = matrices(screen, eye, near || DEFAULT_SETUP.near, far || DEFAULT_SETUP.far);
    const b = basis(screen), rel = sub(point, eye);
    const camera = [dot(b.right, rel), dot(b.up, rel), dot(b.normal, rel)];
    const w = -camera[2];
    if (Math.abs(w) < 1e-12) return null;
    const ndcX = (m.proj[0]*camera[0] + m.proj[8]*camera[2])/w;
    const ndcY = (m.proj[5]*camera[1] + m.proj[9]*camera[2])/w;
    return { u: (ndcX+1)/2, v: (ndcY+1)/2, w };
  }

  const PROBE_POINTS = (() => {
    const points = [];
    for (const x of [-.4,-.12,0,.12,.4]) for (const y of [-.2,0,.2]) for (const z of [-.8,-.3,-.05,.08,.2]) points.push([x,y,z]);
    return points;
  })();
  const EYE_SWEEP = (() => {
    const eyes = [];
    for (const x of [-.09,0,.09]) for (const y of [-.07,0,.07]) for (const z of [.35,.45,.6]) eyes.push([x,y,z]);
    return eyes;
  })();

  /* 1. The rendered matrices must agree with the ray/plane ground truth. */
  function checkMatrixAgreement(config) {
    const c = setup(config), panels = screens(c);
    let worst = 0, where = null, count = 0;
    for (const screen of panels) for (const eye of EYE_SWEEP) for (const point of PROBE_POINTS) {
      const truth = worldToUV(screen, eye, point);
      if (!truth || truth.t <= 0) continue;
      const drawn = projectViaMatrix(screen, eye, point, c.near, c.far);
      if (!drawn) continue;
      const mm = Math.max(Math.abs(truth.u-drawn.u)*screen.width, Math.abs(truth.v-drawn.v)*screen.height)*1000;
      if (mm > worst) { worst = mm; where = { screen: screen.name, eye, point }; }
      count++;
    }
    return { id: 'matrix', label: 'Off-axis matrices reproduce the eye->point->panel ray',
      value: worst, units: 'mm', samples: count, where, pass: worst <= TOLERANCE.matrixMm };
  }

  /* 2. Seam registration. Any point in the plane through the eye and the hinge
     projects onto the hinge line itself on BOTH panels — one world point, so the
     two images are one continuous world across the corner. Exact by construction;
     it breaks the moment a panel size, the angle or the seam position is wrong. */
  function checkSeamRegistration(config) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c);
    let worst = 0, worstU = 0, count = 0;
    for (const depth of [-1.2,-.6,-.25,-.05,.1,.25]) for (const height of [-.25,0,.25]) {
      // Points of the plane that contains the eye and the hinge line:
      // P = s*(eye.x, 0, eye.z) + (0, t, 0), with s chosen to reach this depth.
      if (Math.abs(eye[2]) < 1e-9) continue;
      const point = [eye[0]*depth/eye[2], height, depth];
      const hits = panels.map(screen => worldToUV(screen, eye, point));
      if (hits.some(hit => !hit)) continue;
      worst = Math.max(worst, length(sub(hits[0].hit, hits[1].hit))*1000);
      // The hinge sits just past each panel's inner edge, by exactly its bezel.
      worstU = Math.max(worstU,
        Math.abs(hits[0].u - (1 + panels[0].bezel/panels[0].width))*panels[0].width*1000,
        Math.abs(hits[1].u - (-panels[1].bezel/panels[1].width))*panels[1].width*1000);
      count++;
    }
    return { id: 'seam', label: 'Seam-plane points land on one shared hinge point on both panels',
      value: Math.max(worst, worstU), units: 'mm', samples: count, pass: Math.max(worst, worstU) <= TOLERANCE.seamMm };
  }

  /* 3. Zero parallax. A mark drawn exactly on a panel plane must stay pinned to the
     same physical spot on the glass for every eye position. This is the one test
     you can also run with your eyes and a strip of tape: drift or no drift. */
  function checkZeroParallax(config) {
    const c = setup(config), panels = screens(c);
    let worst = 0, count = 0;
    for (const screen of panels) for (const u of [.15,.5,.85]) for (const v of [.15,.5,.85]) {
      const point = uvToWorld(screen, u, v);
      for (const eye of EYE_SWEEP) {
        const drawn = projectViaMatrix(screen, eye, point, c.near, c.far);
        if (!drawn) continue;
        worst = Math.max(worst, Math.abs(drawn.u-u)*screen.width*1000, Math.abs(drawn.v-v)*screen.height*1000);
        count++;
      }
    }
    return { id: 'anchor', label: 'Screen-plane anchors do not move when the eye moves',
      value: worst, units: 'mm', samples: count, pass: worst <= TOLERANCE.driftMm };
  }

  /* 4. The parallax law. For an eye translation delta parallel to a panel plane,
     the image of a point at plane-depth dp must slide along the glass by exactly
     delta * dp/(dp - h), h being the eye's standoff from that plane. Vertical
     motion is parallel to BOTH panels at any corner angle, which is why the
     physical protocol measures parallax by moving the head up and down. */
  function parallaxGain(screen, eye, point) {
    const dp = planeDepth(screen, point), h = standoff(screen, eye);
    return Math.abs(dp-h) < 1e-12 ? Infinity : dp/(dp-h);
  }
  function checkParallaxLaw(config, step) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c), move = step || .06;
    let worst = 0, count = 0;
    for (const screen of panels) {
      const b = basis(screen);
      for (const direction of [[0,1,0], b.right]) {
        for (const depth of [-.6,-.25,-.08,0,.06,.12]) {
          const point = add(uvToWorld(screen, .5, .5), mul(b.normal, depth));
          const shifted = add(eye, mul(direction, move));
          const before = projectViaMatrix(screen, eye, point, c.near, c.far);
          const after = projectViaMatrix(screen, shifted, point, c.near, c.far);
          if (!before || !after) continue;
          const measured = [(after.u-before.u)*screen.width, (after.v-before.v)*screen.height];
          const predicted = parallaxGain(screen, eye, point)*move;
          const expected = [dot(direction, b.right)*predicted, dot(direction, b.up)*predicted];
          worst = Math.max(worst, Math.abs(measured[0]-expected[0])*1000, Math.abs(measured[1]-expected[1])*1000);
          count++;
        }
      }
    }
    return { id: 'parallax', label: 'On-glass motion matches delta x depth/(depth - standoff)',
      value: worst, units: 'mm', samples: count, pass: worst <= TOLERANCE.lawMm };
  }

  /* 5. No world point may be drawn on both panels. Duplicated content across the
     corner is the classic "two independent windows" artefact. */
  function checkDoubleCoverage(config) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c);
    let duplicated = 0, counted = 0, example = null;
    for (const point of PROBE_POINTS) {
      const hits = panels.map(screen => worldToUV(screen, eye, point));
      if (hits.some(hit => !hit)) continue;
      counted++;
      if (hits[0].visible && hits[1].visible) { duplicated++; example = example || point; }
    }
    return { id: 'coverage', label: 'No world point is drawn on both panels',
      value: duplicated, units: 'points', samples: counted, where: example, pass: duplicated === 0 };
  }

  /* 6. Pixel scale. Even with perfect geometry a line crossing the seam kinks if
     the two panels differ in millimetres per pixel, or if the spanning window is
     split anywhere other than at the real pixel boundary. */
  function checkPixelScale(config) {
    const c = setup(config), panels = screens(c);
    const scales = panels.map(screen => screen.width*1000/screen.pixels);
    const ratio = Math.abs(scales[0]/scales[1] - 1);
    return { id: 'scale', label: 'Both panels resolve the same millimetres per pixel',
      value: ratio*100, units: '%', detail: { mmPerPixel: scales, splitFraction: panels[0].pixels/(panels[0].pixels+panels[1].pixels) },
      pass: ratio <= TOLERANCE.scaleRatio };
  }

  /* 7. The eye must stay in front of both panel planes, or a panel is being viewed
     from behind and its projection is meaningless. */
  function checkEyePlacement(config, margin) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c), limit = margin === undefined ? .03 : margin;
    const standoffs = panels.map(screen => standoff(screen, eye));
    const worst = Math.min.apply(null, standoffs);
    return { id: 'eye', label: 'Eye is in front of both panel planes',
      value: worst*1000, units: 'mm', detail: { standoffMm: standoffs.map(s => s*1000),
        hingeDistanceMm: Math.hypot(eye[0], eye[2])*1000, lateralOffsetMm: eye[0]*1000, heightOffsetMm: eye[1]*1000 },
      pass: worst >= limit };
  }

  /* How much world content the two bezels hide, at a plane `depth` metres from the
     hinge along the bisector. Zero-bezel setups hide nothing; everything else hides
     a wedge, and the cube WILL look cut by this much. That is correct, not an error
     to be dialled out with a seam-overlap slider. */
  function seamGap(config, depth) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c);
    const edges = [uvToWorld(panels[0], 1, .5), uvToWorld(panels[1], 0, .5)];
    const points = edges.map(edge => {
      const direction = sub(edge, eye);
      if (Math.abs(direction[2]) < 1e-9) return null;
      return add(eye, mul(direction, (depth-eye[2])/direction[2]));
    });
    return points[0] && points[1] ? length(sub(points[0], points[1])) : null;
  }

  /* Physical positions of the on-glass anchors, for the ruler test: distance from
     each panel's inner (seam) edge and from its bottom edge, in millimetres. */
  function anchors(config) {
    return screens(config).map(screen => ({
      name: screen.name,
      marks: [[.1,.1],[.1,.9],[.9,.1],[.9,.9],[.5,.5]].map(([u,v]) => ({
        u, v, world: uvToWorld(screen, u, v),
        fromSeamMm: (screen.name === 'left' ? (1-u) : u)*screen.width*1000,
        fromBottomMm: v*screen.height*1000
      }))
    }));
  }

  /* Predicted, measurable numbers for the physical protocol. A vertical head move
     is parallel to both panels, so one gain describes both. */
  function predictions(config, step) {
    const c = setup(config), panels = screens(c), eye = eyeOf(c), move = step || .06;
    const depths = [-.8,-.4,-.2,-.1,0,.06,.12];
    return {
      headMoveMm: move*1000,
      probes: depths.map(depth => {
        const point = [0, 0, depth];
        const gains = panels.map(screen => parallaxGain(screen, eye, point));
        return { seamDepthMm: depth*1000, gain: gains[0],
          verticalShiftMm: gains.map(gain => gain*move*1000), matched: Math.abs(gains[0]-gains[1]) < 1e-9 };
      }),
      seamGapMm: depths.map(depth => ({ seamDepthMm: depth*1000, hiddenWidthMm: (seamGap(c, depth) || 0)*1000 })),
      splitFraction: panels[0].pixels/(panels[0].pixels+panels[1].pixels),
      anchors: anchors(c)
    };
  }


  /* Measurement cross-check. Every test above verifies the maths against itself,
     so none of them can notice that the numbers you typed do not match the room.
     One extra tape measurement closes that gap: the straight-line distance between
     the two OUTER active-area edges depends on the corner angle, so it recovers the
     angle the hardware actually has. chord^2 = a^2 + b^2 - 2ab cos(angle). */
  function impliedAngleDeg(config, chord) {
    const c = setup(config);
    const a = c.left.bezel + c.left.width, b = c.right.bezel + c.right.width;
    const cosine = (a*a + b*b - chord*chord)/(2*a*b);
    return Math.abs(cosine) > 1 ? null : Math.acos(cosine)*180/Math.PI;
  }
  function predictedChord(config) {
    const c = setup(config);
    const a = c.left.bezel + c.left.width, b = c.right.bezel + c.right.width;
    return Math.sqrt(a*a + b*b - 2*a*b*Math.cos(c.angleDeg*Math.PI/180));
  }
  function checkCornerAngle(config, chord, toleranceDeg) {
    const c = setup(config), limit = toleranceDeg === undefined ? 1 : toleranceDeg;
    if (!(chord > 0)) return { id: 'angle', label: 'Measured corner angle matches the entered angle',
      value: null, units: 'deg', pass: null, detail: { predictedChordMm: predictedChord(c)*1000 } };
    const implied = impliedAngleDeg(c, chord);
    const error = implied === null ? Infinity : Math.abs(implied - c.angleDeg);
    return { id: 'angle', label: 'Measured corner angle matches the entered angle',
      value: error, units: 'deg', pass: error <= limit,
      detail: { impliedAngleDeg: implied, predictedChordMm: predictedChord(c)*1000, measuredChordMm: chord*1000 } };
  }


  /* ---- how wrong is a wrong measurement? --------------------------------
     Every check above compares the model with itself, so none of them notices
     that the numbers you typed differ from the room. This does: it renders with
     the model you entered, puts the resulting pixel where the REAL panel would
     emit it, and measures the angle between where the viewer then sees the
     object and where it should have been. Angles, not millimetres on the glass,
     because the angle is what the eye actually receives.

     The output is what sets the measuring tolerances: a parameter whose 2 mm
     error costs 0.05 deg does not deserve a second trip with the ruler, and one
     that costs 0.5 deg does. */
  const ERROR_POINTS = (() => {
    const points = [];
    for (const x of [-.35,-.15,0,.15,.35]) for (const y of [-.12,0,.12]) for (const z of [-1.2,-.6,-.2,-.05,.06,.12]) points.push([x,y,z]);
    return points;
  })();
  function misalignment(truth, model, options) {
    const stretch = (options && options.stretch) || [0, 0];
    const trueScreens = screens(truth), modelScreens = screens(model);
    const trueEye = eyeOf(setup(truth)), modelEye = eyeOf(setup(model));
    let maxAngle = 0, where = null, samples = 0;
    for (let index = 0; index < 2; index++) {
      for (const point of ERROR_POINTS) {
        const computed = worldToUV(modelScreens[index], modelEye, point);
        if (!computed || !computed.visible) continue;
        samples++;
        // A mis-split spanning window stretches each image away from its outer edge.
        const e = stretch[index] || 0;
        const u = index === 0 ? computed.u*(1+e) : 1 - (1-computed.u)*(1+e);
        const lit = uvToWorld(trueScreens[index], u, computed.v);
        const seen = unit(sub(lit, trueEye)), wanted = unit(sub(point, trueEye));
        // atan2 of the cross product stays conditioned near zero, where acos does not.
        const angle = Math.atan2(length(cross(seen, wanted)), dot(seen, wanted));
        if (angle > maxAngle) { maxAngle = angle; where = { panel: trueScreens[index].name, point, distance: length(sub(point, trueEye)) }; }
      }
    }
    return { degrees: maxAngle*180/Math.PI, arcminutes: maxAngle*10800/Math.PI,
      apparentErrorMm: where ? maxAngle*where.distance*1000 : 0, where, samples };
  }

  /* A single worst angle hides the difference between two very different faults.
     Shifting the WHOLE world a little is benign — the viewer simply sees the
     replica a few millimetres off. Shifting the two panels by DIFFERENT amounts
     is fatal: the corner steps, and the scene reads as two windows again.
     This measures only the differential part: the step a straight line takes as
     it crosses the seam, in arcminutes, next to human vernier acuity (~1'). */
  function seamStep(truth, model, options) {
    const stretch = (options && options.stretch) || [0, 0];
    const offset = (options && options.offset) || .015;
    const trueScreens = screens(truth), modelScreens = screens(model);
    const trueEye = eyeOf(setup(truth)), modelEye = eyeOf(setup(model));
    const errorAt = (point, index) => {
      const computed = worldToUV(modelScreens[index], modelEye, point);
      if (!computed || !computed.visible) return null;
      const e = stretch[index] || 0;
      const u = index === 0 ? computed.u*(1+e) : 1 - (1-computed.u)*(1+e);
      const lit = uvToWorld(trueScreens[index], u, computed.v);
      const seen = unit(sub(lit, trueEye)), wanted = unit(sub(point, trueEye));
      return sub(seen, wanted);
    };
    let worst = 0, where = null, samples = 0;
    for (const depth of [-1.2, -.6, -.2, -.05]) for (const height of [-.1, 0, .1]) {
      const seam = Math.abs(modelEye[2]) < 1e-9 ? 0 : modelEye[0]*depth/modelEye[2];
      const left = errorAt([seam - offset, height, depth], 0);
      const right = errorAt([seam + offset, height, depth], 1);
      if (!left || !right) continue;
      samples++;
      const step = length(sub(left, right));
      if (step > worst) { worst = step; where = { depth, height }; }
    }
    return { degrees: worst*180/Math.PI, arcminutes: worst*10800/Math.PI, where, samples };
  }

  // Realistic single-parameter measurement slips, one at a time.
  const DEFAULT_DELTAS = [
    { id: 'left width +2 mm', build: c => ({ left: { width: c.left.width + .002 } }) },
    { id: 'left height +2 mm', build: c => ({ left: { height: c.left.height + .002 } }) },
    { id: 'left edge-to-hinge +2 mm', build: c => ({ left: { bezel: c.left.bezel + .002 } }) },
    { id: 'corner angle +1 deg', build: c => ({ angleDeg: c.angleDeg + 1 }) },
    { id: 'corner angle +3 deg', build: c => ({ angleDeg: c.angleDeg + 3 }) },
    { id: 'eye sideways +10 mm', build: c => ({ eye: { x: c.eye.x + .01 } }) },
    { id: 'eye height +10 mm', build: c => ({ eye: { y: c.eye.y + .01 } }) },
    { id: 'eye distance +20 mm', build: c => ({ eye: { z: c.eye.z + .02 } }) },
    { id: 'eye distance +50 mm', build: c => ({ eye: { z: c.eye.z + .05 } }) },
    { id: 'window split +0.5 %', stretch: [.005, .005] }
  ];
  function sensitivity(config, deltas) {
    const c = setup(config);
    return (deltas || DEFAULT_DELTAS).map(delta => {
      const truth = delta.build ? setup(Object.assign({}, c, deepen(c, delta.build(c)))) : c;
      const result = misalignment(truth, c, { stretch: delta.stretch });
      const step = seamStep(truth, c, { stretch: delta.stretch });
      return { id: delta.id, degrees: result.degrees, arcminutes: result.arcminutes,
        apparentErrorMm: result.apparentErrorMm, seamStepArcminutes: step.arcminutes, where: result.where };
    });
  }
  function deepen(base, patch) {
    const out = {};
    for (const key of Object.keys(patch)) {
      out[key] = patch[key] && typeof patch[key] === 'object' && !Array.isArray(patch[key])
        ? Object.assign({}, base[key], patch[key]) : patch[key];
    }
    return out;
  }

  function runAll(config, options) {
    const c = setup(config), step = (options && options.step) || .06;
    const checks = [checkEyePlacement(c), checkMatrixAgreement(c), checkSeamRegistration(c),
      checkZeroParallax(c), checkParallaxLaw(c, step), checkDoubleCoverage(c), checkPixelScale(c),
      checkCornerAngle(c, c.measuredChord)];
    return { setup: c, checks, predictions: predictions(c, step), pass: checks.every(check => check.pass !== false) };
  }

  root.CalibrationVerify = { DEFAULT_SETUP, TOLERANCE, setup, eyeOf, screens, basis, uvToWorld, worldToUV,
    standoff, planeDepth, frustum, matrices, projectViaMatrix, parallaxGain, seamGap, anchors, predictions,
    checkMatrixAgreement, checkSeamRegistration, checkZeroParallax, checkParallaxLaw, checkDoubleCoverage,
    checkPixelScale, checkEyePlacement, checkCornerAngle, impliedAngleDeg, predictedChord,
    misalignment, seamStep, sensitivity, DEFAULT_DELTAS, runAll };
})(typeof window === 'undefined' ? globalThis : window);
