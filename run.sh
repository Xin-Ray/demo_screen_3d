#!/bin/bash
# run.sh - serves the webapp directory using python's http.server

PORT=8000
echo "Starting local web server on port $PORT..."
echo "Open http://localhost:$PORT in your web browser (Chrome/Firefox)."
echo "Press Ctrl+C to stop the server."

# Static server + /span endpoint for the Span button
python3 tools/serve.py $PORT
