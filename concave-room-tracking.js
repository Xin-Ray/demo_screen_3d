/* Pose-aware iris reconstruction; camera coordinates in metres, angles in degrees. */
(function(root) {
  function basis(pose) {
    const yaw = pose.yaw*Math.PI/180, tilt = pose.tilt*Math.PI/180;
    return {
      forward: [Math.sin(yaw)*Math.cos(tilt), -Math.sin(tilt), Math.cos(yaw)*Math.cos(tilt)],
      right: [-Math.cos(yaw), 0, Math.sin(yaw)],
      up: [Math.sin(yaw)*Math.sin(tilt), Math.cos(tilt), Math.cos(yaw)*Math.sin(tilt)]
    };
  }
  function estimate(sample, reference) {
    if (!sample || !reference || Math.abs(sample.aspect-reference.aspect) > .01) return null;
    const ratio = reference.iris/sample.iris;
    if (!Number.isFinite(ratio) || ratio < .35 || ratio > 3) return null;
    const {pose, eye: anchor} = reference, axes = basis(pose);
    const delta = [anchor.x-pose.x, anchor.y-pose.y, anchor.z-pose.z];
    const dot = axis => delta.reduce((sum,v,i) => sum+v*axis[i],0);
    const depth = dot(axes.forward)*ratio;
    if (depth <= .05) return null;
    const focal = 1/(2*Math.tan(pose.fov*Math.PI/360));
    const horizontal = dot(axes.right)*ratio+(sample.x-reference.x)*depth/focal;
    const vertical = dot(axes.up)*ratio-(sample.y-reference.y)*depth/(focal*sample.aspect);
    const eye = {};
    ['x','y','z'].forEach((key,i) => { eye[key] = pose[key]+axes.forward[i]*depth+axes.right[i]*horizontal+axes.up[i]*vertical; });
    return Object.values(eye).every(Number.isFinite) ? eye : null;
  }
  function eyeFromSample(sample, pose, range) {
    if (!sample || ![sample.x,sample.y,sample.aspect,pose.x,pose.y,pose.z,pose.yaw,pose.tilt,pose.fov,range].every(Number.isFinite)
      || range <= 0 || sample.aspect <= 0 || pose.fov <= 0 || pose.fov >= 180) return null;
    const axes = basis(pose), focal = 1/(2*Math.tan(pose.fov*Math.PI/360));
    const horizontal = (sample.x-.5)/focal, vertical = (.5-sample.y)/(focal*sample.aspect);
    const scale = range/Math.hypot(horizontal,vertical,1), eye = {};
    ['x','y','z'].forEach((key,i) => { eye[key] = pose[key]+scale*(axes.forward[i]+horizontal*axes.right[i]+vertical*axes.up[i]); });
    return eye;
  }
  function validEye(eye) {
    // Both inward-facing panel half-spaces: z+x > 0 and z-x > 0.
    return eye && [eye.x,eye.y,eye.z].every(Number.isFinite)
      && Math.max(Math.abs(eye.x),Math.abs(eye.y),Math.abs(eye.z)) < 10
      && eye.z-Math.abs(eye.x) >= .03;
  }
  function smoothEye(current, target, seconds, response = .18) {
    // Time-based response (default 180 ms), independent of inference/render rate. Ignore sub-2 mm noise.
    const alpha = 1-Math.exp(-Math.max(0, Math.min(seconds,.1))/response);
    const next = {};
    for (const axis of ['x','y','z']) {
      const delta = target[axis]-current[axis];
      const filtered = Math.sign(delta)*Math.max(0,Math.abs(delta)-.002);
      next[axis] = current[axis]+filtered*alpha;
    }
    return next;
  }
  // Speed-adaptive low-pass (One Euro): steady when still, responsive when moving. steadiness 0..100.
  function createSteadyFilter(steadiness = 50) {
    const minCutoff = 3-2.6*Math.max(0, Math.min(100, steadiness))/100, beta = 4, dCutoff = 1;
    const alpha = (cutoff, dt) => 1/(1+1/(2*Math.PI*cutoff)/dt);
    let last = null;
    return {
      reset() { last = null; },
      apply(eye, seconds) {
        const dt = Math.max(.001, Math.min(seconds, .2));
        if (!last) { last = {value: {...eye}, speed: {x: 0, y: 0, z: 0}}; return {...eye}; }
        const out = {};
        for (const axis of ['x','y','z']) {
          const raw = (eye[axis]-last.value[axis])/dt;
          last.speed[axis] += alpha(dCutoff, dt)*(raw-last.speed[axis]);
          const cutoff = minCutoff+beta*Math.abs(last.speed[axis]);
          out[axis] = last.value[axis] += alpha(cutoff, dt)*(eye[axis]-last.value[axis]);
        }
        return out;
      }
    };
  }
  root.PortraitTracking = { basis, estimate, eyeFromSample, validEye, smoothEye, createSteadyFilter };
})(typeof window === 'undefined' ? globalThis : window);
