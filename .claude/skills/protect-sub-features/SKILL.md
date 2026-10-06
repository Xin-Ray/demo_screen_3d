---
name: protect-sub-features
description: Use whenever you are about to write, edit, move, delete or format code or files in this repo (demo_screen_3d). The sub-features/ folder is owned by other contributors and must never be changed.
---

# Never change anything inside `sub-features/`

`sub-features/` holds work owned by other people (for example
`sub-features/femto_bolt_charuco/`, which contains `iris_depth.py`). Any
change there causes merge conflicts with their work.

Before every edit in this repo:

1. Check the target path. If it is inside `sub-features/`, do **not** write,
   edit, rename, delete, reformat or add files there — not even a one-line
   fix, a new file or a generated file (no `__pycache__`, logs, outputs).
2. To use code from `sub-features/`, **import or call it from outside** the
   folder (e.g. a bridge script in `tools/` that imports
   `sub-features/femto_bolt_charuco/iris_depth.py`), or copy the logic into
   a new file outside the folder with a note pointing at the original.
3. If something inside `sub-features/` looks broken or needs a change, tell
   the user and let them coordinate with its owner instead of fixing it.
4. Before finishing, run `git status --porcelain sub-features/` and confirm
   it prints nothing. If it does, revert those changes
   (`git checkout -- sub-features/` / remove untracked files you created)
   and tell the user.
