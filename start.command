#!/bin/bash
# Double-click to open LEEO Chess Lab. Needs nothing but macOS (uses the built-in Python web server).
cd "$(dirname "$0")/dist" || { echo "Run 'npm run build' once first."; read; exit 1; }
PORT=5190
if ! lsof -i :$PORT >/dev/null 2>&1; then python3 -m http.server $PORT >/dev/null 2>&1 & fi
sleep 1
open "http://localhost:$PORT"
echo "LEEO Chess Lab is running at http://localhost:$PORT. Close this window to stop it."
wait
