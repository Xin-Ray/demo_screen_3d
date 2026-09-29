#!/usr/bin/env python3
"""Open the app in Chrome and make it fullscreen across both monitors (X11).

Browser fullscreen covers only one monitor, so this launches Chrome as a
frameless app window and asks the window manager (EWMH
_NET_WM_FULLSCREEN_MONITORS) to span the leftmost to the rightmost monitor.

Usage: python3 tools/span_window.py [URL]
Needs: python3-xlib (pip install python-xlib), Google Chrome, an X11 session.
"""
import os, subprocess, sys, tempfile, time
from Xlib import X, display, protocol
from Xlib.ext import xinerama

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/concave-room.html'
APP_CLASS = 'localhost__concave-room.html'
PROFILE = os.path.join(tempfile.gettempdir(), 'concave-room-chrome')

d = display.Display()
root = d.screen().root
screens = xinerama.query_screens(d).screens
left = min(range(len(screens)), key=lambda i: screens[i].x)
right = max(range(len(screens)), key=lambda i: screens[i].x + screens[i].width)
width = sum(s.width for s in screens)
height = max(s.height for s in screens)

subprocess.Popen(['google-chrome', f'--user-data-dir={PROFILE}', '--no-first-run',
                  # Keep tracking running when the window is partly covered.
                  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
                  '--disable-backgrounding-occluded-windows',
                  f'--app={URL}', '--window-position=0,0', f'--window-size={width},{height}'],
                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def find(window):
    try:
        cls = window.get_wm_class()
        if cls and cls[0] == APP_CLASS:
            return window
        children = window.query_tree().children
    except Exception:
        return None
    for child in children:
        found = find(child)
        if found:
            return found

window = None
for _ in range(40):
    time.sleep(.25)
    window = find(root)
    if window:
        break
if not window:
    sys.exit('Chrome app window not found.')
time.sleep(1)

def message(kind, data):
    event = protocol.event.ClientMessage(window=window, client_type=d.intern_atom(kind),
                                         data=(32, data + [0] * (5 - len(data))))
    root.send_event(event, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)

message('_NET_WM_FULLSCREEN_MONITORS', [left, left, left, right, 1])
message('_NET_WM_STATE', [1, d.intern_atom('_NET_WM_STATE_FULLSCREEN'), 0, 1])
d.flush()
print(f'Spanning monitors {left}..{right} ({width}x{height}).')
