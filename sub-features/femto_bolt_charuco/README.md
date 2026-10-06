# Femto Bolt ChArUco demo

Live ChArUco board detection and 6-DoF board pose on an Orbbec Femto Bolt,
using the camera's factory color intrinsics (no calibration step needed).

## Board

`boards/charuco_a4_7x5_38mm_4x4.pdf` is a 7x5-square board with 38 mm squares,
28 mm markers and `DICT_4X4_50`. Print it at **100% / actual size** on A4, then
check that 7 squares measure 266 mm. If they don't, pass the measured size with
`--square` and `--marker` (in metres). Defaults are set in `board.py`.

## Setup

1. Install the udev rules once (system-wide; covers all users):

   ```bash
   sudo ./scripts/install_udev_rules.sh            # iotlabg1robot + iotlab3d
   ```

   Then unplug and replug the camera. Plug it into a **USB 3** port with the
   USB-C data cable; the Femto Bolt also needs its 12 V power supply unless
   the port supplies enough power.

2. Python environment (already created on this machine as conda env `femto_bolt`):

   ```bash
   conda create -n femto_bolt python=3.12
   conda activate femto_bolt
   pip install -r requirements.txt
   ```

   Install only `opencv-python`, not `opencv-contrib-python` as well. Both
   provide `cv2` and conflict. ArUco/ChArUco is in the main package.

## Run

`./run_demo.sh` runs the demo with the `femto_bolt` env's Python, no activation
needed, and passes its arguments through. `./run_depth.sh` does the same with
depth enabled (`--depth`): a second window shows the colorized depth image
(near red, far blue, 0-5 m, no data black) with the detected board outline and
centre projected into it. Or directly:

```bash
conda activate femto_bolt
python charuco_demo.py                  # largest color resolution (3840x2160), pose overlay
python charuco_demo.py --depth          # + depth-vs-pose distance check at board centre
python charuco_demo.py --width 1280 --height 720   # lower resolution, higher frame rate
python charuco_demo.py --image photo.png    # offline, no camera
```

Keys: `q`/`Esc` quit, `s` saves raw and overlay frames to `captures/`.

The overlay shows detected markers, the interpolated ChArUco corners (24 when the
whole board is visible) and the board frame axes (origin at the top-left
chessboard corner, X red, Y green, Z blue). The translation is the board
origin in the color camera frame, in mm.

## Iris depth

`./run_iris.sh` (`iris_depth.py`) shows color and depth in one window. The depth
image is reprojected into the color camera with the factory calibration and
blended over it. MediaPipe's face landmarker finds the irises, and the overlay
shows the depth at each iris centre. It also shows the iris 3D position in the
color camera frame, the interpupillary distance, and, as a cross-check, the
distance estimated from the iris size in pixels (the adult iris is ~11.7 mm
across). Keys: `q`/`Esc` quit, `m` cycles the view (blend / depth / color),
`s` saves raw, view and registered depth (mm, 16-bit PNG) to `captures/`.

```bash
./run_iris.sh                              # widest view: 3840x2160 color + wide depth
./run_iris.sh --depth-mode wide-binned     # wide depth at 30 fps instead of 15
./run_iris.sh --width 1280 --height 720 --depth-mode narrow
./run_iris.sh --alpha 0.3 --max-faces 2
```

By default it uses the widest view the camera has, at the highest resolution. The
display runs at 30 fps in every depth mode.

| Color | Field of view | |
|---|---|---|
| 3840x2160, 2560x1440, 1920x1080, 1280x720 (16:9) | 79.5° x 50.5° | default: 3840x2160 |
| 2880x2160, 1280x960 (4:3) | 64.0° x 50.5° | a crop of 16:9, narrower |

| `--depth-mode` | Resolution | Field of view | fps | Range |
|---|---|---|---|---|
| `wide` (default) | 1024x1024 | 118° x 118° | 15 | ~0.25–2.2 m |
| `wide-binned` | 512x512 | 118° x 118° | 30 | ~0.25–2.9 m |
| `narrow` | 640x576 | 72.9° x 65.5° | 30 | ~0.5–3.9 m |
| `narrow-binned` | 320x288 | 72.9° x 65.5° | 30 | ~0.5–5.5 m |

Only the wide modes cover the whole color image; narrow misses its left and right
edges. Wide adds width, not detail: `wide` and `narrow` both have about 8.5 depth
pixels per degree (the same focal length, 505 px), while the binned modes have half
that. The trade-off is `wide` (full detail, 15 fps) against `wide-binned` (30 fps,
coarser). The wide modes don't reach far walls, which is fine for faces.

The first run downloads the face landmarker model to `models/face_landmarker.task`.
MediaPipe has to be installed without its dependencies: it depends on
`opencv-contrib-python`, which conflicts with `opencv-python` (see Setup).

```bash
conda activate femto_bolt
pip install --no-deps mediapipe==1.0.1
pip install "absl-py~=2.3" "flatbuffers~=25.9" certifi matplotlib "sounddevice~=0.5"
```

`pip check` then reports the missing `opencv-contrib-python`; that is expected.
ToF depth on the eye itself can be noisy or missing (shown as `n/a`), since
the cornea is specular. The value is the median over the inner part of the iris.

### How it works

**Where the iris depth comes from.** The depth camera measures it. MediaPipe's iris
detection only says where in the image to read the depth; it doesn't measure depth.

1. MediaPipe finds the iris centre and four points on the iris edge in the color image.
2. The depth image is aligned to the color image (see below).
3. The iris depth is the median of the valid aligned depth in a small square over the
   inner part of the iris (`measure_face` in `iris_depth.py`). The inner part leaves out
   eyelids and eye corners. This is the `z=` value in the panel and the mm label above
   each eye.
4. The iris 3D position (`x`, `y`) and the interpupillary distance follow from that
   depth and the color camera intrinsics.

**Iris-size estimate (cross-check only).** The iris width in pixels `d` is measured
from the landmarks. The distance is then `fx * 11.7 mm / d`, assuming the adult
average iris diameter of 11.7 mm. The panel shows it as `size est`; `diff` is the
depth-camera value minus this estimate. It never replaces or changes the measured
depth. When the depth camera has no value at the eye, the panel shows `depth n/a`
and the estimate is still shown. It is rough: real irises vary by about ±0.5 mm
(±4%), and the iris looks narrower when the head is turned.

**Spatial alignment (registration).** The depth camera has its own lens and sits
~32 mm beside the color camera, tilted ~6°. So the same pixel position does not show
the same spot in the two images. For each depth frame (`DepthRegistration`):

1. Each depth pixel is turned into a 3D point using the factory depth intrinsics and
   distortion. Each pixel's unit-depth ray is computed once at startup, so per frame
   this is just ray x measured depth.
2. The point is moved into the color camera frame with the factory depth->color
   extrinsics (rotation and translation between the cameras).
3. It is projected into the color image with the color intrinsics and distortion.
4. Where several points land on one pixel, the nearest wins (z-buffer). Points are
   splatted at a resolution no finer than the depth camera's own, so there are no
   holes. Single-pixel gaps from rounding are filled from the nearest neighbouring
   depth, and the result is scaled to the display size.

In the wide modes, depth pixels that can't land in the color image are skipped. They
are found once at startup, at 0.2 m and 10 m range. That leaves ~350k of the 1M
`wide` pixels. Pixels outside the lens's image circle are skipped too, since their
undistortion diverges. This takes ~8 ms per depth frame for `wide`, ~3 ms for
`wide-binned` and ~10 ms for `narrow`. The projection is written out in numpy
because `cv2.projectPoints` took ~70 ms for ~120k points. Checked against the SDK's
`AlignFilter` on live frames: no pixel offset, and the overlays line up on every edge.

**Time alignment: none, newest of each.** `FrameGrabber` keeps the newest color frame
and the newest depth frame separately, and each displayed frame pairs them without
comparing timestamps. The SDK's frame aggregation is off, as with
`charuco_demo.py --depth`, because otherwise the SDK holds color back while it waits
for a matching depth frame (~0.5 s over USB 2). So depth can be up to one depth
frame older or newer than the color image: ~67 ms in `wide` (15 fps), ~33 ms in the
30 fps modes, and more over USB 2, where depth runs at ~7 fps. For a still head this doesn't matter. With fast head motion the
iris can be a few mm away from where the depth was measured during that gap, so the
reading can briefly come from the eyelid or skin.

Ways to tighten this (not implemented):

- **Show the gap:** record the depth timestamp and show the color-depth time
  difference in the overlay.
- **Pair by timestamp (recommended):** keep the last few depth frames and use the one
  closest in time to each color frame. No extra latency.
- **SDK pairing:** turn frame aggregation back on (`FULL_FRAME_REQUIRE`). Best
  matching, but adds latency; this was bad over USB 2 and is untested over USB 3.

## Troubleshooting

- `lsusb -d 2bc5:` should list `2bc5:066b ... Femto Bolt`. If not, it's cabling or power, not software.
- `python scripts/check_camera.py` (no display needed) prints the device, its USB link and the
  frame rates the camera delivers for color, depth and both together.
- The demo prints `usb: USB3.x` at start-up. On `USB2.x` color still runs at full rate, but
  depth drops to ~7 fps and the SDK log shows `Frame data size error`. Use a USB 3 port and
  a USB 3 C cable.
- Frame rate and latency: color is MJPG-decoded on a background thread that always skips to
  the newest frame, detection runs on a copy at most 1920 px wide (corners refined at full
  resolution), and the depth check maps only the board centre into the depth image instead
  of aligning the whole frame. Frame aggregation is disabled, because the SDK otherwise holds
  color back until a matching depth frame arrives. Windows are fixed-size so Qt never
  rescales them. Over USB 3 this gives 30 fps at 3840x2160, with or without `--depth`;
  the overlay shows the latency (time since the frame reached the host, ~65 ms).

## Notes

- Driver: Orbbec SDK v2 via the `pyorbbecsdk2` wheel. It bundles `libOrbbecSDK.so`,
  so nothing else has to be built. The bundled examples are in
  `$CONDA_PREFIX/lib/python3.12/site-packages/pyorbbecsdk/examples/`.
- The SDK's camera sanity check: `python $CONDA_PREFIX/lib/python3.12/site-packages/pyorbbecsdk/examples/quick_start.py`
