#!/bin/bash
# Cradle Song needs a full ffmpeg for the archival processing chains documented in
# cradle-song/docs/05-audio-direction.md (shortwave, cassette, PA). The image ships
# only Playwright's ffmpeg, which is built --disable-everything: webm/VP8 and mjpeg
# only, no mp3 decoder and no audio filters at all.
set -euo pipefail

# Web sessions only; local machines have their own ffmpeg.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Idempotent: a real ffmpeg (not the Playwright stub) is enough. Checked without a
# pipe on purpose - `... | grep -q` makes ffmpeg exit on SIGPIPE, and under
# `set -o pipefail` that reads as failure, so the guard would never fire.
has_real_ffmpeg() {
  command -v ffmpeg >/dev/null 2>&1 || return 1
  local filters
  filters=$(ffmpeg -hide_banner -filters 2>/dev/null || true)
  case "$filters" in *" highpass "*) return 0 ;; *) return 1 ;; esac
}

if has_real_ffmpeg; then
  echo "ffmpeg already present: $(ffmpeg -version 2>/dev/null | head -1)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends ffmpeg >/dev/null 2>&1 \
  || { apt-get update >/dev/null 2>&1 && apt-get install -y --no-install-recommends ffmpeg >/dev/null 2>&1; }

if has_real_ffmpeg; then
  echo "installed $(ffmpeg -version 2>/dev/null | head -1)"
else
  echo "WARNING: ffmpeg install failed; audio post-processing will be unavailable" >&2
fi

python3 -m pip install --quiet --disable-pip-version-check requests >/dev/null 2>&1 || true
