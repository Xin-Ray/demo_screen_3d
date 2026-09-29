(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const side = new URLSearchParams(location.search).get('view');
  const isDisplay = ['left', 'right'].includes(side);
  const state = { width: .336, height: .598, depth: .08, overlap: 0,
    eye: { x: 0, y: 0, z: 1.20 }, dancePlaying: true, danceEpoch: Date.now(), danceOffset: 0 };
  let seam = .5, channel, lastMessage = 0;
  const status = message => { $('status').textContent = message; };
  if (isDisplay) {
    document.body.classList.add('display', 'display-'+side); $('display-tools').hidden = false;
    $('display-title').textContent = `${side.toUpperCase()} SCREEN`;
  }
  if (!window.THREE) { status('3D library could not load. Check your connection and reload.'); $('connection').textContent = '3D library unavailable'; return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch { status('WebGL unavailable. Enable hardware acceleration and reload.'); $('connection').textContent = 'WebGL unavailable'; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setScissorTest(true); $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  scene.add(new THREE.HemisphereLight(0xe1efff, 0x30314a, .45));
  const light = new THREE.DirectionalLight(0xffead5, 1.1);
  light.position.set(-.5, 1.6, 1.4); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .01, far: 8 });
  light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -.0002; scene.add(light);
  const rim = new THREE.DirectionalLight(0x80bfff, .25); rim.position.set(1, .5, -1); scene.add(rim);
  const cameras = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  // The shared room/frame uses reduced lateral/vertical parallax. The panda
  // retains the full tracked viewpoint response, making it feel closer.
  const room = new THREE.Group(); room.name = 'shared-room'; scene.add(room);
  const roomViewResponse = .25;
  function updateRoomViewResponse() {
    // Follow 75% of lateral/vertical eye translation, leaving the room with
    // 25% of the relative viewpoint change. Keep depth, scale, and panda fixed.
    // Moving the complete enclosure and frame together avoids broken junctions.
    room.position.set(state.eye.x*(1-roomViewResponse), state.eye.y*(1-roomViewResponse), 0);
  }
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
  function updateRoom() {
    const key = `${state.width}/${state.height}`;
    if (key === roomLayout) return;
    roomLayout = key;
    for (const child of [...room.children]) { child.geometry.dispose(); room.remove(child); }
    const w = state.width, h = state.height;
    const apertureX = w*.80, apertureY = h*.46;
    const frameZ = .025, thickness = .025;
    const halfWidth = w*1.2, back = -Math.max(w*2, .65), front = frameZ-thickness/2;
    // The floor meets the sill at its back edge, without an exposed slab or
    // a coplanar overlap between the floor and the top of the frame.
    const floorY = -apertureY, ceiling = h*.85, depth = front-back;
    roomBox('room-back-wall', [halfWidth*2, ceiling-floorY, .025], [0,(ceiling+floorY)/2,back-.0125], roomMaterials.back);
    roomBox('room-left-wall', [.025,ceiling-floorY,depth], [-halfWidth-.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.left);
    roomBox('room-right-wall', [.025,ceiling-floorY,depth], [halfWidth+.0125,(ceiling+floorY)/2,(front+back)/2], roomMaterials.right);
    roomBox('room-ceiling', [halfWidth*2,.025,depth], [0,ceiling+.0125,(front+back)/2], roomMaterials.back);
    roomBox('room-floor', [halfWidth*2,.025,depth], [0,floorY-.0125,(front+back)/2], roomMaterials.floor);
    // Fine floor seams converge in depth without dividing the monitor hinge.
    for (const x of [-.66,-.33,.33,.66]) {
      roomBox('floor-seam', [.0015,.001,depth], [x*halfWidth,floorY+.0005,(front+back)/2], roomMaterials.trim);
    }
    for (let i=1;i<=5;i++) {
      roomBox('floor-seam', [halfWidth*2,.001,.0015], [0,floorY+.0005,back+i*depth/6], roomMaterials.trim);
    }
    roomBox('back-skirting', [halfWidth*2,h*.012,.006], [0,floorY+h*.006,back+.003], roomMaterials.trim);
    for (const sign of [-1,1]) roomBox('side-skirting', [.006,h*.012,depth], [sign*(halfWidth-.003),floorY+h*.006,(front+back)/2], roomMaterials.trim);
    // A single planar aperture spans the hinge. The two screen images of its
    // horizontal edges are deliberately warped: they form straight world-space
    // edges when seen on the physical 90-degree panels from the calibrated eye.
    const outside = Math.max(w,h)*4;
    for (const sign of [-1,1]) {
      roomBox('portal-side', [outside, outside*2, thickness], [sign*(apertureX+outside/2),0,frameZ], roomMaterials.frame);
      roomBox('portal-horizontal', [apertureX*2, outside, thickness], [0,sign*(apertureY+outside/2),frameZ], roomMaterials.frame);

    }
    // One flat trim ring replaces the overlapping trim boxes. Its face sits
    // clearly ahead of the black frame, with no shared depth-buffer surfaces.
    const rimWidth = .006, shape = new THREE.Shape();
    shape.moveTo(-apertureX-rimWidth,-apertureY-rimWidth);
    shape.lineTo(apertureX+rimWidth,-apertureY-rimWidth);
    shape.lineTo(apertureX+rimWidth,apertureY+rimWidth);
    shape.lineTo(-apertureX-rimWidth,apertureY+rimWidth); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-apertureX,-apertureY); hole.lineTo(-apertureX,apertureY);
    hole.lineTo(apertureX,apertureY); hole.lineTo(apertureX,-apertureY); hole.closePath();
    shape.holes.push(hole);
    const frameTrim = new THREE.Mesh(new THREE.ShapeGeometry(shape),roomMaterials.edge);
    frameTrim.name = 'portal-trim'; frameTrim.position.z = frameZ+thickness/2+.001;
    room.add(frameTrim);
    // Light comes from the viewer side, above and slightly left of the screens.
    light.position.set(-w*.65,h*.65,w*1.8);
    light.target.position.set(0,-h*.12,-w*.45); scene.add(light.target);
    const reach = Math.max(w*2,h*1.5);
    Object.assign(light.shadow.camera, {left:-reach,right:reach,top:reach,bottom:-reach,near:.01,far:reach*5});
    light.shadow.camera.updateProjectionMatrix(); light.shadow.normalBias = .001;
  }
  // Panda model loaded from models/panda.glb, normalized to the old figure's size.
  const person = new THREE.Group();
  person.name = 'foreground-object'; person.userData.kind = 'panda';
  scene.add(person);
  const PANDA_HEIGHT = 1.9;
  if (THREE.GLTFLoader) {
    new THREE.GLTFLoader().load('models/panda.glb', gltf => {
      const model = gltf.scene;
      model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(PANDA_HEIGHT/size.y);
      model.rotation.y = -Math.PI/2; // model's nose points +x; turn it to face the viewer (+z)
      const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      model.position.sub(center);
      person.add(model);
    }, undefined, error => { console.error(error); status('Panda model failed to load (models/panda.glb).'); });
  } else status('GLTFLoader unavailable. Check your connection and reload.');
  function danceTime() {
    return state.danceOffset + (state.dancePlaying ? Math.max(0, Date.now()-state.danceEpoch)/1000 : 0);
  }
  function animateDance() {
    person.position.set(0, 0, state.depth);
    person.scale.setScalar(Math.min(state.height*.31, state.width*.48));
  }

  function updateSetupDiagram() {
    if (isDisplay) return;
    const pose = webcamPose(), eye = state.eye;
    const fresh = trackingSession && lastSeen && performance.now()-lastSeen < 500;
    $('camera-distance').value = fresh && trackingTarget ? `${(Math.hypot(eye.x-pose.x,eye.y-pose.y,eye.z-pose.z)*100).toFixed(1)} cm` : '—';
    $('distance-label').textContent = trackingReference ? 'Estimated eyes → webcam' : 'Preview eyes → webcam';
    const screens = ConcaveGeometry.screens(state.width, state.height);
    // Two orthographic diagrams: x/z from above and z/y from the side.
    const spanX = Math.max(state.width, Math.abs(pose.x), Math.abs(eye.x), .5)*2.5;
    const minZ = Math.min(-.15, pose.z-.1), maxZ = Math.max(eye.z+.25, state.width, pose.z+.5);
    const minY = Math.min(-state.height/2, pose.y-.15, eye.y-.15);
    const maxY = Math.max(state.height/2+.15, pose.y+.15, eye.y+.15);
    const top = (x,z) => [140+x/spanX*230, 30+(z-minZ)/(maxZ-minZ)*135];
    const sidePoint = (z,y) => [25+(z-minZ)/(maxZ-minZ)*230, 345-(y-minY)/(maxY-minY)*135];
    const points = list => list.map(p => p.join(',')).join(' ');
    const set = (id, attrs) => { for (const [key,value] of Object.entries(attrs)) $(id).setAttribute(key,value); };
    set('plan-panels', {points: points([top(screens[0].pa[0],screens[0].pa[2]),top(0,0),top(screens[1].pb[0],screens[1].pb[2])])});
    set('side-panel', {x1:sidePoint(0,0)[0], x2:sidePoint(0,0)[0], y1:sidePoint(0,state.height/2)[1], y2:sidePoint(0,-state.height/2)[1]});
    const direction = PortraitTracking.basis(pose).forward;
    for (const [prefix,project] of [['plan',(v)=>top(v.x,v.z)],['side',(v)=>sidePoint(v.z,v.y)]]) {
      const c=project(pose), e=project(eye), target=project({x:pose.x+direction[0]*.35,y:pose.y+direction[1]*.35,z:pose.z+direction[2]*.35});
      set(prefix+'-camera',{cx:c[0],cy:c[1]}); set(prefix+'-eye',{cx:e[0],cy:e[1]});
      set(prefix+'-aim',{x1:c[0],y1:c[1],x2:target[0],y2:target[1]});
      set(prefix+'-sight',{x1:e[0],y1:e[1],x2:project({x:0,y:0,z:0})[0],y2:project({x:0,y:0,z:0})[1]});
    }
    $('pose-readout').textContent = `Webcam: ${(pose.x*100).toFixed(0)}, ${(pose.y*100).toFixed(0)}, ${(pose.z*100).toFixed(0)} cm · Eyes: ${(eye.x*100).toFixed(0)}, ${(eye.y*100).toFixed(0)}, ${(eye.z*100).toFixed(0)} cm (x, y, z from seam center)`;
  }
  function publish() { channel?.postMessage({ type: 'state', state }); }
  function valid(s) {
    return s && [s.width,s.height,s.depth,s.overlap,s.eye?.x,s.eye?.y,s.eye?.z,s.danceEpoch,s.danceOffset].every(Number.isFinite)
      && s.width >= .2 && s.width <= 1.5 && s.height >= .3 && s.height <= 2.5
      && s.overlap >= -.2 && s.overlap <= .2 && PortraitTracking.validEye(s.eye)
      && s.depth >= -.25 && s.depth <= .1 && typeof s.dancePlaying === 'boolean';
  }
  try {
    channel = new BroadcastChannel('concave-portrait-room-v1');
    channel.onmessage = ({data}) => {
      if (isDisplay && data?.type === 'state' && valid(data.state)) {
        Object.assign(state, data.state); lastMessage = performance.now(); $('connection').textContent = 'Controller connected';
      } else if (!isDisplay && data?.type === 'hello') publish();
    };
    if (isDisplay) channel.postMessage({type: 'hello'});
  } catch { status('Window sync unavailable. Use the spanning view.'); }
  function readouts() {
    $('model-depth-value').value = `${Math.round(state.depth*100)} cm`;
  }
  $('model-depth').oninput = event => { state.depth = Number(event.target.value)/100; readouts(); publish(); };
  for (const key of ['width','height']) $('screen-'+key).onchange = event => {
    if (!event.target.value || !event.target.checkValidity()) { event.target.value = state[key]*100; return; }
    state[key] = Number(event.target.value)/100; publish();
  };
  $('seam').oninput = event => { seam = Number(event.target.value)/100; $('seam-value').value = `${event.target.value}%`; $('seam-marker').style.left = `${event.target.value}%`; };
  function setOverlap(percent) {
    if (!Number.isFinite(percent) || percent < -20 || percent > 20) return;
    state.overlap = percent/100;
    $('seam-overlap').value = percent;
    $('seam-overlap-value').value = percent === 0 ? '0% · exact projection' : `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
    publish();
  }
  $('seam-overlap').oninput = event => setOverlap(Number(event.target.value));
  $('reset-overlap').onclick = () => setOverlap(0);
  $('toggle-dance').onclick = () => {
    state.danceOffset = danceTime(); state.danceEpoch = Date.now(); state.dancePlaying = !state.dancePlaying;
    $('toggle-dance').textContent = state.dancePlaying ? 'Pause motion' : 'Resume motion'; publish();
  };
  function toggleSetup() {
    if (isDisplay) return;
    $('presentation-tools').hidden = !document.body.classList.toggle('immersive');
  }
  $('hide-setup').onclick = $('show-setup').onclick = toggleSetup;
  addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'h' && !['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) toggleSetup();
  });
  for (const name of ['left','right']) $('open-'+name).onclick = () => {
    if (!window.open(`concave-room.html?view=${name}`, `portrait-room-${name}`, 'popup,width=600,height=1000')) status('Popup blocked. Allow popups and try again.');
  };
  $('fullscreen').onclick = $('display-fullscreen').onclick = () => document.documentElement.requestFullscreen().catch(() => {
    status('Use your browser fullscreen shortcut.'); $('connection').textContent = 'Use your browser fullscreen shortcut.';
  });
  let trackingSession, trackingReference, trackingTarget, trackingSamples = [], lastSeen = 0;
  let smoothingTime = performance.now();
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
  function webcamPose() {
    return { x: Number($('webcam-x').value)/100, y: state.height/2+Number($('webcam-top').value)/100,
      z: Number($('webcam-z').value)/100, yaw: Number($('webcam-yaw').value),
      tilt: Number($('webcam-tilt').value), fov: Number($('webcam-fov').value) };
  }
  async function startTracking() {
    if (isDisplay) return;
    stopTracking();
    const active = {}; trackingSession = active;
    status('Starting webcam…');
    try {
      if (!window.FaceMesh) throw Error('Tracking library unavailable. Check your connection and restart webcam.');
      if (!navigator.mediaDevices?.getUserMedia) throw Error('Webcam requires localhost or HTTPS.');
      const stream = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
      if (trackingSession !== active) { stream.getTracks().forEach(t => t.stop()); return; }
      active.stream = stream; const video = $('video'); video.srcObject = stream; await video.play();
      if (trackingSession !== active) return;
      video.hidden = false;
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (trackingSession === active) { stopTracking(); status('Webcam disconnected. Restart webcam.'); }
      });
      active.detector = new FaceMesh({locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`});
      active.detector.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: .6, minTrackingConfidence: .6});
      active.detector.onResults(results => {
        if (trackingSession !== active) return;
        const now = performance.now();
        const sample = now-active.captured < 300 ? ConcaveTracking.sample(results.multiFaceLandmarks?.[0], video.videoWidth/video.videoHeight) : null;
        if (!sample) { trackingSamples = []; $('calibrate').disabled = true; status('Eyes not visible or tracking delayed. Holding viewpoint.'); return; }
        lastSeen = now;
        trackingSamples.push({...sample, time: now}); trackingSamples = trackingSamples.filter(s => now-s.time < 1500).slice(-24);
        $('calibrate').disabled = trackingSamples.length < 12;
        const eye = trackingReference ? PortraitTracking.estimate(sample, trackingReference)
          : PortraitTracking.eyeFromSample(sample, webcamPose(), Number($('camera-distance-slider').value)/100);
        if (!eye) { invalidateTracking(); return; }
        if (!PortraitTracking.validEye(eye)) {
          trackingTarget = null;
          status('Eyes are outside the inward-facing area of the two screens. Check webcam placement and distance. Holding last view.'); return;
        }
        trackingTarget = eye;
        status(trackingReference ? 'Tracking live · calibrated camera distance' : trackingSamples.length < 12
          ? 'Camera-driven preview. Hold still…' : 'Camera-driven preview. Check the distance, then calibrate tracking.');
        readouts(); publish();
      });
      let lastTime = -1;
      const frame = async () => {
        if (trackingSession !== active) return;
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime; active.captured = performance.now();
          try { active.inFlight = active.detector.send({image: video}); await active.inFlight; }
          catch { if (trackingSession === active) { stopTracking(); status('Tracking failed. Restart webcam.'); } return; }
        }
        if (trackingSession === active) active.frame = requestAnimationFrame(frame);
      };
      status('Finding eyes…'); active.frame = requestAnimationFrame(frame);
    } catch(error) {
      if (trackingSession !== active) return;
      stopTracking(); status(error.name === 'NotAllowedError' ? 'Webcam permission denied. Allow camera access and restart.' : error.message);
    }
  }
  $('restart-camera').onclick = startTracking;
  function calibrateTracking() {
    if (!trackingSession || performance.now()-lastSeen > 300) return false;
    const next = ConcaveTracking.calibrate(trackingSamples, {pose: webcamPose()});
    if (next) next.eye = PortraitTracking.eyeFromSample(next,next.pose,Number($('camera-distance-slider').value)/100);
    if (!next || !PortraitTracking.validEye(next.eye)) {
      status('Hold still with your eyes inside the two-screen viewing area; check the webcam placement and distance.'); return false;
    }
    trackingReference = next; trackingTarget = {...next.eye}; state.eye = {...next.eye}; publish();
    status('Tracking calibrated from the webcam and selected distance.'); return true;
  }
  $('camera-distance-slider').oninput = event => {
    $('selected-distance-value').value = `${event.target.value} cm`;
    trackingReference = null; trackingTarget = null;
    if (!calibrateTracking()) status('Distance selected. Waiting for stable camera observations; hold still and calibrate.');
  };
  $('calibrate').onclick = calibrateTracking;
  for (const id of ['webcam-x','webcam-top','webcam-z','webcam-yaw','webcam-tilt','webcam-fov']) {
    const input = $(id); let previous = input.value;
    input.onchange = () => {
      if (!input.value || !input.checkValidity()) { input.value = previous; return; }
      previous = input.value; invalidateTracking();
    };
  }
  for (const id of ['screen-width','screen-height']) $(id).addEventListener('change', invalidateTracking);
  addEventListener('beforeunload', stopTracking);
  const syncTimer = setInterval(() => {
    const now = performance.now(), dt = (now-smoothingTime)/1000; smoothingTime = now;
    if (!isDisplay && trackingTarget && now-lastSeen < 500) {
      state.eye = PortraitTracking.smoothEye(state.eye, trackingTarget, dt); readouts();
    }
    if (!isDisplay) publish();
    if (trackingSession?.stream && lastSeen && performance.now()-lastSeen > 500) {
      $('calibrate').disabled = true; status('Tracking paused · eyes obscured or frames stale. Holding viewpoint.');
    }
  }, 33);
  addEventListener('beforeunload', () => { clearInterval(syncTimer); channel?.close(); });
  function resize() { renderer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize); resize(); readouts();
  function animate(now) {
    requestAnimationFrame(animate); updateRoom(); updateRoomViewResponse(); animateDance(); updateSetupDiagram();
    const eye = new THREE.Vector3(state.eye.x, state.eye.y, state.eye.z);
    const screens = ConcaveGeometry.screens(state.width, state.height);
    const split = Math.round(innerWidth*seam);
    for (let i=0; i<2; i++) {
      if (isDisplay && i !== (side === 'left' ? 0 : 1)) continue;
      const x = isDisplay || i === 0 ? 0 : split;
      const width = isDisplay ? innerWidth : i === 0 ? split : innerWidth-split;
      renderer.setViewport(x, 0, width, innerHeight); renderer.setScissor(x, 0, width, innerHeight);
      ConcaveGeometry.project(THREE, cameras[i], screens[i], eye, state.overlap); renderer.render(scene, cameras[i]);
    }
    if (isDisplay && now-lastMessage > 2000) $('connection').textContent = 'Controller disconnected — holding last view';
  }
  requestAnimationFrame(animate);
  if (!isDisplay) startTracking();
})();
