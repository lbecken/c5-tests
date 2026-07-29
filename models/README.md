# Model files

Model weights are **not** committed to this repository. They are downloaded once
and then used entirely offline.

## Acquiring the model

```bash
uv sync --extra kokoro
python scripts/download_model.py
```

This fetches the Kokoro 82M model and a curated set of English voices into
`models/kokoro/`:

```
models/kokoro/
  config.json
  kokoro-v1_0.pth        # about 310 MB
  voices/
    af_heart.pt
    af_bella.pt
    am_michael.pt
    am_fenrir.pt
  VOICES.md
  LICENSE
```

The script also installs the English spaCy pipeline (`en_core_web_sm`) that
Kokoro's phonemizer uses. Without it, the first synthesis attempts a download and
fails on a machine with no network access.

Use `--all-voices` to fetch every voice in the upstream repository, and
`--model-dir` to install somewhere else. If you choose a different directory, set:

```bash
export READER_TTS_MODEL_DIR=/path/to/kokoro
```

## Verifying

```bash
reader-tts health
```

reports the model identifier, the runtime device, the discovered voices and the
initialization time. If the files are missing, the command exits with code 3 and
names the paths it looked for.

## Licensing

The Kokoro model and voices are distributed by their authors under the Apache
2.0 license. The downloaded `LICENSE` file in this directory is the upstream
license text and governs the model weights; it is separate from the MIT license
covering this repository's source code.

Model source: https://huggingface.co/hexgrad/Kokoro-82M
