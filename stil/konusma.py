"""Speech word times for stil/olc.js --konusma (optional). Prints one JSON line: [["word", start, end], ...]

    python stil/konusma.py <video.mp4>

Uses the same faster-whisper model as uretim/kelime.py (large-v3-turbo, CPU). The language is detected by itself.
"""
import json
import sys

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.exit("faster-whisper kurulu değil (kurulum/KURULUM.md adım 3)")

if len(sys.argv) < 2:
    sys.exit("kullanım: python stil/konusma.py <video.mp4>")

model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
segs, _ = model.transcribe(sys.argv[1], word_timestamps=True, vad_filter=True)
words = [[w.word.strip(), round(w.start, 3), round(w.end, 3)] for s in segs for w in s.words if w.word.strip()]
print(json.dumps(words, ensure_ascii=False))
