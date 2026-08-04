#!/usr/bin/env bash
# Everything that can be checked without ears.
set -euo pipefail
cd "$(dirname "$0")"

echo "── graph, fair play, asset manifest ──────────────────────────"
python3 production/build.py

echo
echo "── the central clue is physically in the audio ───────────────"
python3 production/test_clue.py

echo
echo "── every ending reachable, no scene dead-ends, no JS errors ──"
PORT="${PORT:-8099}"
if curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  echo "  using the server already on :$PORT"
else
  node production/serve.js "$PORT" >/dev/null 2>&1 &
  SRV=$!
  trap 'kill $SRV 2>/dev/null || true' EXIT
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" && break
    sleep 0.5
  done
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html" \
    || { echo "could not start the test server on :$PORT"; exit 1; }
fi
for s in solve suppress wrong; do
  BASE="http://127.0.0.1:$PORT" node production/playtest.js "$s"
done

echo
echo "── dialogue matches the script (needs ELEVENLABS_API_KEY) ────"
if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
  python3 production/qa.py | tail -20
else
  echo "  skipped: ELEVENLABS_API_KEY not set"
fi
