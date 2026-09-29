/* Physical coordinates in metres: +x right, +y up, +z from seam toward viewer. */
(function (root) {
  const q = Math.SQRT1_2;
  // Screen pair around a shared vertical seam. The origin is where the two
  // display planes meet; `angle` is the inside angle between the display
  // surfaces (degrees, 180 = flat), `gap` the straight-line distance between
  // the inner lit edges and `vOffset` how much higher the right panel sits.
  // Defaults reproduce the original 90-degree, gapless pair exactly.
  function screens(width, height, { angle = 90, gap = 0, vOffset = 0 } = {}) {
    if (angle === 90 && gap === 0 && vOffset === 0) {
      return [
        { name: 'left', pa: [-width*q, -height/2, width*q], pb: [0, -height/2, 0], pc: [-width*q, height/2, width*q] },
        { name: 'right', pa: [0, -height/2, 0], pb: [width*q, -height/2, width*q], pc: [0, height/2, 0] }
      ];
    }
    const half = angle*Math.PI/360, sin = Math.sin(half), cos = Math.cos(half);
    const inner = gap/(2*sin), outer = inner+width;
    const at = (sign, along, y) => [sign*sin*along, y, cos*along];
    const lo = -vOffset/2, ro = vOffset/2;
    return [
      { name: 'left', pa: at(-1, outer, lo-height/2), pb: at(-1, inner, lo-height/2), pc: at(-1, outer, lo+height/2) },
      { name: 'right', pa: at(1, inner, ro-height/2), pb: at(1, outer, ro-height/2), pc: at(1, inner, ro+height/2) }
    ];
  }
  // Signed distance (metres) from a point to a panel's plane; positive on the
  // viewing side.
  function planeDistance(screen, point) {
    const [ax, , az] = screen.pa, [bx, , bz] = screen.pb;
    const rx = bx-ax, rz = bz-az, length = Math.hypot(rx, rz);
    // normal = right x up with up = +y: (-rz, 0, rx)/|r|
    return ((point.x-ax)*-rz + (point.z-az)*rx)/length;
  }
  function inFront(point, pair, margin = 0) {
    return pair.every(screen => planeDistance(screen, point) >= margin);
  }
  // Angle helper: outer-edge distance D, gap g, width w -> inside angle.
  function angleFromOuterDistance(distance, width, gap = 0) {
    const s = (distance-gap)/(2*width);
    return s > 0 && s <= 1 ? 360*Math.asin(s)/Math.PI : NaN;
  }
  function outerDistance(angle, width, gap = 0) {
    return gap+2*width*Math.sin(angle*Math.PI/360);
  }
  function clampEye(eye) {
    const z = Math.max(.30, Math.min(.60, eye.z));
    // Remain on the inward-facing side of BOTH planes, even while leaning.
    const limit = Math.min(.18, z - .08);
    return { x: Math.max(-limit, Math.min(limit, eye.x)), y: Math.max(-.18, Math.min(.18, eye.y)), z };
  }
  function foreground(width, height, forward) {
    const z = Math.max(.06, Math.min(.16, forward));
    // The 1.8-unit-tall mannequin fits inside a unit bounding sphere. Keep that
    // sphere in front of both panels and fit the full height at the nearest eye.
    const size = Math.min(.095, z*.65, height*.8*(.30-z)/(.30*1.8), width*.22);
    return { z, size };
  }
  // Off-axis projection keeps each physical panel fixed while the eye translates.
  function project(THREE, camera, screen, eye, seamOverlap = 0) {
    const pa = new THREE.Vector3(...screen.pa), pb = new THREE.Vector3(...screen.pb), pc = new THREE.Vector3(...screen.pc);
    const right = pb.clone().sub(pa).normalize();
    const up = pc.clone().sub(pa).normalize();
    const normal = new THREE.Vector3().crossVectors(right, up).normalize();
    const va = pa.sub(eye), vb = pb.sub(eye), vc = pc.sub(eye);
    const distance = -va.dot(normal);
    const near = .005, far = 10;
    camera.position.copy(eye);
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    camera.updateMatrixWorld(true);
    camera.projectionMatrix.makePerspective(right.dot(va)*near/distance, right.dot(vb)*near/distance,
      up.dot(vc)*near/distance, up.dot(va)*near/distance, near, far);
    // Positive overlap pans each panel toward the seam, exposing shared content.
    // Offset only the horizontal center: scale, vertical alignment, and eye stay fixed.
    camera.projectionMatrix.elements[8] += (screen.name === 'left' ? 2 : -2)*seamOverlap;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  root.ConcaveGeometry = { screens, planeDistance, inFront, angleFromOuterDistance, outerDistance, clampEye, foreground, project };
})(typeof window === 'undefined' ? globalThis : window);
