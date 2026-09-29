/* Debug mini-view (UX §5.1): to-scale top and side views drawn on a canvas. */
(function (root) {
  const COLORS = { left: '#4fb3bf', right: '#a58bd8', eye: '#edc58d', camera: '#6fa8ff',
    room: '#56606e', panda: '#f5f2e9', grid: '#1b2530', text: '#aebfc7', warn: '#ff6b6b' };
  function cameraAxes(pose) {
    const yaw = pose.yaw*Math.PI/180, tilt = pose.tilt*Math.PI/180;
    return { yaw, tilt };
  }
  // Fit a set of 2D points into a rect, preserving aspect (to scale).
  function fitter(points, rect, pad = 14) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [a, b] of points) { minA = Math.min(minA, a); maxA = Math.max(maxA, a); minB = Math.min(minB, b); maxB = Math.max(maxB, b); }
    const spanA = Math.max(maxA-minA, .05), spanB = Math.max(maxB-minB, .05);
    const scale = Math.min((rect.w-2*pad)/spanA, (rect.h-2*pad-12)/spanB);
    const offA = rect.x+(rect.w-spanA*scale)/2, offB = rect.y+12+(rect.h-12-spanB*scale)/2;
    return { scale, map: (a, b) => [offA+(a-minA)*scale, offB+(b-minB)*scale] };
  }
  function line(ctx, p, q, color, width = 1, dash = []) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(ctx, p, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI*2); ctx.fill(); }
  function label(ctx, text, rect) {
    ctx.fillStyle = COLORS.text; ctx.font = '10px system-ui, sans-serif'; ctx.fillText(text, rect.x+6, rect.y+11);
  }
  function drawTop(ctx, rect, d) {
    const { pair, pose, eye, trail, room, panda } = d;
    // Top view: x to the right, z (toward the viewer) downward, so the room
    // is at the top of the panel and the viewer at the bottom.
    const pts = [...pair.flatMap(s => [[s.pa[0], s.pa[2]], [s.pb[0], s.pb[2]]]), [pose.x, pose.z]];
    if (eye) pts.push([eye.x, eye.z]);
    pts.push([0, panda.z-panda.radius], [0, -.1]);
    const { map, scale } = fitter(pts, rect);
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    label(ctx, 'TOP', rect);
    // Room outline and panda.
    ctx.strokeStyle = COLORS.room; ctx.lineWidth = 1;
    const r0 = map(room.left, room.back), r1 = map(room.right, room.front);
    ctx.strokeRect(r0[0], r0[1], r1[0]-r0[0], r1[1]-r0[1]);
    dot(ctx, map(0, panda.z), Math.max(2, panda.radius*scale), COLORS.panda);
    // Frusta from the eye to each lit area's edges.
    if (eye) {
      const e = map(eye.x, eye.z);
      pair.forEach(s => { const c = COLORS[s.name];
        line(ctx, e, map(s.pa[0], s.pa[2]), c+'99', 1, [3, 3]); line(ctx, e, map(s.pb[0], s.pb[2]), c+'99', 1, [3, 3]); });
    }
    // Screens (lit areas) — the gap is the break between them.
    pair.forEach(s => line(ctx, map(s.pa[0], s.pa[2]), map(s.pb[0], s.pb[2]), COLORS[s.name], 4));
    // Camera and horizontal view cone.
    const c = map(pose.x, pose.z), { yaw } = cameraAxes(pose), len = .25, half = pose.fov*Math.PI/360;
    for (const off of [-half, half]) line(ctx, c, map(pose.x+Math.sin(yaw+off)*len, pose.z+Math.cos(yaw+off)*len), COLORS.camera+'aa');
    dot(ctx, c, 4, COLORS.camera);
    // Eye trail and eye.
    trail.forEach((p, i) => dot(ctx, map(p.x, p.z), 1.5, COLORS.eye+(i < trail.length/2 ? '44' : '88')));
    if (eye) dot(ctx, map(eye.x, eye.z), 4, COLORS.eye);
    ctx.restore();
  }
  function drawSide(ctx, rect, d) {
    const { pair, pose, eye, trail, room, panda } = d;
    // Side view: a = z (toward viewer, right), b = -y (up is up).
    const pts = [...pair.flatMap(s => [[s.pa[2], -s.pa[1]], [s.pc[2], -s.pc[1]], [s.pb[2], -s.pb[1]]]), [pose.z, -pose.y], [-.1, 0]];
    if (eye) pts.push([eye.z, -eye.y]);
    const { map, scale } = fitter(pts, rect);
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
    label(ctx, 'SIDE', rect);
    line(ctx, map(room.back, -room.floor), map(room.front, -room.floor), COLORS.room);
    line(ctx, map(room.back, -room.floor), map(room.back, -room.ceiling), COLORS.room);
    dot(ctx, map(panda.z, 0), Math.max(2, panda.radius*scale), COLORS.panda);
    if (eye) {
      const e = map(eye.z, -eye.y);
      pair.forEach(s => { const cc = COLORS[s.name]+'99';
        line(ctx, e, map(s.pa[2], -s.pa[1]), cc, 1, [3, 3]); line(ctx, e, map(s.pc[2], -s.pc[1]), cc, 1, [3, 3]); });
    }
    // Each panel seen edge-on spans its depth range; draw its outer and inner edges.
    pair.forEach(s => {
      line(ctx, map(s.pa[2], -s.pa[1]), map(s.pc[2], -s.pc[1]), COLORS[s.name], 3);
      line(ctx, map(s.pb[2], -s.pb[1]), map(s.pb[2], -s.pc[1]), COLORS[s.name], 3);
    });
    const c = map(pose.z, -pose.y), tilt = pose.tilt*Math.PI/180;
    const vhalf = Math.atan(Math.tan(pose.fov*Math.PI/360)*9/16), len = .25;
    for (const off of [-vhalf, vhalf]) line(ctx, c, map(pose.z+Math.cos(tilt+off)*len, -(pose.y-Math.sin(tilt+off)*len)), COLORS.camera+'aa');
    dot(ctx, c, 4, COLORS.camera);
    trail.forEach((p, i) => dot(ctx, map(p.z, -p.y), 1.5, COLORS.eye+(i < trail.length/2 ? '44' : '88')));
    if (eye) dot(ctx, map(eye.z, -eye.y), 4, COLORS.eye);
    ctx.restore();
  }
  // mode: 'both' | 'top' | 'side'
  function draw(canvas, d, mode = 'both') {
    const dpr = root.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) { canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#091118'; ctx.fillRect(0, 0, w, h);
    const rects = mode === 'both' ? [{ x: 0, y: 0, w, h: h*.55 }, { x: 0, y: h*.55, w, h: h*.45 }] : [{ x: 0, y: 0, w, h }];
    if (mode !== 'side') drawTop(ctx, rects[0], d);
    if (mode !== 'top') drawSide(ctx, mode === 'both' ? rects[1] : rects[0], d);
    if (mode === 'both') line(ctx, [0, h*.55], [w, h*.55], COLORS.grid);
  }
  root.RoomMiniView = { draw, COLORS };
})(typeof window === 'undefined' ? globalThis : window);
