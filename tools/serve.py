#!/usr/bin/env python3
"""Static server for the app plus POST /span: fullscreen the focused browser
window across all monitors (X11, needs python-xlib). Used by the Span button.

Usage: python3 tools/serve.py [PORT]   (default 8000)
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from Xlib import X, display, protocol
from Xlib.ext import xinerama

def span():
    d = display.Display()
    root = d.screen().root
    screens = xinerama.query_screens(d).screens
    left = min(range(len(screens)), key=lambda i: screens[i].x)
    right = max(range(len(screens)), key=lambda i: screens[i].x + screens[i].width)
    active = root.get_full_property(d.intern_atom('_NET_ACTIVE_WINDOW'), X.AnyPropertyType)
    if not active or not active.value[0]:
        raise RuntimeError('no active window')
    window = d.create_resource_object('window', active.value[0])
    def message(kind, data):
        event = protocol.event.ClientMessage(window=window, client_type=d.intern_atom(kind),
                                             data=(32, data + [0] * (5 - len(data))))
        root.send_event(event, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
    fs = d.intern_atom('_NET_WM_STATE_FULLSCREEN')
    message('_NET_WM_STATE', [0, fs, 0, 1])  # drop single-monitor fullscreen first
    d.sync()
    message('_NET_WM_FULLSCREEN_MONITORS', [left, left, left, right, 1])
    message('_NET_WM_STATE', [1, fs, 0, 1])
    d.sync()
    return f'Spanning monitors {left}..{right}.'

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/span':
            return self.send_error(404)
        try: body, code = span(), 200
        except Exception as error: body, code = f'{type(error).__name__}: {error}', 500
        self.send_response(code); self.send_header('Content-Type', 'text/plain')
        self.end_headers(); self.wfile.write(body.encode())

if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 8000), Handler).serve_forever()
