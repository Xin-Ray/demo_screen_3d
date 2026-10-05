/* Simulated accuracy check of the webcam eye tracker (shared by the Home page and the Node test). */
(function (root) {
  const WIDTH_PX = 1920, IRIS = .0117, aspect = 16/9;
  const base = {x: 0, y: .6, z: 0, yaw: 0, tilt: 25, fov: 60};
  const calibEye = {x: 0, y: 0, z: 1.0};
  const DISTANCES = [.4, .6, .8, 1.0, 1.5, 2.0, 2.5];
  const dot = (a, b) => a.reduce((s, x, i) => s+x*b[i], 0);

  function project(T, eye, pose, irisPx) {
    const axes = T.basis(pose), delta = [eye.x-pose.x, eye.y-pose.y, eye.z-pose.z];
    const depth = dot(delta, axes.forward), focal = 1/(2*Math.tan(pose.fov*Math.PI/360));
    let iris = focal*IRIS/depth;
    if (irisPx) iris = irisPx(iris*WIDTH_PX)/WIDTH_PX;
    return {x: .5+focal*dot(delta, axes.right)/depth, y: .5-focal*aspect*dot(delta, axes.up)/depth, iris, aspect};
  }
  // Worst 3-D eye error (cm) per distance for one error scenario.
  function scenario(T, {truePose = base, cfgPose = base, sliderScale = 1, irisPx} = {}) {
    const s0 = project(T, calibEye, truePose);
    const slider = Math.hypot(calibEye.x-truePose.x, calibEye.y-truePose.y, calibEye.z-truePose.z)*sliderScale;
    const reference = {...s0, pose: cfgPose, eye: T.eyeFromSample(s0, cfgPose, slider)};
    return DISTANCES.map(z => {
      let worst = 0;
      for (const x of [-.2, 0, .2]) for (const y of [-.1, 0, .1]) {
        const got = T.estimate(project(T, {x, y, z}, truePose, irisPx), reference);
        worst = Math.max(worst, got ? Math.hypot(got.x-x, got.y-y, got.z-z)*100 : Infinity);
      }
      return worst;
    });
  }
  function run(T = root.PortraitTracking) {
    const rows = [
      ['All settings correct', scenario(T)],
      ['FOV set 60°, real 68°', scenario(T, {truePose: {...base, fov: 68}})],
      ['Tilt 5° off', scenario(T, {truePose: {...base, tilt: 30}})],
      ['Slider 10% too large', scenario(T, {sliderScale: 1.1})],
      ['Slider 10% too small', scenario(T, {sliderScale: .9})],
      ['Iris rounded to whole pixels', scenario(T, {irisPx: px => Math.round(px)})],
      ['Iris measured +1 px too large', scenario(T, {irisPx: px => px+1})]
    ];
    const irisAt = z => project(T, {x: 0, y: 0, z}, base).iris*WIDTH_PX;
    return {distances: DISTANCES.map(d => d*100), calibration: 100, rows, irisPx: {100: irisAt(1), 250: irisAt(2.5)}};
  }
  root.TrackingAccuracy = {run};
  if (typeof module !== 'undefined') module.exports = {run};
})(typeof window === 'undefined' ? globalThis : window);
