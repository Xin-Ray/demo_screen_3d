#!/bin/sh
# Run the iris depth demo: color and registered depth in one window, MediaPipe iris
# landmarks, and the depth at each iris.
#
#   ./run_iris.sh                              # widest view: 4K color + wide depth (15 fps)
#   ./run_iris.sh --depth-mode wide-binned     # wide depth at 30 fps, half the detail
#   ./run_iris.sh --width 1280 --height 720 --depth-mode narrow
#   ./run_iris.sh --alpha 0.3                  # fainter depth overlay
#
# Downloads the MediaPipe face landmarker model to models/ on first run. Arguments
# are passed to iris_depth.py; PYTHON and FEMTO_ENV work as for run_demo.sh.

set -e

cd "$(dirname "$0")"

MODEL=models/face_landmarker.task
MODEL_URL=https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
if [ ! -f "$MODEL" ]; then
    mkdir -p models
    echo "downloading $MODEL_URL"
    curl -fL --progress-bar -o "$MODEL.part" "$MODEL_URL"
    mv "$MODEL.part" "$MODEL"
fi

export FEMTO_SCRIPT=iris_depth.py
exec ./run_demo.sh "$@"
