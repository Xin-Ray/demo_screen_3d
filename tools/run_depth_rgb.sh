#!/bin/sh
# Start the depth-rgb eye tracking helper (Orbbec Femto Bolt) for concave-room.html.
# Uses the femto_bolt conda env (see sub-features/femto_bolt_charuco/README.md).
# Override the interpreter with PYTHON=/path/to/python. Arguments go to depth_rgb_bridge.py.
set -e
cd "$(dirname "$0")"
if [ -z "$PYTHON" ]; then
    BASE=$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")
    PYTHON="$BASE/envs/${FEMTO_ENV:-femto_bolt}/bin/python"
fi
[ -x "$PYTHON" ] || { echo "No Python at $PYTHON - create the femto_bolt env (sub-features/femto_bolt_charuco/README.md)"; exit 1; }
export PYTHONDONTWRITEBYTECODE=1
exec "$PYTHON" depth_rgb_bridge.py "$@"
