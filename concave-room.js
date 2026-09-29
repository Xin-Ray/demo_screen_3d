(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = message => { $('status').textContent = message; };
  const typing = el => ['INPUT','SELECT','TEXTAREA'].includes(el?.tagName);

  // ---------------------------------------------------------------- profile
  let storage = null;
  try { storage = localStorage; } catch {}
  const loaded = RoomProfile.load(storage);
  const profile = loaded.profile;
  let hasSavedProfile = loaded.saved;
  const state = { depth: .08, eye: { x: 0, y: 0, z: 1.20 }, dancePlaying: true, danceEpoch: Date.now(), danceOffset: 0,
    testPattern: false, miniMode: 'both', trail: [] };
  let pair, geometryKey = '';
  function derive() {
    const g = RoomProfile.geometry(profile);
    pair = ConcaveGeometry.screens(g.width, g.height, g.options);
    geometryKey = JSON.stringify(profile.screen);
  }
  derive();

  if (!window.THREE) { status('3D library could not load. Check your connection and reload.'); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch { status('WebGL unavailable. Enable hardware acceleration and reload.'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true); $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xe1efff, 0x30314a, .45));
  const light = new THREE.DirectionalLight(0xffead5, 1.1);
  light.castShadow = true; light.shadow.mapSize.set(2048, 2048); light.shadow.bias = -.0002; scene.add(light);
  const rim = new THREE.DirectionalLight(0x80bfff, .25); rim.position.set(1, .5, -1); scene.add(rim);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];

  // ---------------------------------------------------------------- room
  // The whole room responds fully to the tracked eye (UX §0): it is fixed in
  // world space like everything else.
  const room = new THREE.Group(); room.name = 'shared-room'; scene.add(room);
  const pattern = new THREE.Group(); pattern.name = 'test-pattern'; pattern.visible = false; scene.add(pattern);
  const roomMaterials = {
    back: new THREE.MeshStandardMaterial({color: 0x536986, roughness: .95}),
    left: new THREE.MeshStandardMaterial({color: 0x387d85, roughness: .95}),
    right: new THREE.MeshStandardMaterial({color: 0x77618d, roughness: .95}),
    floor: new THREE.MeshStandardMaterial({color: 0x696d88, roughness: .88}),
    frame: new THREE.MeshBasicMaterial({color: 0x030405}),
    edge: new THREE.MeshBasicMaterial({color: 0x303c49}),
    trim: new THREE.MeshStandardMaterial({color: 0x9cb9cb, roughness: .8})
  };
  function roomBox(name, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name; mesh.position.set(...position); mesh.receiveShadow = true;
    room.add(mesh); return mesh;
  }
  let roomLayout = '';
  const bounds = { left: 0, right: 0, back: 0, front: 0, floor: 0, ceiling: 0 };
  function clear(group) {
    for (const child of [...group.children]) { child.geometry?.dispose(); group.remove(child); }
  }
  function updateRoom() {
    if (geometryKey === roomLayout) return;
    roomLayout = geometryKey;
    clear(room); clear(pattern);
    const w = profile.screen.width/100, h = profile.screen.height/100;
    // Horizontal reach of the outer lit edges; the portal and room scale with it.
    const outerX = Math.max(...pair.map(s => Math.max(Math.abs(s.pa[0]), Math.abs(s.pb[0]))));
    const apertureX = outerX*1.13, apertureY = h*.46;
    const frameZ = .025, thickness = .025;
    const halfWidth = outerX*1.7, back = -Math.max(w*2, .65), front = frameZ-thickness/2;
    const floorY = -apertureY, ceiling = h*.85, depth = front-back;
    Object.assign(bounds, { left: -halfWidth, right: halfWidth, back, front, floor: floorY, ceiling });
    roomBox('room-back-wall', [halfWidth*2, ceiling-floorY, .025], [0,(ceiling+floorY)/2,back-.0125], roomMaterials.back);
    roomBox('room-left-wall', [.025,ceiling-floorY,depth], [-halfWidth-.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.left);
    roomBox('room-right-wall', [.025,ceiling-floorY,depth], [halfWidth+.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.right);
    roomBox('room-ceiling', [halfWidth*2,.025,depth], [0,ceiling+.0125,(front+back)/2], roomMaterials.back);
    roomBox('room-floor', [halfWidth*2,.025,depth], [0,floorY-.0125,(front+back)/2], roomMaterials.floor);
    for (const x of [-.66,-.33,.33,.66]) roomBox('floor-seam', [.0015,.001,depth], [x*halfWidth,floorY+.0005,(front+back)/2], roomMaterials.trim);
    for (let i=1;i<=5;i++) roomBox('floor-seam', [halfWidth*2,.001,.0015], [0,floorY+.0005,back+i*depth/6], roomMaterials.trim);
    roomBox('back-skirting', [halfWidth*2,h*.012,.006], [0,floorY+h*.006,back+.003], roomMaterials.trim);
    for (const sign of [-1,1]) roomBox('side-skirting', [.006,h*.012,depth], [sign*(halfWidth-.003),floorY+h*.006,(front+back)/2], roomMaterials.trim);
    // One flat portal spans both panels; its edges look bent on a flat preview
    // but straight from the calibrated eye on the physical angled screens.
    const outside = Math.max(w,h)*4;
    for (const sign of [-1,1]) {
      roomBox('portal-side', [outside, outside*2, thickness], [sign*(apertureX+outside/2),0,frameZ], roomMaterials.frame);
      roomBox('portal-horizontal', [apertureX*2, outside, thickness], [0,sign*(apertureY+outside/2),frameZ], roomMaterials.frame);
    }
    const rimWidth = .006, shape = new THREE.Shape();
    shape.moveTo(-apertureX-rimWidth,-apertureY-rimWidth); shape.lineTo(apertureX+rimWidth,-apertureY-rimWidth);
    shape.lineTo(apertureX+rimWidth,apertureY+rimWidth); shape.lineTo(-apertureX-rimWidth,apertureY+rimWidth); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-apertureX,-apertureY); hole.lineTo(-apertureX,apertureY);
    hole.lineTo(apertureX,apertureY); hole.lineTo(apertureX,-apertureY); hole.closePath();
    shape.holes.push(hole);
    const frameTrim = new THREE.Mesh(new THREE.ShapeGeometry(shape),roomMaterials.edge);
    frameTrim.name = 'portal-trim'; frameTrim.position.z = frameZ+thickness/2+.001; room.add(frameTrim);
    light.position.set(-w*.65,h*.65,w*1.8);
    light.target.position.set(0,-h*.12,-w*.45); scene.add(light.target);
    const reach = Math.max(w*2,h*1.5);
    Object.assign(light.shadow.camera, {left:-reach,right:reach,top:reach,bottom:-reach,near:.01,far:reach*5});
    light.shadow.camera.updateProjectionMatrix(); light.shadow.normalBias = .001;
    buildPattern(halfWidth, back, floorY, ceiling);
  }
  // Alignment test pattern (UX §4.2): straight lines that must look straight
  // and continuous across both screens from the calibrated eye.
  function buildPattern(halfWidth, back, floorY, ceiling) {
    const points = [], step = .05;
    for (let x = -halfWidth; x <= halfWidth+1e-6; x += step) points.push(x,floorY,back, x,floorY,.3);
    for (let z = back; z <= .3+1e-6; z += step) points.push(-halfWidth,floorY,z, halfWidth,floorY,z);
    for (let x = -halfWidth; x <= halfWidth+1e-6; x += step) points.push(x,floorY,back, x,ceiling,back);
    for (let y = floorY; y <= ceiling+1e-6; y += step) points.push(-halfWidth,y,back, halfWidth,y,back);
    const grid = new THREE.BufferGeometry(); grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    pattern.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x3f7f8a })));
    const lines = [];
    for (const y of [-.25,0,.25].map(f => f*profile.screen.height/100)) lines.push(-halfWidth,y,-.15, halfWidth,y,-.15);
    const across = new THREE.BufferGeometry(); across.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    pattern.add(new THREE.LineSegments(across, new THREE.LineBasicMaterial({ color: 0xedc58d })));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, ceiling-floorY, 12), new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
    pole.position.set(0, (ceiling+floorY)/2, -.15); pattern.add(pole);
  }

  // ---------------------------------------------------------------- panda
  const person = new THREE.Group();
  person.name = 'foreground-object'; person.userData.kind = 'panda';
  scene.add(person);
  const PANDA_HEIGHT = 1.9;
  if (THREE.GLTFLoader) {
    new THREE.GLTFLoader().load('models/panda.glb', gltf => {
      const model = gltf.scene;
      model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(PANDA_HEIGHT/size.y);
      model.rotation.y = -Math.PI/2; // model's nose points +x; turn it to face the viewer (+z)
      model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
      person.add(model);
    }, undefined, error => { console.error(error); status('Panda model failed to load (models/panda.glb).'); });
  } else status('GLTFLoader unavailable. Check your connection and reload.');
  function danceTime() {
    return state.danceOffset + (state.dancePlaying ? Math.max(0, Date.now()-state.danceEpoch)/1000 : 0);
  }
  function pandaScale() { return Math.min(profile.screen.height/100*.31, profile.screen.width/100*.48); }
  function animatePanda() {
    person.position.set(0, 0, state.depth);
    person.scale.setScalar(pandaScale());
    // Gentle float; paused with P.
    if (person.children[0]) person.children[0].rotation.z = Math.sin(danceTime()*1.2)*.03;
  }

  // ---------------------------------------------------------------- setup views
  const VIEWS = { home: 'Home', manual: 'Manual measurement', camera: 'Camera auto-calibration' };
  let view = 'home';
  function showView(name) {
    view = name;
    for (const key of Object.keys(VIEWS)) $('view-'+key).hidden = key !== name;
    $('eye-calibration').hidden = name === 'home';
    $('crumb-current').textContent = name === 'home' ? '' : VIEWS[name];
    if (name === 'camera') refreshCalibrationCameras(); else CalibrationCamera.stop($('calib-video'));
    if (name === 'home') renderProfileCard();
    $('setup-body').scrollTop = 0;
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-view]');
    if (target) showView(target.dataset.view);
  });
  function setSetupOpen(open) {
    $('setup').classList.toggle('open', open);
    $('setup-toggle').setAttribute('aria-expanded', open);
  }
  $('setup-toggle').onclick = () => setSetupOpen(!$('setup').classList.contains('open'));

  function renderProfileCard() {
    const s = profile.screen, when = profile.calibratedAt ? new Date(profile.calibratedAt).toLocaleString() : null;
    const camera = trackingSession?.stream ? (trackingReference ? 'tracking, calibrated' : 'tracking, not calibrated') : 'not running';
    $('profile-card').innerHTML = (hasSavedProfile && when
      ? `Last calibrated <b>${when}</b>`
      : 'No saved calibration yet. Use <b>Manual measurement</b>.')
      + `<br><b>${s.angle.toFixed(1)}°</b> · gap <b>${s.gap} cm</b> · <b>${s.width} × ${s.height} cm</b><br>Webcam: ${camera}`
      + (hasSavedProfile ? '<br><small>Screens moved? Re-measure, or Apply to reuse these values.</small>' : '');
  }

  // Bind every profile field input by data-group / data-key.
  const fieldInputs = [...document.querySelectorAll('[data-group][data-key]')];
  function fillInputs() {
    for (const input of fieldInputs) {
      const { group, key } = input.dataset, [, min, max] = RoomProfile.FIELDS[group][key];
      input.min = min; input.max = max; input.value = profile[group][key];
    }
    syncOuterDistance(); fieldReadouts();
  }
  function fieldReadouts() {
    $('seam-value').value = `${profile.screen.seamSplit}%`;
    const o = profile.advanced.overlap;
    $('overlap-value').value = o === 0 ? '0% · exact' : `${o > 0 ? '+' : ''}${o.toFixed(1)}%`;
  }
  function syncOuterDistance() {
    const s = profile.screen;
    $('outer-distance').value = ConcaveGeometry.outerDistance(s.angle, s.width, s.gap).toFixed(1);
  }
  const trackingKeys = new Set(['width','height','angle','gap','vOffset','top','forward','tilt','fov','yaw','x']);
  for (const input of fieldInputs) {
    input.addEventListener('input', () => {
      const { group, key } = input.dataset, value = Number(input.value);
      if (input.value === '' || !RoomProfile.inRange(group, key, value)) return;
      profile[group][key] = value;
      if (group === 'screen') { derive(); if (key !== 'seamSplit') syncOuterDistance(); }
      fieldReadouts();
    });
    input.addEventListener('change', () => {
      const { group, key } = input.dataset;
      if (input.value === '' || !RoomProfile.inRange(group, key, Number(input.value))) { input.value = profile[group][key]; return; }
      if (trackingKeys.has(key)) invalidateTracking();
    });
  }
  $('outer-distance').addEventListener('input', () => {
    const s = profile.screen, angle = ConcaveGeometry.angleFromOuterDistance(Number($('outer-distance').value), s.width, s.gap);
    if (!RoomProfile.inRange('screen', 'angle', angle)) return;
    profile.screen.angle = Math.round(angle*10)/10;
    fieldInputs.find(i => i.dataset.key === 'angle').value = profile.screen.angle;
    derive();
  });
  $('outer-distance').addEventListener('change', () => { syncOuterDistance(); invalidateTracking(); });
  $('test-pattern').onchange = event => { state.testPattern = event.target.checked; };
  $('model-depth').oninput = event => { state.depth = Number(event.target.value)/100; $('model-depth-value').value = `${event.target.value} cm`; };
  $('model-depth-value').value = `${$('model-depth').value} cm`;
  function togglePause() {
    state.danceOffset = danceTime(); state.danceEpoch = Date.now(); state.dancePlaying = !state.dancePlaying;
    $('toggle-dance').textContent = state.dancePlaying ? 'Pause motion · P' : 'Resume motion · P';
  }
  $('toggle-dance').onclick = togglePause;

  // Profile export / import.
  $('export-profile').onclick = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'concave-room-profile.json' });
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  $('import-profile').onclick = () => $('import-file').click();
  $('import-file').onchange = async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      const next = RoomProfile.sanitize(JSON.parse(await file.text()));
      Object.assign(profile, next); derive(); fillInputs(); invalidateTracking();
      status('Profile imported. Check the values, then Apply.');
    } catch { status('Could not read that file as a profile JSON.'); }
  };

  // Apply & start experience (same footer on every view).
  $('apply').onclick = () => {
    profile.calibratedAt = new Date().toISOString();
    hasSavedProfile = RoomProfile.save(storage, profile);
    CalibrationCamera.stop($('calib-video'));
    setSetupOpen(false);
    if (!trackingSession) startTracking();
    status(hasSavedProfile ? 'Applied and saved.' : 'Applied (this browser could not save the profile).');
  };

  // ---------------------------------------------------------------- camera auto-calibration (placeholder)
  const RESULT_ROWS = [['Inside angle','°'],['Gap','cm'],['Vertical offset','cm'],['Cam height','cm'],['Cam forward','cm'],['Cam yaw','°'],['Cam tilt','°'],['Cam FOV','°']];
  $('calib-results').tBodies[0].innerHTML = RESULT_ROWS.map(([name, unit]) => `<tr><td>${name} (${unit})</td><td>—</td><td>—</td></tr>`).join('');
  let trackingDeviceId = '';
  async function refreshCalibrationCameras() {
    const select = $('calib-device'), current = select.value;
    try {
      const cameras = await CalibrationCamera.list(trackingDeviceId);
      select.innerHTML = '<option value="">Select a camera…</option>' + cameras.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('');
      if (cameras.some(c => c.id === current)) select.value = current;
      if (!cameras.length) status('No second camera found. Connect a USB webcam for calibration.');
    } catch { status('Cannot list cameras. Allow camera access.'); }
  }
  $('calib-device').onchange = async event => {
    try { await CalibrationCamera.preview(event.target.value, $('calib-video')); }
    catch { status('Could not open that camera. It may be in use.'); }
  };
  function escapeHtml(text) { return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }

  // ---------------------------------------------------------------- tracking
  let trackingSession, trackingReference, trackingTarget, trackingSamples = [], lastSeen = 0;
  let smoothingTime = performance.now(), fpsCount = 0, fps = 0, fpsTime = performance.now(), trackingError = '';
  function webcamPose() { return RoomProfile.cameraPose(profile); }
  function eyeValid(eye) {
    return eye && [eye.x,eye.y,eye.z].every(Number.isFinite) && Math.max(Math.abs(eye.x),Math.abs(eye.y),Math.abs(eye.z)) < 10
      && ConcaveGeometry.inFront(eye, pair, .03);
  }
  function invalidateTracking() {
    trackingReference = null; trackingTarget = null; trackingSamples = []; $('calibrate').disabled = true;
    status('Set the eye-to-webcam distance, hold still, then calibrate tracking.');
  }
  function stopTracking() {
    const old = trackingSession; trackingSession = null;
    if (old) {
      cancelAnimationFrame(old.frame);
      old.stream?.getTracks().forEach(track => track.stop());
      Promise.resolve(old.inFlight).catch(() => {}).then(() => old.detector?.close()).catch(() => {});
    }
    $('video').srcObject = null; $('video').hidden = true; lastSeen = 0; invalidateTracking();
  }
  async function refreshTrackingDevices() {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId);
      const select = $('tracking-device');
      select.innerHTML = '<option value="">Default camera</option>' + devices.map((d, i) => `<option value="${d.deviceId}">${escapeHtml(d.label || `Camera ${i+1}`)}</option>`).join('');
      select.value = devices.some(d => d.deviceId === trackingDeviceId) ? trackingDeviceId : '';
    } catch {}
  }
  $('tracking-device').onchange = event => { profile.trackingDeviceId = event.target.value; startTracking(); };
  async function startTracking() {
    stopTracking();
    const active = {}; trackingSession = active; trackingError = '';
    status('Starting webcam…');
    try {
      if (!window.FaceMesh) throw Error('Tracking library unavailable. Check your connection and restart webcam.');
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Webcam requires localhost or HTTPS.');
      const video = { width: {ideal: 1280}, height: {ideal: 720} };
      if (profile.trackingDeviceId) video.deviceId = { exact: profile.trackingDeviceId };
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({video, audio: false}); }
      catch (error) {
        if (!profile.trackingDeviceId || error.name === 'NotAllowedError') throw error;
        delete video.deviceId; stream = await navigator.mediaDevices.getUserMedia({video, audio: false}); // saved camera missing
      }
      if (trackingSession !== active) { stream.getTracks().forEach(t => t.stop()); return; }
      active.stream = stream; trackingDeviceId = stream.getVideoTracks()[0].getSettings().deviceId || '';
      refreshTrackingDevices();
      const element = $('video'); element.srcObject = stream; await element.play();
      if (trackingSession !== active) return;
      element.hidden = false;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (trackingSession === active) { stopTracking(); trackingError = 'Webcam disconnected'; status('Webcam disconnected. Restart webcam.'); }
      });
      active.detector = new FaceMesh({locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`});
      active.detector.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .6, minTrackingConfidence: .6});
      active.detector.onResults(results => {
        if (trackingSession !== active) return;
        const now = performance.now();
        const sample = now-active.captured < 300 ? ConcaveTracking.sample(results.multiFaceLandmarks?.[0], element.videoWidth/element.videoHeight) : null;
        if (!sample) { trackingSamples = []; $('calibrate').disabled = true; return; }
        lastSeen = now; fpsCount++;
        trackingSamples.push({...sample, time: now}); trackingSamples = trackingSamples.filter(s => now-s.time < 1500).slice(-24);
        $('calibrate').disabled = trackingSamples.length < 12;
        const eye = trackingReference ? PortraitTracking.estimate(sample, trackingReference)
          : PortraitTracking.eyeFromSample(sample, webcamPose(), Number($('camera-distance-slider').value)/100);
        if (!eye) { invalidateTracking(); return; }
        if (!eyeValid(eye)) { trackingTarget = null; return; }
        trackingTarget = eye;
        status(trackingReference ? 'Tracking live · calibrated.' : trackingSamples.length < 12
          ? 'Camera preview. Hold still…' : 'Camera preview. Check the distance, then calibrate tracking.');
      });
      let lastTime = -1;
      const frame = async () => {
        if (trackingSession !== active) return;
        if (element.readyState >= 2 && element.currentTime !== lastTime) {
          lastTime = element.currentTime; active.captured = performance.now();
          try { active.inFlight = active.detector.send({image: element}); await active.inFlight; }
          catch { if (trackingSession === active) { stopTracking(); trackingError = 'Tracking failed'; status('Tracking failed. Restart webcam.'); } return; }
        }
        if (trackingSession === active) active.frame = requestAnimationFrame(frame);
      };
      status('Finding eyes…'); active.frame = requestAnimationFrame(frame);
    } catch(error) {
      if (trackingSession !== active) return;
      stopTracking();
      trackingError = error.name === 'NotAllowedError' ? 'Webcam permission denied' : error.name === 'NotReadableError' ? 'Webcam in use by another app' : error.message;
      status(trackingError + '. Fix it, then press Restart webcam (R).');
    }
  }
  $('restart-camera').onclick = startTracking;
  function calibrateTracking() {
    if (!trackingSession || performance.now()-lastSeen > 300) return false;
    const next = ConcaveTracking.calibrate(trackingSamples, {pose: webcamPose()});
    if (next) next.eye = PortraitTracking.eyeFromSample(next, next.pose, Number($('camera-distance-slider').value)/100);
    if (!next || !eyeValid(next.eye)) {
      status('Hold still with your eyes in front of both screens; check the webcam placement and distance.'); return false;
    }
    trackingReference = next; trackingTarget = {...next.eye}; state.eye = {...next.eye};
    status('Tracking calibrated.'); return true;
  }
  $('camera-distance-slider').oninput = event => {
    $('selected-distance-value').value = `${event.target.value} cm`;
    trackingReference = null; trackingTarget = null;
    if (!calibrateTracking()) status('Distance selected. Hold still with both eyes visible, then calibrate.');
  };
  $('calibrate').onclick = calibrateTracking;
  addEventListener('beforeunload', () => { stopTracking(); CalibrationCamera.stop(); });
  setInterval(() => {
    const now = performance.now(), dt = (now-smoothingTime)/1000; smoothingTime = now;
    if (trackingTarget && now-lastSeen < 500) {
      state.eye = PortraitTracking.smoothEye(state.eye, trackingTarget, dt, profile.advanced.smoothingMs/1000);
      const last = state.trail[state.trail.length-1];
      if (!last || Math.hypot(last.x-state.eye.x, last.y-state.eye.y, last.z-state.eye.z) > .004) state.trail = [...state.trail, {...state.eye}].slice(-40);
    }
    if (now-fpsTime >= 1000) { fps = fpsCount*1000/(now-fpsTime); fpsCount = 0; fpsTime = now; }
  }, 33);

  // ---------------------------------------------------------------- debug mini-view
  const fmt = (v, d = 0) => (v*100).toFixed(d);
  let lastDebug = 0, lastCard = 0;
  function updateDebug(now) {
    if (now-lastDebug < 66 || document.body.classList.contains('column-hidden')) return;
    lastDebug = now;
    const pose = webcamPose(), eye = state.eye, fresh = trackingSession?.stream && lastSeen && now-lastSeen < 500;
    RoomMiniView.draw($('miniview'), { pair, pose, eye: trackingTarget || trackingReference ? eye : null, trail: state.trail,
      room: bounds, panda: { z: state.depth, radius: pandaScale()*.35 } }, state.miniMode);
    const s = profile.screen, c = profile.trackingCamera;
    const tags = [
      `θ <b>${s.angle.toFixed(1)}°</b>`, `gap <b>${s.gap} cm</b>`, `<b>${s.width} × ${s.height} cm</b>`, `offset <b>${s.vOffset} cm</b>`,
      `cam <b>+${c.top} top · ${c.forward} fwd · ${c.tilt}° tilt · ${c.fov}° FOV</b>` + (c.yaw || c.x ? ` <b>· yaw ${c.yaw}° · x ${c.x}</b>` : ''),
      `eye <b>${fmt(eye.x)} / ${fmt(eye.y)} / ${fmt(eye.z)} cm</b>`,
      `→ seam <b>${fmt(Math.hypot(eye.x, eye.z))} cm</b>`, `→ cam <b>${fmt(Math.hypot(eye.x-pose.x, eye.y-pose.y, eye.z-pose.z))} cm</b>`,
      `<b>${fresh ? fps.toFixed(0) : 0} fps</b>`, `age <b>${lastSeen ? Math.round(now-lastSeen) : '—'} ms</b>`,
      `calibrated <b>${trackingReference ? 'yes' : 'no'}</b>`,
      `profile <b>${profile.calibratedAt ? new Date(profile.calibratedAt).toLocaleTimeString() : 'unsaved'}</b>`,
      state.miniMode !== 'both' ? `view <b>${state.miniMode}</b>` : ''
    ].filter(Boolean);
    $('tags').innerHTML = tags.map(t => `<span>${t}</span>`).join('');
    const warnings = [];
    if (trackingError) warnings.push(trackingError);
    else if (!trackingSession?.stream) warnings.push('Webcam not running');
    else if (!fresh) warnings.push('Tracking lost: eyes not visible');
    for (const screen of pair) if (ConcaveGeometry.planeDistance(screen, eye) < .03) warnings.push(`Eye behind ${screen.name}-screen plane`);
    if (trackingSession?.stream && fresh && !trackingTarget) warnings.push('Eye outside supported area');
    if (!trackingReference && fresh) warnings.push('Tracking not calibrated');
    $('warnings').textContent = warnings.join(' · ');
    const pill = $('status-pill'), lost = trackingSession?.stream && !fresh;
    pill.hidden = !lost; if (lost) pill.textContent = 'Tracking lost: eyes not visible';
    $('mini-mode').textContent = state.miniMode;
    if (view === 'home' && now-lastCard > 1000) { lastCard = now; renderProfileCard(); }
  }

  // ---------------------------------------------------------------- keys & loop
  addEventListener('keydown', event => {
    if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'h') document.body.classList.toggle('column-hidden');
    else if (key === 'd') state.miniMode = { both: 'top', top: 'side', side: 'both' }[state.miniMode];
    else if (key === 'p') togglePause();
    else if (key === 'r') startTracking();
    else return;
    event.preventDefault();
  });
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    document.documentElement.style.setProperty('--column-width', `${Math.round(innerWidth*profile.screen.seamSplit/100*.2)}px`);
  }
  addEventListener('resize', resize);
  let lastSplit = profile.screen.seamSplit;
  function animate(now) {
    requestAnimationFrame(animate);
    if (profile.screen.seamSplit !== lastSplit) { lastSplit = profile.screen.seamSplit; resize(); }
    updateRoom(); animatePanda();
    room.visible = person.visible = !state.testPattern; pattern.visible = state.testPattern;
    const eye = new THREE.Vector3(state.eye.x, state.eye.y, state.eye.z);
    const split = Math.round(innerWidth*profile.screen.seamSplit/100);
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? 0 : split, width = i === 0 ? split : innerWidth-split;
      renderer.setViewport(x, 0, width, innerHeight); renderer.setScissor(x, 0, width, innerHeight);
      ConcaveGeometry.project(THREE, cameras[i], pair[i], eye, profile.advanced.overlap/100); renderer.render(scene, cameras[i]);
    }
    updateDebug(now);
  }
  fillInputs(); resize(); showView('home');
  requestAnimationFrame(animate);
  startTracking();
})();
