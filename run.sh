#!/usr/bin/env bash
# Serve the game. Web Audio cannot process a file:// media element, so opening
# game/index.html directly will load the script but not the sound design.
set -e
cd "$(dirname "$0")/game"
PORT="${1:-8080}"
echo "The Man Who Called From Tomorrow — http://localhost:$PORT/"
echo "Headphones recommended. Ctrl-C to stop."
exec python3 -m http.server "$PORT"
