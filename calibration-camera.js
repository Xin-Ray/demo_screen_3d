/* Camera auto-calibration (UX §4.3). v2.0 placeholder: selects and previews
   the calibration camera only. Detection and pose solving are tasks C2–C9. */
(function (root) {
  let stream = null;
  async function list(excludeId) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput' && d.deviceId && d.deviceId !== excludeId)
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i+1}` }));
  }
  async function preview(deviceId, video) {
    stop(video);
    if (!deviceId) return;
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
    video.srcObject = stream; video.hidden = false; await video.play();
  }
  function stop(video) {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (video) { video.srcObject = null; video.hidden = true; }
  }
  // Placeholder solver: returns no results until tasks C4–C6 land.
  function solve() { return null; }
  root.CalibrationCamera = { list, preview, stop, solve };
})(window);
