/* Saved screen-pair profile (UX §3). Units in the profile: cm and degrees. */
(function (root) {
  const KEY = 'concave-room-profile-v2';
  const FIELDS = {
    screen: {
      width: [33.6, 20, 150], height: [59.8, 30, 250], angle: [90, 30, 180],
      gap: [1.5, 0, 20], vOffset: [0, -20, 20], seamSplit: [50, 20, 80]
    },
    trackingCamera: {
      top: [3, -250, 100], forward: [0, -50, 100], tilt: [25, -60, 80], fov: [60, 30, 120],
      yaw: [0, -80, 80], x: [0, -150, 150]
    },
    advanced: { overlap: [0, -20, 20], smoothingMs: [180, 20, 1000], steadiness: [50, 0, 100] },
    // Panda size; open-front box (boxForward = the opening's z from the seam line,
    // + toward the viewer); cut box (cut by the screen planes, cutDepth = back wall behind the seam).
    scene: { boxWidth: [54, 10, 300], boxHeight: [55, 10, 300], boxForward: [-10, -100, 30], pandaScale: [100, 10, 300], pandaForward: [8, -100, 30],
      cutWidth: [40, 10, 300], cutHeight: [50, 10, 300], cutDepth: [60, 10, 300] }
  };
  const MODELS = ['panda', 'cube', 'sphere'], BOX_SCENES = ['cut', 'open'], DETECTORS = ['two-stage', 'fullframe', 'landmarker', 'depth-rgb'];
  function defaults() {
    const profile = { version: 2, calibratedAt: null, trackingDeviceId: '', model: 'panda', detector: 'two-stage', boxScene: 'cut' };
    for (const [group, fields] of Object.entries(FIELDS)) {
      profile[group] = {};
      for (const [key, [value]] of Object.entries(fields)) profile[group][key] = value;
    }
    return profile;
  }
  // Merge untrusted input over defaults, keeping only known, in-range numbers.
  function sanitize(input) {
    const profile = defaults();
    if (!input || typeof input !== 'object') return profile;
    for (const [group, fields] of Object.entries(FIELDS)) {
      for (const [key, [, min, max]] of Object.entries(fields)) {
        const value = Number(input[group]?.[key]);
        if (input[group]?.[key] !== undefined && Number.isFinite(value) && value >= min && value <= max) profile[group][key] = value;
      }
    }
    if (typeof input.calibratedAt === 'string' && !Number.isNaN(Date.parse(input.calibratedAt))) profile.calibratedAt = input.calibratedAt;
    if (MODELS.includes(input.model)) profile.model = input.model;
    if (DETECTORS.includes(input.detector)) profile.detector = input.detector;
    if (BOX_SCENES.includes(input.boxScene)) profile.boxScene = input.boxScene;
    if (typeof input.trackingDeviceId === 'string') profile.trackingDeviceId = input.trackingDeviceId.slice(0, 256);
    return profile;
  }
  function inRange(group, key, value) {
    const [, min, max] = FIELDS[group][key];
    return Number.isFinite(value) && value >= min && value <= max;
  }
  function load(storage) {
    try { const raw = storage?.getItem(KEY); return raw ? { profile: sanitize(JSON.parse(raw)), saved: true } : { profile: defaults(), saved: false }; }
    catch { return { profile: defaults(), saved: false }; }
  }
  function save(storage, profile) {
    try { storage?.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
  }
  // Geometry in metres for ConcaveGeometry.screens().
  function geometry(profile) {
    const s = profile.screen;
    return { width: s.width/100, height: s.height/100,
      options: { angle: s.angle, gap: s.gap/100, vOffset: s.vOffset/100 } };
  }
  // Tracking camera pose in metres/degrees, measured from the corner line.
  // Height is above the top of the higher panel.
  function cameraPose(profile) {
    const s = profile.screen, c = profile.trackingCamera;
    return { x: c.x/100, y: (s.height/2+Math.abs(s.vOffset)/2+c.top)/100, z: c.forward/100,
      yaw: c.yaw, tilt: c.tilt, fov: c.fov };
  }
  root.RoomProfile = { KEY, MODELS, BOX_SCENES, DETECTORS, FIELDS, defaults, sanitize, inRange, load, save, geometry, cameraPose };
})(typeof window === 'undefined' ? globalThis : window);
