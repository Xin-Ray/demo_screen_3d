/* Fixed-viewpoint calibration page: stages 1-9 of the two-monitor replica brief.
   One shared scene, one replica root, one manually placed eye, two off-axis
   projections. No webcam, no room, no seam-overlap slider — head tracking and
   scenery are only worth adding once the numbers below are right. */
(() => {
  'use strict';
  const V = window.CalibrationVerify;
  const $ = id => document.getElementById(id);
  const side = new URLSearchParams(location.search).get('view');
  const isDisplay = side === 'left' || side === 'right';
  const CHANNEL = 'calibrate-corner-3d';
  const COMB_DEPTHS = [-.4, -.2, -.1, 0, .06, .12];
  const COMB_COLORS = [0x5ea8ff, 0x76ddcd, 0xc6e84f, 0xffd166, 0xff9f5a, 0xff6b6b];

  const state = {
    angleDeg: 90,
    left: { width: .531, height: .299, bezel: .008, pixels: 1920 },
    right: { width: .531, height: .299, bezel: .008, pixels: 1920 },
    eye: { x: 0, y: 0, z: .45 },
    measuredChord: 0, near: .005, far: 10,
    target: 'cube', size: .12, replicaDepth: -.1,
    anchors: true, seamTicks: true, autoSplit: true, split: .5, sweep: 'off', linkPanels: true,
    referenceView: false, referenceFov: 60
  };
  let sweepOffset = { x: 0, y: 0, z: 0 };
  let channel, lastMessage = 0, liveBinding = 0, signature = '';

  if (!window.THREE) { $('status').textContent = 'Three.js did not load. Check the connection and reload.'; return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (error) { $('status').textContent = 'WebGL is unavailable. Enable hardware acceleration and reload.'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setScissorTest(true);
  $('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  // Stage 2/3 of the brief: every object lives once, under one root, in one frame.
  const replicaRoot = new THREE.Group(); replicaRoot.name = 'replicaRoot'; scene.add(replicaRoot);
  const replicaCenter = new THREE.Group(); replicaCenter.name = 'replicaCenter'; replicaRoot.add(replicaCenter);
  const worldTargets = new THREE.Group(); worldTargets.name = 'worldTargets'; replicaRoot.add(worldTargets);
  const anchorGroup = new THREE.Group(); anchorGroup.name = 'screenAnchors'; scene.add(anchorGroup);

  // Lambert shading, not MeshNormalMaterial: the two cameras differ by the corner
  // angle, so a view-space normal colours the same face differently on each panel
  // and fakes a kink at the seam. N·L is rotation invariant, so both panels agree.
  scene.add(new THREE.AmbientLight(0xffffff, .22));
  const keyLight = new THREE.DirectionalLight(0xffffff, .8);
  keyLight.position.set(-.5, .8, 1); scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x9fd8ff, .3);
  fillLight.position.set(.9, .1, .4); scene.add(fillLight);
  const solid = new THREE.MeshLambertMaterial({ color: 0x8fa8b6 });
  const edges = new THREE.LineBasicMaterial({ color: 0xffffff });
  const anchorLine = new THREE.LineBasicMaterial({ color: 0x35d9c0 });
  const seamLine = new THREE.LineBasicMaterial({ color: 0xffbc70 });
  const clear = group => {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse(node => node.geometry && node.geometry.dispose());
    }
  };
  const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || solid);

  function buildTargets() {
    clear(replicaCenter); clear(worldTargets);
    const s = state.size;
    if (state.target === 'cube') {
      const cube = box(s, s, s);
      cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), edges));
      replicaCenter.add(cube);
    } else if (state.target === 'sphere') {
      replicaCenter.add(new THREE.Mesh(new THREE.SphereGeometry(s/2, 40, 28), solid));
    } else if (state.target === 'rod') {
      // One straight bar through the corner: the classic seam-continuity target.
      const rod = box(s*4, s*.16, s*.16);
      rod.add(new THREE.LineSegments(new THREE.EdgesGeometry(rod.geometry), edges));
      replicaCenter.add(rod);
    } else if (state.target === 'robot') {
      const unit = s/1.8, figure = new THREE.Group();
      const limb = (w, h, d, x, y) => { const part = box(w, h, d); part.position.set(x, y, 0); figure.add(part); };
      limb(unit*.5, unit*.45, unit*.45, 0, unit*.78);
      limb(unit*.66, unit*.8, unit*.38, 0, unit*.15);
      for (const sign of [-1, 1]) {
        limb(unit*.18, unit*.62, unit*.18, sign*unit*.46, unit*.18);
        limb(unit*.22, unit*.7, unit*.22, sign*unit*.2, unit*-.6);
      }
      replicaCenter.add(figure);
    } else if (state.target === 'comb') {
      // Markers at known depths from the seam: each one has an exact, predicted
      // on-glass displacement for a measured head movement.
      COMB_DEPTHS.forEach((depth, index) => {
        const marker = box(.03, .03, .03, new THREE.MeshBasicMaterial({ color: COMB_COLORS[index] }));
        marker.position.set(index % 2 ? .09 : -.09, .09 - index*.036, depth);
        marker.add(new THREE.LineSegments(new THREE.EdgesGeometry(marker.geometry), edges));
        worldTargets.add(marker);
      });
    }
    replicaCenter.position.set(0, 0, state.replicaDepth);
  }

  function buildAnchors() {
    clear(anchorGroup);
    const screens = V.screens(state);
    for (const screen of screens) {
      const b = V.basis(screen);
      const at = (u, v) => new THREE.Vector3(...V.uvToWorld(screen, u, v));
      const outline = [], ticks = [];
      if (state.anchors) {
        // Drawn exactly on the glass, inset 2 mm so the border stays visible.
        const iu = .002/b.width, iv = .002/b.height;
        const corners = [[iu, iv], [1-iu, iv], [1-iu, 1-iv], [iu, 1-iv]];
        for (let i = 0; i < 4; i++) outline.push(at(...corners[i]), at(...corners[(i+1)%4]));
        for (const u of [.1, .5, .9]) for (const v of [.1, .5, .9]) {
          const au = .012/b.width, av = .012/b.height;
          outline.push(at(u-au, v), at(u+au, v), at(u, v-av), at(u, v+av));
        }
      }
      if (state.seamTicks) {
        const inner = screen.name === 'left' ? 1 : 0, direction = screen.name === 'left' ? -1 : 1;
        for (const v of [.2, .5, .8]) ticks.push(at(inner, v), at(inner + direction*.025/b.width, v));
      }
      if (outline.length) anchorGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(outline), anchorLine));
      if (ticks.length) anchorGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), seamLine));
    }
  }

  /* The reference view. Off-axis projection is defined by the property that the
     two panels reproduce, at the eye, the image of looking straight at the scene.
     So an ordinary perspective camera at the eye renders exactly what a camera
     placed there should photograph — the target for a real photograph, not
     another render to compare renders against. */
  const referenceCamera = new THREE.PerspectiveCamera(50, 1, .005, 20);
  const bezelMask = new THREE.Mesh(new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .92, side: THREE.DoubleSide }));
  bezelMask.name = 'bezel-mask'; bezelMask.visible = false; scene.add(bezelMask);
  function updateBezelMask() {
    const screens = V.screens(state);
    // The hidden wedge is bounded by the rays through the two inner edges, so a
    // quad on those four physical corners subtends exactly the hidden strip.
    const corners = [V.uvToWorld(screens[0], 1, 0), V.uvToWorld(screens[0], 1, 1),
      V.uvToWorld(screens[1], 0, 0), V.uvToWorld(screens[1], 0, 1)];
    const points = [corners[0], corners[1], corners[2], corners[1], corners[3], corners[2]]
      .map(point => new THREE.Vector3(...point));
    bezelMask.geometry.dispose();
    bezelMask.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }
  function renderReference(eye) {
    const aspect = innerWidth/innerHeight;
    const horizontal = state.referenceFov*Math.PI/180;
    referenceCamera.fov = 2*Math.atan(Math.tan(horizontal/2)/aspect)*180/Math.PI;
    referenceCamera.aspect = aspect;
    referenceCamera.updateProjectionMatrix();
    referenceCamera.position.set(eye.x, eye.y, eye.z);
    referenceCamera.lookAt(0, eye.y, -1);
    bezelMask.visible = true;
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.setScissor(0, 0, innerWidth, innerHeight);
    renderer.render(scene, referenceCamera);
    bezelMask.visible = false;
  }
  const basisMatrix = new THREE.Matrix4();
  // The renderer is driven by the very matrices the verifier checks.
  function applyCamera(camera, screen, eye) {
    const b = V.basis(screen);
    const matrices = V.matrices(screen, [eye.x, eye.y, eye.z], state.near, state.far);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.quaternion.setFromRotationMatrix(basisMatrix.makeBasis(
      new THREE.Vector3(...b.right), new THREE.Vector3(...b.up), new THREE.Vector3(...b.normal)));
    camera.updateMatrixWorld(true);
    camera.projectionMatrix.fromArray(matrices.proj);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    let worst = 0;
    for (let i = 0; i < 16; i++) {
      worst = Math.max(worst, Math.abs(camera.projectionMatrix.elements[i] - matrices.proj[i]),
        Math.abs(camera.matrixWorldInverse.elements[i] - matrices.view[i]));
    }
    return worst;
  }

  const splitFraction = () => state.autoSplit ? state.left.pixels/(state.left.pixels + state.right.pixels) : state.split;
  const renderEye = () => ({ x: state.eye.x + sweepOffset.x, y: state.eye.y + sweepOffset.y, z: state.eye.z + sweepOffset.z });

  function updateSweep(now) {
    if (isDisplay) return;
    const phase = Math.sin(now/1400)*.06;
    sweepOffset = { x: state.sweep === 'horizontal' ? phase : 0, y: state.sweep === 'vertical' ? phase : 0, z: 0 };
  }

  /* ---- verification panel ---------------------------------------------- */
  function format(value, units) {
    if (value === null || value === undefined || !isFinite(value)) return '—';
    if (units === 'points') return String(value);
    if (value !== 0 && Math.abs(value) < 1e-4) return `${value.toExponential(1)} ${units}`;
    return `${value.toFixed(Math.abs(value) < 10 ? 3 : 1)} ${units}`;
  }
  function viewportCheck() {
    const fraction = splitFraction(), screens = V.screens(state);
    let worst = 0;
    for (let i = 0; i < 2; i++) {
      if (isDisplay && i !== (side === 'left' ? 0 : 1)) continue;
      const width = isDisplay ? innerWidth : Math.round(innerWidth*(i === 0 ? fraction : 1-fraction));
      const rendered = width/innerHeight, physical = screens[i].width/screens[i].height;
      worst = Math.max(worst, Math.abs(rendered/physical - 1));
    }
    return { id: 'viewport', label: 'Viewport aspect matches the panel aspect (no stretch)',
      value: worst*100, units: '%', pass: worst <= .01 };
  }
  const scratch = new THREE.PerspectiveCamera();
  function bindingCheck() {
    // Re-derive the cameras here as well, so the claim holds even before a frame
    // has been drawn: what the verifier checks is what the renderer is handed.
    const eye = renderEye();
    let worst = liveBinding;
    for (const screen of V.screens(state)) worst = Math.max(worst, applyCamera(scratch, screen, eye));
    return { id: 'binding', label: 'Renderer uses the verified matrices, unmodified',
      value: worst, units: '', pass: worst <= 1e-9 };
  }
  function renderChecks(checks) {
    $('checks').innerHTML = checks.map(check => {
      const flag = check.pass === null ? 'skip' : check.pass ? 'pass' : 'fail';
      const word = check.pass === null ? 'SKIP' : check.pass ? 'PASS' : 'FAIL';
      return `<div class="row ${flag}"><span class="flag">${word}</span><b>${check.label}</b>` +
        `<span class="value">${format(check.value, check.units)}</span></div>`;
    }).join('');
  }
  function renderPredictions(report) {
    const screens = V.screens(state), eye = V.eyeOf(state), move = .06;
    const rule = screens.map(screen => {
      const cells = [.1, .5, .9].map(u => ((screen.name === 'left' ? 1-u : u)*screen.width*1000).toFixed(0)).join(' · ');
      const heights = [.1, .5, .9].map(v => (v*screen.height*1000).toFixed(0)).join(' · ');
      return `<tr><td>${screen.name}</td><td class="n">${cells}</td><td class="n">${heights}</td></tr>`;
    }).join('');
    const rows = COMB_DEPTHS.map((depth, index) => {
      const point = [index % 2 ? .09 : -.09, .09 - index*.036, depth];
      const hit = screens.map(screen => V.worldToUV(screen, eye, point));
      const which = hit[0] && hit[0].visible ? 0 : hit[1] && hit[1].visible ? 1 : null;
      const gain = which === null ? null : V.parallaxGain(screens[which], eye, point);
      return `<tr><td><span style="color:#${COMB_COLORS[index].toString(16).padStart(6,'0')}">■</span> ${(depth*100).toFixed(0)} cm</td>` +
        `<td>${which === null ? 'off-panel' : screens[which].name}</td>` +
        `<td class="n">${gain === null ? '—' : gain.toFixed(3)}</td>` +
        `<td class="n">${gain === null ? '—' : (gain*move*1000).toFixed(1)} mm</td></tr>`;
    }).join('');
    const hidden = V.seamGap(state, state.replicaDepth);
    const sensitivity = V.sensitivity(state).sort((a, b) => b.seamStepArcminutes - a.seamStepArcminutes)
      .map(row => `<tr><td>${row.id}</td><td class="n">${row.arcminutes.toFixed(1)}'</td>` +
        `<td class="n" style="color:${row.seamStepArcminutes > 2 ? '#ff8c6b' : '#76ddcd'}">${row.seamStepArcminutes.toFixed(1)}'</td></tr>`).join('');
    $('predictions').innerHTML =
      `<h4>Ruler check · cross positions</h4><table><tr><th>panel</th><th class="n">mm from seam edge</th><th class="n">mm from bottom</th></tr>${rule}</table>` +
      `<h4>Parallax · 60 mm head rise</h4><table><tr><th>depth</th><th>panel</th><th class="n">gain</th><th class="n">on glass</th></tr>${rows}</table>` +
      `<h4>Expected seam behaviour</h4><table>` +
      `<tr><td>Hidden behind bezels at replica depth</td><td class="n">${hidden === null ? '—' : (hidden*1000).toFixed(1)} mm</td></tr>` +
      `<tr><td>Window split at pixel boundary</td><td class="n">${(report.predictions.splitFraction*100).toFixed(2)} %</td></tr>` +
      `<tr><td>Predicted tape chord, outer to outer</td><td class="n">${(V.predictedChord(state)*100).toFixed(2)} cm</td></tr>` +
      `</table>` +
      `<h4>What a measuring slip costs</h4><table><tr><th>if this is wrong by…</th><th class="n">whole scene</th><th class="n">seam step</th></tr>${sensitivity}</table>` +
      `<p class="hint">Whole-scene error shifts the replica and is forgiving. The seam step is the differential part — the corner visibly breaks above about 2′, human vernier acuity. Fix the red rows first.</p>`;
  }
  function refresh() {
    const next = JSON.stringify([state.angleDeg, state.left, state.right, state.target, state.size,
      state.replicaDepth, state.anchors, state.seamTicks]);
    if (next !== signature) { signature = next; buildAnchors(); buildTargets(); updateBezelMask(); }
    if (isDisplay) return;
    const report = V.runAll(state);
    const checks = report.checks.concat([viewportCheck(), bindingCheck()]);
    renderChecks(checks);
    renderPredictions(report);
    const failed = checks.filter(check => check.pass === false);
    $('status').textContent = failed.length
      ? `${failed.length} check(s) failing: ${failed.map(check => check.id).join(', ')}.`
      : 'All checks pass. Now measure the panels with a ruler — the maths cannot see your room.';
    $('footer-note').textContent = `eye ${(state.eye.x*100).toFixed(1)}, ${(state.eye.y*100).toFixed(1)}, ${(state.eye.z*100).toFixed(1)} cm`;
    const hiddenNow = V.seamGap(state, state.replicaDepth);
    $('hidden-width').textContent = hiddenNow === null ? '—' : `${(hiddenNow*1000).toFixed(1)} mm of world`;
    const dx = 130 + state.eye.x*180, dy = 20 + state.eye.z*146;
    $('eye-dot').setAttribute('cx', dx); $('eye-dot').setAttribute('cy', dy);
    $('sightline').setAttribute('d', `M${dx} ${dy} L130 20`);
    $('replica-dot').setAttribute('y', 20 + state.replicaDepth*146 - 5);
  }

  /* ---- controls --------------------------------------------------------- */
  const number = (id, apply) => { const el = $(id); el.oninput = () => { apply(Number(el.value)); refresh(); }; };
  const range = (id, outputId, apply, format) => {
    const el = $(id), out = $(outputId);
    el.oninput = () => { apply(Number(el.value)); out.textContent = format(Number(el.value)); refresh(); };
    out.textContent = format(Number(el.value));
  };
  // One control drives the hidden wedge: nulling it against the rod is the
  // practical calibration, so both panels move together unless unlinked.
  function setBezel(metres, only) {
    for (const name of only ? [only] : ['left', 'right']) state[name].bezel = metres;
    const show = (id, value) => { const el = $(id); if (el && document.activeElement !== el) el.value = value; };
    show('left-bezel', (state.left.bezel*100).toFixed(2));
    show('right-bezel', (state.right.bezel*100).toFixed(2));
    show('seam-gap', (state.left.bezel*1000).toFixed(1));
    const output = $('seam-gap-value');
    if (output) output.textContent = `${(state.left.bezel*1000).toFixed(1)} mm`;
  }
  function bindControls() {
    range('target-size', 'target-size-value', v => state.size = v/100, v => `${v} cm`);
    range('replica-depth', 'replica-depth-value', v => state.replicaDepth = -v/100,
      v => v >= 0 ? `${v} cm behind` : `${-v} cm in front`);
    range('eye-z', 'eye-z-value', v => state.eye.z = v/100, v => `${v} cm`);
    range('eye-x', 'eye-x-value', v => state.eye.x = v/100, v => `${v} cm`);
    range('eye-y', 'eye-y-value', v => state.eye.y = v/100, v => `${v} cm`);
    range('angle', 'angle-value', v => state.angleDeg = v, v => `${v}°`);
    range('split', 'split-value', v => state.split = v/100, v => `${v} %`);
    $('target').onchange = () => { state.target = $('target').value; refresh(); };
    $('sweep').onchange = () => { state.sweep = $('sweep').value; refresh(); };
    $('show-anchors').onchange = () => { state.anchors = $('show-anchors').checked; refresh(); };
    $('show-seam').onchange = () => { state.seamTicks = $('show-seam').checked; refresh(); };
    $('auto-split').onchange = () => { state.autoSplit = $('auto-split').checked; refresh(); };
    for (const name of ['left', 'right']) {
      number(`${name}-width`, v => state[name].width = v/100);
      number(`${name}-height`, v => state[name].height = v/100);
      number(`${name}-bezel`, v => setBezel(v/100, state.linkPanels ? null : name));
      number(`${name}-pixels`, v => state[name].pixels = v);
    }
    range('reference-fov', 'reference-fov-value', v => state.referenceFov = v, v => `${v}°`);
    $('reference-view').onchange = () => {
      state.referenceView = $('reference-view').checked;
      document.body.classList.toggle('reference', state.referenceView);
      refresh();
    };
    range('seam-gap', 'seam-gap-value', v => setBezel(v/1000, state.linkPanels ? null : 'left'), v => `${v.toFixed(1)} mm`);
    $('link-panels').onchange = () => {
      state.linkPanels = $('link-panels').checked;
      if (state.linkPanels) setBezel(state.left.bezel, null);
      refresh();
    };
    number('measured-chord', v => state.measuredChord = v/100);
    $('reset').onclick = () => location.reload();
    $('open-left').onclick = () => open(`${location.pathname}?view=left`, 'calibrate-left', 'width=900,height=600');
    $('open-right').onclick = () => open(`${location.pathname}?view=right`, 'calibrate-right', 'width=900,height=600');
    const toggle = () => { document.body.classList.toggle('immersive'); $('presentation-tools').hidden = !document.body.classList.contains('immersive'); };
    $('hide-setup').onclick = toggle; $('show-setup').onclick = toggle;
    addEventListener('keydown', event => { if (event.key === 'h' || event.key === 'H') toggle(); });
  }

  /* ---- display windows -------------------------------------------------- */
  function connect() {
    if (typeof BroadcastChannel === 'undefined') return;
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = event => {
      if (!isDisplay) return;
      lastMessage = performance.now();
      Object.assign(state, event.data.state);
      sweepOffset = event.data.sweepOffset;
      refresh();
      $('connection').textContent = '';
    };
  }
  const publish = () => { if (!isDisplay && channel) channel.postMessage({ state, sweepOffset }); };

  if (isDisplay) {
    document.body.classList.add('display');
    $('display-tools').hidden = false;
    $('display-title').textContent = `${side.toUpperCase()} PANEL`;
    $('fullscreen').onclick = () => document.documentElement.requestFullscreen()
      .catch(() => { $('connection').textContent = 'Use the browser fullscreen shortcut.'; });
  } else {
    bindControls();
  }
  connect();
  const timer = setInterval(publish, 33);
  addEventListener('beforeunload', () => { clearInterval(timer); channel && channel.close(); });
  function resize() { renderer.setSize(innerWidth, innerHeight); refresh(); }
  addEventListener('resize', resize);
  buildAnchors(); buildTargets(); updateBezelMask(); resize(); refresh();

  function animate(now) {
    requestAnimationFrame(animate);
    updateSweep(now);
    const eye = renderEye(), screens = V.screens(state), fraction = splitFraction();
    if (state.referenceView && !isDisplay) return renderReference(eye);
    const split = Math.round(innerWidth*fraction);
    let frameBinding = 0;
    for (let i = 0; i < 2; i++) {
      if (isDisplay && i !== (side === 'left' ? 0 : 1)) continue;
      const x = isDisplay || i === 0 ? 0 : split;
      const width = isDisplay ? innerWidth : i === 0 ? split : innerWidth - split;
      if (width <= 0) continue;
      renderer.setViewport(x, 0, width, innerHeight);
      renderer.setScissor(x, 0, width, innerHeight);
      frameBinding = Math.max(frameBinding, applyCamera(cameras[i], screens[i], eye));
      renderer.render(scene, cameras[i]);
    }
    liveBinding = frameBinding;
    if (isDisplay && now - lastMessage > 2000) $('connection').textContent = 'Controller disconnected — holding last view';
  }
  requestAnimationFrame(animate);
})();
