import io
import os
import sys
import urllib.request
from pathlib import Path
from flask import Flask, request, Response

MODEL_DIR   = Path(__file__).parent / "kokoro_models"
MODEL_FILE  = MODEL_DIR / "kokoro-v0_19.onnx"
VOICES_FILE = MODEL_DIR / "voices.bin"

URLS = {
    "kokoro-v0_19.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx",
    "voices.bin":        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin",
}

def download_if_missing(path: Path, url: str):
    if path.exists():
        return
    MODEL_DIR.mkdir(exist_ok=True)
    urllib.request.urlretrieve(url, path)
    print(f"[TTS] {path.name} saved to {path}")

download_if_missing(MODEL_FILE,  URLS["kokoro-v0_19.onnx"])
download_if_missing(VOICES_FILE, URLS["voices.bin"])

try:
    from kokoro_onnx import Kokoro
    import soundfile as sf
    import numpy as np
except ImportError as e:
    print(f"[TTS] missing dependency: {e}")
    print("      Run: pip install kokoro-onnx soundfile flask numpy")
    sys.exit(1)

kokoro = Kokoro(str(MODEL_FILE), str(VOICES_FILE))
available_voices = list(kokoro.voices.keys())
print(f"[TTS] available voices: {available_voices}")

app = Flask(__name__)

@app.post("/tts")
def tts():
    data  = request.get_json(force=True)
    text  = data.get("text", "").strip()
    voice = data.get("voice", "bm_lewis")
    speed = float(data.get("speed", 1.0))

    if not text:
        return Response("missing text", status=400)

    samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
    buf.seek(0)

    return Response(buf.read(), mimetype="audio/wav")

if __name__ == "__main__":
    port = int(os.environ.get("TTS_PORT", 5050))
    print(f"[TTS] listening on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port)
