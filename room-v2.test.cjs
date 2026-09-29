// v2 checks: adjustable screen-pair geometry, angle helper and saved profile.
// Run with: node room-v2.test.cjs
const assert = require('node:assert/strict');
require('./concave-geometry.js');
require('./room-profile.js');
const G = globalThis.ConcaveGeometry, P = globalThis.RoomProfile;
const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a-b) < tol, `${msg}: ${a} vs ${b}`);
const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);

// 1. The explicit 90°/0-gap path matches the general formula.
const legacy = G.screens(.336, .598);
const general = G.screens(.336, .598, { angle: 90, gap: 1e-12 });
legacy.forEach((s, i) => ['pa','pb','pc'].forEach(k => s[k].forEach((v, j) => close(v, general[i][k][j], 1e-9, `90° ${s.name}.${k}`))));

let count = 0;
for (const angle of [60, 75, 90, 105, 120, 150, 179, 180]) for (const gap of [0, .005, .015, .04]) for (const vOffset of [-.02, 0, .03]) {
  const width = .336, height = .598, [l, r] = G.screens(width, height, { angle, gap, vOffset });
  // 2. Panel sizes are exact.
  close(dist(l.pa, l.pb), width, 1e-9, 'left width'); close(dist(r.pa, r.pb), width, 1e-9, 'right width');
  close(dist(l.pa, l.pc), height, 1e-9, 'left height'); close(dist(r.pa, r.pc), height, 1e-9, 'right height');
  // 3. Straight gap between inner lit edges (horizontal) equals `gap`.
  close(Math.hypot(l.pb[0]-r.pa[0], l.pb[2]-r.pa[2]), gap, 1e-9, 'gap');
  // 4. Inside angle between the panels' display directions.
  const dl = [l.pa[0]-l.pb[0], l.pa[2]-l.pb[2]], dr = [r.pb[0]-r.pa[0], r.pb[2]-r.pa[2]];
  const cos = (dl[0]*dr[0]+dl[1]*dr[1])/(Math.hypot(...dl)*Math.hypot(...dr));
  close(Math.acos(Math.max(-1, Math.min(1, cos)))*180/Math.PI, angle, 1e-6, 'inside angle');
  // 5. Vertical offset: right minus left bottom edge.
  close(r.pa[1]-l.pb[1], vOffset, 1e-12, 'vertical offset');
  // 6. Symmetry about the seam and the viewer side is in front of both planes.
  close(l.pb[0], -r.pa[0], 1e-12, 'symmetry');
  assert.ok(G.inFront({ x: 0, y: 0, z: .8 }, [l, r], .03), 'centred viewer in front');
  assert.ok(!G.inFront({ x: 0, y: 0, z: -.2 }, [l, r], 0), 'point behind the corner');
  // 7. Angle helper round-trip.
  const D = G.outerDistance(angle, width*100, gap*100);
  close(G.angleFromOuterDistance(D, width*100, gap*100), angle, 1e-6, 'angle helper');
  count++;
}
// 8. A flat 180°, 0-gap pair is one continuous wide screen.
const [fl, fr] = G.screens(.3, .5, { angle: 180, gap: 0 });
close(fl.pb[0], fr.pa[0], 1e-12, 'flat seam meets'); close(fl.pa[2], 0, 1e-12, 'flat z'); close(fr.pb[2], 0, 1e-12, 'flat z');
close(fr.pb[0]-fl.pa[0], .6, 1e-12, 'flat total width');
assert.ok(Number.isNaN(G.angleFromOuterDistance(1000, 33.6, 1)), 'impossible outer distance');
// 9. Off-axis projection at 120°: each panel corner projects to its NDC corner.
try {
  const THREE = require('three');
  const [l, r] = G.screens(.336, .598, { angle: 120, gap: .015, vOffset: .01 });
  for (const screen of [l, r]) {
    const camera = new THREE.PerspectiveCamera(), eye = new THREE.Vector3(.05, .02, .7);
    G.project(THREE, camera, screen, eye);
    const ndc = p => new THREE.Vector3(...p).project(camera);
    close(ndc(screen.pa).x, -1, 1e-6, 'pa x'); close(ndc(screen.pa).y, -1, 1e-6, 'pa y');
    close(ndc(screen.pb).x, 1, 1e-6, 'pb x'); close(ndc(screen.pc).y, 1, 1e-6, 'pc y');
  }
  console.log('PASS: off-axis projection maps 120° panel corners to viewport corners.');
} catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; console.log('SKIP: projection check (npm install three to enable).'); }
console.log(`PASS: ${count} angle/gap/offset geometry configurations, flat-pair continuity, angle helper.`);

// 10. Profile defaults, sanitizing and derived geometry.
const d = P.defaults();
assert.equal(d.screen.angle, 90); assert.equal(d.screen.width, 33.6); assert.equal(d.advanced.overlap, 0);
const s = P.sanitize({ screen: { angle: 120, gap: 'x', width: 9999, height: 50 }, trackingCamera: { tilt: 30 }, calibratedAt: '2026-09-29T10:00:00Z', evil: 1 });
assert.equal(s.screen.angle, 120); assert.equal(s.screen.gap, d.screen.gap); assert.equal(s.screen.width, d.screen.width);
assert.equal(s.screen.height, 50); assert.equal(s.trackingCamera.tilt, 30); assert.equal(s.evil, undefined);
assert.equal(P.sanitize(null).screen.angle, 90);
const g = P.geometry(s); close(g.width, .336, 1e-12, 'metres'); assert.equal(g.options.angle, 120);
const pose = P.cameraPose({ ...d, screen: { ...d.screen, vOffset: 2 } });
close(pose.y, (59.8/2+1+3)/100, 1e-12, 'camera height above the higher panel');
const memory = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
assert.equal(P.load(memory).saved, false);
assert.ok(P.save(memory, s)); assert.equal(P.load(memory).profile.screen.angle, 120);
memory.data[P.KEY] = '{broken'; assert.equal(P.load(memory).saved, false);
console.log('PASS: profile defaults, range sanitizing, save/load, camera pose.');
