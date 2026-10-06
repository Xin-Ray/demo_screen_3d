"""Live iris depth on an Orbbec Femto Bolt: color and depth in one view.

The depth image is reprojected into the color camera with the factory
intrinsics and depth->color extrinsics, then blended over the color image.
MediaPipe's face landmarker finds the irises in the color image, and the depth
at each iris centre is read from the registered depth. As a cross-check, the
distance is also estimated from the iris size in pixels (the human iris is
~11.7 mm across, with little variation between adults).

    python iris_depth.py                       # widest view: 3840x2160 color, wide depth
    python iris_depth.py --depth-mode wide-binned   # wide depth at 30 fps instead of 15
    python iris_depth.py --width 1280 --height 720 --depth-mode narrow
    python iris_depth.py --alpha 0.3           # fainter depth overlay

Color is 79.5 x 50.5 deg at every 16:9 resolution (4:3 modes are a crop), so the
largest one gives the most detail at the widest view. Depth modes (--depth-mode):

    wide            1024x1024  118 x 118 deg  15 fps   ~0.25-2.2 m   (default)
    wide-binned      512x512   118 x 118 deg  30 fps   ~0.25-2.9 m
    narrow           640x576    73 x  65 deg  30 fps   ~0.5-3.9 m
    narrow-binned    320x288    73 x  65 deg  30 fps   ~0.5-5.5 m

Only wide depth covers the whole color image; narrow misses its left and right
edges. wide and narrow have the same detail per degree; the binned modes have half.

Keys: q/ESC quit, m cycle view (blend / depth / color), s save snapshot to captures/.

Needs the face landmarker model at models/face_landmarker.task (run_iris.sh
downloads it).
"""

import argparse
import os
import sys
import time

import cv2
import numpy as np

from charuco_demo import FrameGrabber, colorize_depth, intrinsics_from_profile, pick_color_profile, put_lines

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "face_landmarker.task")
DETECT_WIDTH = 1280         # run the face landmarker on a copy at most this wide
VIEW_SIZE = (1600, 900)     # max size of the displayed image
IRIS_DIAMETER_MM = 11.7     # horizontal visible iris diameter, adult average
# Face landmarker indices: centre, then 4 points on the iris edge (opposite pairs 1-3, 2-4).
# Right/left are the subject's, so the right eye is on the image left.
IRISES = (("R", (468, 469, 470, 471, 472)), ("L", (473, 474, 475, 476, 477)))
VIEW_MODES = ("blend", "depth", "color")
DEPTH_MODES = {"wide": (1024, 1024), "wide-binned": (512, 512),
               "narrow": (640, 576), "narrow-binned": (320, 288)}


# --------------------------------------------------------------------------- depth registration

def project(x, y, z, K, dist):
    """Camera points -> pixels with OpenCV's rational distortion model (k1 k2 p1 p2 k3 k4 k5 k6)."""
    k1, k2, p1, p2, k3, k4, k5, k6 = dist
    x, y = x / z, y / z
    r2 = x * x + y * y
    radial = (1 + r2 * (k1 + r2 * (k2 + r2 * k3))) / (1 + r2 * (k4 + r2 * (k5 + r2 * k6)))
    xy2 = 2 * x * y
    xd = x * radial + p1 * xy2 + p2 * (r2 + 2 * x * x)
    yd = y * radial + p1 * (r2 + 2 * y * y) + p2 * xy2
    return K[0, 0] * xd + K[0, 2], K[1, 1] * yd + K[1, 2]


class DepthRegistration:
    """Reprojects depth images into the color camera, at the size of the (scaled) color view.

    Each valid depth pixel is back-projected with the depth intrinsics, moved into
    the color camera with the factory extrinsics and projected with the color
    intrinsics. Where several land on one pixel the nearest wins. Depth pixels are
    splatted at a resolution no finer than the depth camera's own, so the result
    has no holes, then scaled up to the view.
    """

    def __init__(self, depth_profile, color_profile, view_size):
        Kd, dd = intrinsics_from_profile(depth_profile)
        Kc, dc = intrinsics_from_profile(color_profile)
        # float32 throughout: numpy 2 would promote to float64 for float64 scalars.
        self.Kc, self.dc = Kc.astype(np.float32), dc.astype(np.float32)
        ext = depth_profile.get_extrinsic_to(color_profile)
        self.R = np.array(ext.rot, dtype=np.float32).reshape(3, 3)
        self.t = np.array(ext.transform, dtype=np.float32)

        w, h = depth_profile.get_width(), depth_profile.get_height()
        u, v = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        grid = np.stack((u, v), -1).reshape(-1, 1, 2)
        # Unit-depth ray of every depth pixel, so a frame only needs ray * z.
        rays = cv2.undistortPoints(grid, Kd, dd).reshape(-1, 2)

        # Keep only the depth pixels that can land in the color image. The wide modes
        # see far more than the color camera, so this skips over half the work. A ray
        # is kept if it lands in the color image at the nearest or the farthest
        # range (with a margin); the 32 mm baseline makes the two differ slightly.
        # Rays that don't project back onto their own pixel are dropped too: in the
        # wide-mode corners, outside the lens's image circle, undistortion diverges.
        back_u, back_v = project(rays[:, 0], rays[:, 1], np.ones(len(rays), np.float32), Kd, dd)
        keep = np.hypot(back_u - grid[:, 0, 0], back_v - grid[:, 0, 1]) < 0.5
        lands = np.zeros_like(keep)
        cw, ch = color_profile.get_width(), color_profile.get_height()
        margin = 0.05 * cw
        for z in (200.0, 10000.0):
            x, y = rays[:, 0] * z, rays[:, 1] * z
            xc = self.R[0, 0] * x + self.R[0, 1] * y + self.R[0, 2] * z + self.t[0]
            yc = self.R[1, 0] * x + self.R[1, 1] * y + self.R[1, 2] * z + self.t[1]
            zc = self.R[2, 0] * x + self.R[2, 1] * y + self.R[2, 2] * z + self.t[2]
            pu, pv = project(xc, yc, zc, self.Kc, self.dc)
            lands |= (zc > 0) & (pu > -margin) & (pu < cw + margin) & (pv > -margin) & (pv < ch + margin)
        self.keep = np.flatnonzero(keep & lands)
        self.rays = rays[self.keep]

        self.view_size = view_size
        view_scale = view_size[0] / color_profile.get_width()
        splat_scale = min(1.0, Kd[0, 0] / (Kc[0, 0] * view_scale))
        self.size = (round(view_size[0] * splat_scale), round(view_size[1] * splat_scale))
        self.scale = view_scale * splat_scale      # color pixels -> splat pixels

    def __call__(self, depth_mm):
        """Depth in mm (depth camera) -> depth in mm along the color camera's Z, view-sized."""
        z = depth_mm.ravel()[self.keep]
        valid = z > 0
        z = z[valid]
        x, y = self.rays[valid].T * z
        # Per-component instead of a matmul and cv2.projectPoints: ~10x faster here.
        R, t = self.R, self.t
        xc = R[0, 0] * x + R[0, 1] * y + R[0, 2] * z + t[0]
        yc = R[1, 0] * x + R[1, 1] * y + R[1, 2] * z + t[1]
        zc = R[2, 0] * x + R[2, 1] * y + R[2, 2] * z + t[2]
        u, v = project(xc, yc, zc, self.Kc, self.dc)

        w, h = self.size
        # Pixel centres: color (u + 0.5) * scale = splat (u' + 0.5).
        u = np.rint((u + 0.5) * self.scale - 0.5).astype(np.int32)
        v = np.rint((v + 0.5) * self.scale - 0.5).astype(np.int32)
        inside = (u >= 0) & (u < w) & (v >= 0) & (v < h) & (zc > 0)
        out = np.full(w * h, np.inf, dtype=np.float32)
        np.minimum.at(out, v[inside] * w + u[inside], zc[inside])
        out = out.reshape(h, w)

        # Fill single-pixel gaps (rounding) with the nearest neighbouring depth.
        out = np.where(np.isinf(out), cv2.erode(out, np.ones((3, 3), np.uint8)), out)
        out[np.isinf(out)] = 0
        return cv2.resize(out, self.view_size, interpolation=cv2.INTER_NEAREST_EXACT)


# --------------------------------------------------------------------------- iris

def make_landmarker(model_path, max_faces):
    try:
        from mediapipe.tasks.python import BaseOptions, vision
    except ImportError as e:
        sys.exit(f"{e} - install mediapipe as described in README.md (Iris depth)")

    if not os.path.exists(model_path):
        sys.exit(f"no face landmarker model at {model_path} - run ./run_iris.sh once to download it")
    options = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=max_faces)
    return vision.FaceLandmarker.create_from_options(options)


def detect_irises(landmarker, image, timestamp_ms):
    """-> one dict per face: {"R"/"L": (5, 2) iris landmarks in full-resolution pixels}."""
    import mediapipe as mp

    h, w = image.shape[:2]
    s = min(1.0, DETECT_WIDTH / w)
    small = image if s == 1.0 else cv2.resize(image, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp_ms)
    faces = []
    for lms in result.face_landmarks:
        if len(lms) < 478:      # model without iris landmarks
            continue
        faces.append({name: np.array([[lms[i].x * w, lms[i].y * h] for i in idx]) for name, idx in IRISES})
    return faces


def iris_diameter_px(iris):
    return (np.linalg.norm(iris[1] - iris[3]) + np.linalg.norm(iris[2] - iris[4])) / 2


def depth_at(depth_view, centre, radius):
    """Median of the valid depth inside a square of half-size radius around centre (view pixels)."""
    if depth_view is None:
        return None
    r = max(int(radius), 1)
    u, v = int(round(centre[0])), int(round(centre[1]))
    patch = depth_view[max(v - r, 0):v + r + 1, max(u - r, 0):u + r + 1]
    valid = patch[patch > 0]
    return float(np.median(valid)) if valid.size else None


def measure_face(face, depth_view, view_scale, K, dist):
    """Per-iris depth, size-based distance and 3D centre (color camera frame, mm)."""
    eyes = {}
    for name, iris in face.items():
        d_px = iris_diameter_px(iris)
        # Inner part of the iris only, so eyelids and the eye corners don't leak in.
        z = depth_at(depth_view, iris[0] * view_scale, 0.35 * d_px * view_scale)
        xyz = None
        if z is not None:
            ray = cv2.undistortPoints(iris[0].reshape(1, 1, 2), K, dist).reshape(2)
            xyz = np.array([ray[0] * z, ray[1] * z, z])
        eyes[name] = dict(iris=iris, d_px=d_px, z=z, z_size=K[0, 0] * IRIS_DIAMETER_MM / d_px, xyz=xyz)
    return eyes


def draw_face(view, eyes, view_scale):
    s = max(view.shape[1] / 1280, 0.5)
    for e in eyes.values():
        c = e["iris"][0] * view_scale
        r = e["d_px"] / 2 * view_scale
        cv2.circle(view, np.round(c).astype(int), max(round(r), 2), (255, 255, 0), max(int(s), 1), cv2.LINE_AA)
        cv2.drawMarker(view, np.round(c).astype(int), (255, 255, 0), cv2.MARKER_CROSS, max(round(r / 2), 4), 1)
        text = "n/a" if e["z"] is None else f"{e['z']:.0f} mm"
        org = (round(c[0] - 30 * s), round(c[1] - r - 10 * s))
        cv2.putText(view, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.6 * s, (0, 0, 0), max(int(4 * s), 2), cv2.LINE_AA)
        cv2.putText(view, text, org, cv2.FONT_HERSHEY_SIMPLEX, 0.6 * s, (255, 255, 0), max(int(s), 1), cv2.LINE_AA)


def face_lines(eyes):
    lines = []
    for name in ("R", "L"):
        e = eyes[name]
        if e["xyz"] is None:
            lines.append(f"{name} iris: depth n/a   size est {e['z_size']:4.0f} mm")
        else:
            x, y, z = e["xyz"]
            lines.append(f"{name} iris: z={z:4.0f} mm  (x={x:+5.0f} y={y:+5.0f})   "
                         f"size est {e['z_size']:4.0f} mm  diff {z - e['z_size']:+4.0f}")
    if eyes["R"]["xyz"] is not None and eyes["L"]["xyz"] is not None:
        lines.append(f"interpupillary distance: {np.linalg.norm(eyes['R']['xyz'] - eyes['L']['xyz']):.1f} mm")
    return lines


# --------------------------------------------------------------------------- camera

def pick_depth_profile(pipeline, mode):
    """Y16 depth profile for a DEPTH_MODES name, at the highest frame rate it offers."""
    from pyorbbecsdk import OBFormat, OBSensorType

    w, h = DEPTH_MODES[mode]
    profiles = pipeline.get_stream_profile_list(OBSensorType.DEPTH_SENSOR)
    matches = [profiles[i] for i in range(len(profiles))
               if (profiles[i].get_width(), profiles[i].get_height()) == (w, h)
               and profiles[i].get_format() == OBFormat.Y16]
    if not matches:
        print(f"no {w}x{h} depth profile, using the default depth profile")
        return profiles.get_default_video_stream_profile()
    return max(matches, key=lambda p: p.get_fps())


def run(args):
    from pyorbbecsdk import Config, Context, OBFrameAggregateOutputMode, Pipeline

    landmarker = make_landmarker(args.model, args.max_faces)

    # Keep the Context alive: the device list and devices reference its device manager.
    ctx = Context()
    devices = ctx.query_devices()
    if devices.get_count() == 0:
        sys.exit("No Orbbec device found. Check the USB-C cable (USB 3 port) and that the "
                 "udev rules are installed (scripts/install_udev_rules.sh).")
    device = devices.get_device_by_index(0)
    info = device.get_device_info()
    print(f"device: {info.get_name()}  serial: {info.get_serial_number()}  "
          f"fw: {info.get_firmware_version()}  usb: {info.get_connection_type()}")
    if info.get_connection_type().startswith("USB2"):
        print("warning: connected over USB 2 - use a USB 3 port/cable for full depth frame rate")

    pipeline = Pipeline(device)
    config = Config()
    color_profile = pick_color_profile(pipeline, args.width, args.height, args.fps)
    depth_profile = pick_depth_profile(pipeline, args.depth_mode)
    config.enable_stream(color_profile)
    config.enable_stream(depth_profile)
    # Deliver each frame as soon as it arrives instead of holding color back for depth.
    config.set_frame_aggregate_output_mode(OBFrameAggregateOutputMode.DISABLE)
    print(f"color: {color_profile.get_width()}x{color_profile.get_height()} "
          f"{color_profile.get_format()} @ {color_profile.get_fps()} fps")
    print(f"depth: {depth_profile.get_width()}x{depth_profile.get_height()} "
          f"{depth_profile.get_format()} @ {depth_profile.get_fps()} fps  ({args.depth_mode})")
    K, dist = intrinsics_from_profile(color_profile)

    w, h = color_profile.get_width(), color_profile.get_height()
    view_scale = min(1.0, VIEW_SIZE[0] / w, VIEW_SIZE[1] / h)
    view_size = (round(w * view_scale), round(h * view_scale))
    register = DepthRegistration(depth_profile, color_profile, view_size)

    pipeline.start(config)
    grabber = FrameGrabber(pipeline)
    grabber.start()
    win = "Femto Bolt iris depth  |  q/ESC quit, m view, s save"
    # Fixed-size window, see charuco_demo.py: a resizable one gets rescaled every frame.
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE | cv2.WINDOW_GUI_NORMAL)
    os.makedirs("captures", exist_ok=True)
    mode = 0
    depth_src = depth_view = depth_vis = None
    t_prev = time.time()
    last_ts = -1
    fps = 0.0
    try:
        while True:
            image, depth_mm, stamp_us = grabber.latest()
            if image is None:
                if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                    break
                continue

            # VIDEO mode needs strictly increasing timestamps.
            ts = max(int(stamp_us // 1000), last_ts + 1)
            last_ts = ts
            faces = detect_irises(landmarker, image, ts)

            color_view = image if view_scale == 1.0 else cv2.resize(
                image, view_size, interpolation=cv2.INTER_AREA)
            # Depth arrives slower than color (15 fps in wide mode): register each depth frame once.
            if depth_mm is not None and depth_mm is not depth_src:
                depth_src = depth_mm
                depth_view = register(depth_mm)
                depth_vis = colorize_depth(depth_view)
            if depth_view is None or VIEW_MODES[mode] == "color":
                view = color_view.copy()
            elif VIEW_MODES[mode] == "depth":
                view = depth_vis.copy()
            else:
                view = cv2.addWeighted(color_view, 1 - args.alpha, depth_vis, args.alpha, 0)
                # Keep the plain color image where there is no depth (cv2.copyTo: a numpy
                # boolean-mask copy takes ~30 ms here).
                cv2.copyTo(color_view, cv2.compare(depth_view, 0, cv2.CMP_EQ), view)

            lines = [f"faces: {len(faces)}   view: {VIEW_MODES[mode]}"
                     + ("" if depth_view is not None else "   (waiting for depth)")]
            for face in faces:
                eyes = measure_face(face, depth_view, view_scale, K, dist)
                draw_face(view, eyes, view_scale)
                lines += face_lines(eyes)

            now = time.time()
            fps = 0.9 * fps + 0.1 / max(now - t_prev, 1e-6)
            t_prev = now
            lines.append(f"{fps:4.1f} fps   latency {now * 1000 - stamp_us / 1000:3.0f} ms")
            put_lines(view, lines)

            cv2.imshow(win, view)
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord("q")):
                break
            if key == ord("m"):
                mode = (mode + 1) % len(VIEW_MODES)
            if key == ord("s"):
                stamp = time.strftime("%Y%m%d_%H%M%S")
                cv2.imwrite(f"captures/{stamp}_iris_raw.png", image)
                cv2.imwrite(f"captures/{stamp}_iris_view.png", view)
                if depth_view is not None:
                    # Registered depth, mm, same size as the view.
                    cv2.imwrite(f"captures/{stamp}_iris_depth_mm.png", depth_view.astype(np.uint16))
                print(f"saved captures/{stamp}_iris_*.png")
    finally:
        grabber.stop()
        pipeline.stop()
        landmarker.close()
        cv2.destroyAllWindows()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--width", type=int, default=0, help="color width (default 0 = largest available)")
    p.add_argument("--height", type=int, default=0, help="color height (default 0 = largest available)")
    p.add_argument("--fps", type=int, default=30, help="color frame rate")
    p.add_argument("--depth-mode", choices=DEPTH_MODES, default="wide",
                   help="depth resolution / field of view (default: wide, see above)")
    p.add_argument("--alpha", type=float, default=0.5, help="depth overlay opacity in blend view")
    p.add_argument("--max-faces", type=int, default=1)
    p.add_argument("--model", default=MODEL_PATH, help="MediaPipe face landmarker .task file")
    run(p.parse_args())


if __name__ == "__main__":
    main()
