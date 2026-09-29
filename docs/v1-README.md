# 3D window demos

Serve this folder with `python -m http.server 8000` (or `bash run.sh`), then open:

- Original: http://localhost:8000/
- Concave 90° version: http://localhost:8000/concave.html
- Portrait concave room: http://localhost:8000/concave-room.html (also linked from the index)

## Concave setup

Two flat, matching monitors meet at their inner edges at an **inside angle of 90°**, with their display surfaces facing the viewer between them. The app uses a separate off-axis projection for each screen and translates the shared eye position as you move.

1. Enter each screen's visible width and height, excluding bezels (default: 53.1 × 29.9 cm).
2. Put the webcam at the **center of the left monitor**, facing perpendicular to that monitor into the corner. The camera is offset from the seam and its view is rotated 45° relative to the center viewing axis; tracking accounts for both. Under **Camera placement**, set height above screen center if needed (default 0 cm; a top-center webcam needs half the visible screen height plus the bezel/mount height). Enter its horizontal field of view if known (default 60°).
3. Sit centered between the screens, looking toward the seam, eyes at screen-center height. Set **Calibration: eyes → seam** to your measured distance: 30–60 cm, default 45 cm. This is distance along the corner bisector, not perpendicular distance to a panel; at center the latter is seam distance divided by √2.
4. Camera access is requested automatically on the controller. Allow access, keep both eyes visible in the preview, hold still at the measured distance, then press **Calibrate depth**. Calibration uses at least 12 recent iris measurements. There are no mouse or fixed-view modes. If permission is denied or tracking fails, fix the problem and press **Restart camera**.
5. **Spanning one window:** stretch the browser across both monitors, edge-to-edge. Set **Physical seam alignment** so the vertical divider meets the physical hinge (50% for equal halves). Each viewport must fill its matching screen; browser chrome/taskbars and an undersized window can affect physical alignment. Press **H** or **Hide setup** to clear the controls without stopping the camera. Press H again to restore setup.
6. Alternatively, use **Open left** / **Open right** under **Separate windows (optional)**, move each window to its monitor, then click **Fullscreen**. Keep the controller running. Windows synchronize through BroadcastChannel and must share the same browser and origin. Only the controller opens the webcam.

The split view is the actual two-panel output when stretched across both physical screens. On a single flat monitor it is only a preview.

## Foreground illusion

The foreground object is an upright placeholder person with a rounded head, torso, jointed arms and legs, hands, feet and simple facial features. It sits **12 cm forward of the seam**, toward the viewer. **Person forward of seam** adjusts this from 6–16 cm. Its size is bounded so the whole figure remains in front of both panel planes and behind a viewer at the minimum 30 cm distance. It stays fixed in world space as the camera tracks you; leaning reveals the figure from different angles, with foreground parallax opposite to background parallax.

A matte solid surface, facial details, cast shadow and floor grid provide depth cues. The mannequin is built from 3D geometry and requires no model downloads. Optional screen-plane outlines provide a fixed reference at the physical display surface; they are not a second floating object. Foreground settings synchronize with separate display windows too.

The person automatically performs a gentle looping dance: side steps, alternating arm swings, bent elbows and knees, torso sway and head bobbing. **Pause dance** freezes the pose; **Resume dance** continues from that pose. Camera tracking continues during either state. Both monitor views use the same dance clock, including when opened in separate windows.

The person stands on the floor. Each dance frame aligns the lowest sole with the ground, allowing the other foot to lift without either foot sinking through the surface. The floor height keeps foot contact visible at the closest supported viewing distance and follows changes to screen size or foreground placement.

The surrounding scene includes two potted plants, a pair of speakers, a bench, a side table with books and a mug, a floor lamp, stacked crates, a ball, a traffic cone, a stool and a painted dance mat. Props sit at different depths around an open central dance area and follow the floor and model scale when setup dimensions change. They use local 3D geometry without additional downloads.

This is a head-tracked perspective illusion. Both eyes still see the same displayed image; ordinary monitors do not provide separate left/right-eye views or a true volumetric image. Foreground placement improves motion-parallax depth cues but does not create binocular stereo.

## Real-time camera depth

MediaPipe Face Mesh runs with refined iris landmarks on new video frames, with at most one inference in flight. Calibrated iris diameter supplies optical depth; image coordinates are unprojected and transformed from the left webcam's coordinate system into the two-screen coordinate system. The model's landmark `z` values are not treated as metric distance. A short smoothing filter reduces jitter, and both monitor projections share the resulting eye position.

The live panel reports **Seam depth** (position along the center viewing axis), **Camera range** (estimated straight-line distance to the left webcam), valid tracking FPS, and time since the last valid measurement. These numbers update as you move; the calibration slider only sets the known starting distance. Projection remains limited to the supported 30–60 cm area, with a visible notice if an estimate exceeds that area. Blinks and unreliable iris samples are rejected. After 250 ms without a valid sample, depth readouts are cleared and the last view is held until tracking resumes.

This is calibrated monocular depth estimation, not a hardware depth sensor. Accuracy depends on calibration, camera field of view/orientation, eye visibility, lighting and head rotation. The default field of view is an approximation. Recalibrate after changing screen size, camera settings or camera position. The lens must face perpendicular to the left screen; arbitrary camera pan/tilt is not supported. Browser background throttling and hardware inference speed can reduce update rate; keep the controller active and check the live FPS/measurement age.

Method reference: [MediaPipe Iris depth estimation](https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/). This app uses a known-distance calibration to establish scale rather than assuming a universal physical iris diameter.

Three.js and MediaPipe load from CDNs, so internet access is required. Webcam access requires localhost or HTTPS. For best seam continuity use matching resolutions/scaling, disable display overscan, and minimize the physical bezel gap. Bezel compensation and independently sized monitors are not implemented.

## Checks

Run `node concave.test.cjs` with Node 18 or newer and internet access. It checks 243 projection configurations, 27 foreground clearance configurations, foreground/background parallax direction, spanning seam alignment, 45 left-camera position/depth reconstructions, iris extraction/blink rejection, and the actual frame-processing/application wiring using synthetic camera observations. It covers live depth changes, stale/recovered tracking, calibration invalidation, restart, permissions and display synchronization. A physical two-monitor and webcam check is still needed to verify appearance, accuracy and frame rate on your hardware.

## Portrait concave room

The separate `concave-room.html` version defaults to matching **60 × 106.7 cm portrait screens** meeting at 90°. Enter your actual visible dimensions. It uses the same off-axis panel projection for a stationary floating panda. A single flat rectangular 3D frame spans the two monitors without a center post. The frame stays attached to the room and is projected from the same calibrated eye; it is no longer a pair of screen-anchored 2D borders. Horizontal frame edges can look bent on a flat screenshot because each image is intended for one of the physical 90° panels. Evaluate the illusion from the calibrated viewpoint with each viewport filling its matching screen. Physical bezels remain visible. Inside it, one continuous room has teal and muted violet side walls, a blue back wall, and a slate floor with fine perspective seams. The entire room and frame follow 75% of lateral and vertical eye movement, leaving a 25% relative viewpoint response. The panda keeps the full response. This deliberate parallax adjustment makes the room turn more slowly than the panda while keeping walls, floor, frame, and shadows together across the seam. Forward/backward depth response is unchanged. A warm light above and in front of the screens casts the character’s real-time shadow into the room. The black-and-white panda has round ears, eye patches, a muzzle, and dark paws. It floats in a seated pose with its legs forward and slightly spread, its left paw resting near its lap, and only its right paw gesturing. There is no walking, body sway, or vertical bobbing. **Character depth** sets its fixed position relative to the seam (default: 8 cm toward the viewer). The back wall is recessed two screen widths behind the seam, giving the nearby panda and distant room different perspective/parallax responses, and **Pause motion** freezes the gesture.

The controller starts webcam tracking automatically. There is no manual viewpoint mode. Use the single **Calibration: eyes → webcam lens** slider (20–400 cm) to enter your measured straight-line eye-to-lens distance. Hold still and press **Calibrate tracking**. Eye position is reconstructed from the detected image coordinates, camera pose/FOV, and this distance; no eye-height or sideways-position input is needed. Dragging the slider recalibrates from recent stable camera observations when available. Before calibration, the preview uses camera-observed direction and the selected range; after calibration, iris size changes estimate movement in depth. The selected calibration distance stays fixed while the separate estimated-distance readout follows tracking.

The webcam defaults to the shared top corner, 3 cm above the panels, facing the viewer with 25° downward tilt. Under **Tracking webcam placement**, match its physical position, yaw, tilt and horizontal field of view. Recalibrate after changing placement or screen dimensions. The live top/side diagram shows webcam and eye positions. Tracking requires localhost/HTTPS, internet access, and webcam permission. If tracking fails or eyes become obscured, the last view is held and the status explains how to restart.

The old 70 cm seam-distance minimum and its roughly 90 cm camera-range minimum are removed. Eyes must remain on the inward-facing side of both screen planes with a 3 cm margin; physically inconsistent poses are rejected with a message. A selected distance alone cannot correct inaccurate webcam tilt/FOV or screen dimensions.

Use **H** to hide setup and **Open left/right** for synchronized fullscreen display windows. Only the controller accesses the webcam. Keep it open. The page has its own synchronization channel, independent of the original concave demo. Actual alignment, webcam accuracy, and perceived depth still require checking on the physical setup.

Tracking uses a time-based 180 ms smoothing response and a 2 mm noise threshold. Run `node concave-room.test.cjs` for pose reconstruction, measured-distance ray reconstruction, viewing-area validation and smoothing checks. The original suite remains `node concave.test.cjs`.

**Seam overlap** shifts the two rendered views toward or away from their shared corner, from −20% to +20% of each panel’s width. Negative values reduce duplicated content; positive values reveal more shared content. It preserves image scale and vertical alignment and synchronizes with separate display windows. **Reset overlap** restores the exact calibrated projection at 0%. **Physical seam alignment** separately controls where the spanning window is split.

The portal trim is a single flat ring in front of the frame, and the room floor meets the back of the sill. This avoids the overlapping trim surfaces and exposed floor edge that could produce border artifacts.
