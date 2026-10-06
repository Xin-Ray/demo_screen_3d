#!/usr/bin/env python3
"""depth-rgb eye tracking helper for concave-room.html (UX §4.2, Eye detector).

Runs the colour + depth iris algorithm from
sub-features/femto_bolt_charuco/iris_depth.py on an Orbbec Femto Bolt without a
window, and serves the eye position to the browser:

    GET /events        Server-Sent Events, one JSON message per colour frame
    GET /eye           the latest message as JSON
    GET /preview.mjpg  small live colour image with the iris overlay

The eye is the midpoint of both irises in the colour camera frame (OpenCV
axes: x right, y down, z forward), in metres. Per eye the measured depth is
used; where it is missing or disagrees with the iris-size distance by more than
--max-diff, the iris-size distance is used instead.

sub-features/ belongs to other contributors: it is imported read-only and must
not be changed (no __pycache__ is written there either).

    bash tools/run_depth_rgb.sh                       # 1920x1080 colour, wide-binned depth (30 fps)
    bash tools/run_depth_rgb.sh --depth-mode wide     # finer depth at 15 fps
"""

import sys
sys.dont_write_bytecode = True  # keep sub-features/ free of __pycache__

import argparse
import json
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sub-features", "femto_bolt_charuco"))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import iris_depth  # noqa: E402
from charuco_demo import FrameGrabber, intrinsics_from_profile, pick_color_profile  # noqa: E402

MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
             "face_landmarker/float16/latest/face_landmarker.task")
MODEL_PATH = os.path.join(os.path.expanduser("~"), ".cache", "demo_screen_3d", "face_landmarker.task")
PREVIEW_WIDTH = 640


class Latest:
    """Newest message and preview JPEG, shared with the HTTP threads."""

    def __init__(self):
        self.cond = threading.Condition()
        self.seq, self.message, self.jpeg = 0, None, None

    def publish(self, message, jpeg):
        with self.cond:
            self.seq += 1
            self.message, self.jpeg = json.dumps(message), jpeg
            self.cond.notify_all()

    def wait(self, seq, timeout=1.0):
        with self.cond:
            self.cond.wait_for(lambda: self.seq != seq, timeout)
            return self.seq, self.message, self.jpeg


def fuse(eyes, K, dist, max_diff):
    """Per-eye depth (or iris-size fallback) -> midpoint in metres, plus per-eye details."""
    points, details = [], {}
    for name, e in eyes.items():
        z_depth, z_size = e["z"], e["z_size"]
        use_depth = z_depth is not None and abs(z_depth - z_size) <= max_diff * z_size
        z = z_depth if use_depth else z_size
        ray = cv2.undistortPoints(e["iris"][0].reshape(1, 1, 2), K, dist).reshape(2)
        points.append((ray[0] * z, ray[1] * z, z))
        details[name] = {"depth_mm": None if z_depth is None else round(z_depth),
                         "size_mm": round(z_size), "source": "depth" if use_depth else "size"}
    x, y, z = np.mean(points, axis=0) / 1000
    return {"x": float(x), "y": float(y), "z": float(z)}, details


def serve(latest, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def head(self, content_type):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

        def do_GET(self):
            path = self.path.split("?")[0]
            try:
                if path == "/eye":
                    self.head("application/json")
                    self.wfile.write((latest.message or "null").encode())
                elif path == "/events":
                    self.head("text/event-stream")
                    seq = -1
                    while True:
                        new, message, _ = latest.wait(seq)
                        if new == seq:
                            self.wfile.write(b": keep-alive\n\n")
                        else:
                            seq = new
                            self.wfile.write(f"data: {message}\n\n".encode())
                        self.wfile.flush()
                elif path == "/preview.mjpg":
                    self.head("multipart/x-mixed-replace; boundary=frame")
                    seq, last = -1, 0.0
                    while True:
                        seq, _, jpeg = latest.wait(seq)
                        if jpeg is None or time.time() - last < 1 / 15:
                            continue
                        last = time.time()
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n"
                                         + f"Content-Length: {len(jpeg)}\r\n\r\n".encode() + jpeg + b"\r\n")
                        self.wfile.flush()
                else:
                    self.send_error(404)
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"depth-rgb helper on http://localhost:{port}  (/events, /eye, /preview.mjpg)")


def ensure_model(path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"downloading {MODEL_URL}")
        urllib.request.urlretrieve(MODEL_URL, path + ".part")
        os.replace(path + ".part", path)
    return path


def run(args):
    from pyorbbecsdk import Config, Context, OBFrameAggregateOutputMode, Pipeline

    landmarker = iris_depth.make_landmarker(ensure_model(args.model), 1)
    ctx = Context()  # keep alive: the device list references its device manager
    devices = ctx.query_devices()
    if devices.get_count() == 0:
        sys.exit("No Orbbec device found. Check the USB 3 cable and the udev rules "
                 "(sub-features/femto_bolt_charuco/README.md, Setup).")
    pipeline = Pipeline(devices.get_device_by_index(0))
    config = Config()
    color_profile = pick_color_profile(pipeline, args.width, args.height, args.fps)
    depth_profile = iris_depth.pick_depth_profile(pipeline, args.depth_mode)
    config.enable_stream(color_profile)
    config.enable_stream(depth_profile)
    config.set_frame_aggregate_output_mode(OBFrameAggregateOutputMode.DISABLE)
    K, dist = intrinsics_from_profile(color_profile)
    w, h = color_profile.get_width(), color_profile.get_height()
    print(f"color {w}x{h} @ {color_profile.get_fps()} fps, depth {args.depth_mode}")

    # Register depth at the landmark detection size: finer would only cost time.
    view_scale = min(1.0, iris_depth.DETECT_WIDTH / w)
    view_size = (round(w * view_scale), round(h * view_scale))
    register = iris_depth.DepthRegistration(depth_profile, color_profile, view_size)
    preview_scale = PREVIEW_WIDTH / view_size[0]

    latest = Latest()
    serve(latest, args.port)
    pipeline.start(config)
    grabber = FrameGrabber(pipeline)
    grabber.start()
    depth_src = depth_view = None
    last_ts, fps, t_prev = -1, 0.0, time.time()
    try:
        while True:
            image, depth_mm, stamp_us = grabber.latest()
            if image is None:
                continue
            ts = max(int(stamp_us // 1000), last_ts + 1)  # VIDEO mode needs increasing timestamps
            last_ts = ts
            faces = iris_depth.detect_irises(landmarker, image, ts)
            if depth_mm is not None and depth_mm is not depth_src:
                depth_src, depth_view = depth_mm, register(depth_mm)

            now = time.time()
            fps = 0.9 * fps + 0.1 / max(now - t_prev, 1e-6)
            t_prev = now
            message = {"t": now, "faces": len(faces), "eye": None, "eyes": None, "depth": depth_view is not None,
                       "fps": round(fps, 1), "latency_ms": round(now * 1000 - stamp_us / 1000)}
            preview = cv2.resize(image, None, fx=view_scale * preview_scale, fy=view_scale * preview_scale,
                                 interpolation=cv2.INTER_AREA)
            if faces:
                eyes = iris_depth.measure_face(faces[0], depth_view, view_scale, K, dist)
                message["eye"], message["eyes"] = fuse(eyes, K, dist, args.max_diff)
                iris_depth.draw_face(preview, eyes, view_scale * preview_scale)
            lines = [f"depth-rgb  {fps:4.1f} fps" + ("" if depth_view is not None else "  (waiting for depth)")]
            for name, e in (message["eyes"] or {}).items():
                lines.append(f"{name}: {e['source']}  depth {e['depth_mm'] or 'n/a'}  size {e['size_mm']} mm")
            for i, text in enumerate(lines):
                cv2.putText(preview, text, (8, 20 + 18 * i), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(preview, text, (8, 20 + 18 * i), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 0), 1, cv2.LINE_AA)
            latest.publish(message, cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes())
    except KeyboardInterrupt:
        pass
    finally:
        grabber.stop()
        pipeline.stop()
        landmarker.close()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8766)
    p.add_argument("--width", type=int, default=1920, help="color width (0 = largest)")
    p.add_argument("--height", type=int, default=1080, help="color height (0 = largest)")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--depth-mode", choices=iris_depth.DEPTH_MODES, default="wide-binned",
                   help="see iris_depth.py; wide-binned = 30 fps, wide = finer at 15 fps")
    p.add_argument("--max-diff", type=float, default=0.25,
                   help="use an eye's depth only within this fraction of its iris-size distance")
    p.add_argument("--model", default=MODEL_PATH, help="MediaPipe face landmarker .task file")
    run(p.parse_args())


if __name__ == "__main__":
    main()
