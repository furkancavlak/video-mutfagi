"""Step 3: word timestamps. Every caption, card and camera move is locked to a spoken word, never to a hand-typed second.

    python uretim/kelime.py <video-klasoru>

Reads <video>/ses/NN-<rol>.mp3 and writes <video>/ses/kelimeler.json:
    {"01-dayi.mp3": [["Lan", 0.0, 0.38], ["on", 0.38, 0.68], ...], ...}
Uses faster-whisper large-v3-turbo on the CPU. The first run downloads the model (~1.6 GB) once.
Lines whose words are already in kelimeler.json are skipped; delete the entry (or the file) to redo.
"""
import json
import os
import sys

if len(sys.argv) < 2:
    sys.exit("HATA: video klasörünü ver. Örnek: python uretim/kelime.py videolar/oxygbio-v01-ucak")
try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.exit("HATA: faster-whisper kurulu değil. Repo kökünde: .venv kurulumu için kurulum/KURULUM.md adım 3'e bak.")

ses = os.path.join(sys.argv[1], "ses")
if not os.path.isdir(ses):
    sys.exit(f"HATA: {ses} yok. Önce node uretim/ses.js çalıştır (ya da kendi kayıtlarını buraya koy).")
out = os.path.join(ses, "kelimeler.json")
data = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else {}
files = sorted(f for f in os.listdir(ses) if f[:2].isdigit() and f.endswith((".mp3", ".wav", ".m4a")) and "-" in f)
todo = [f for f in files if f not in data]
if not files:
    sys.exit("HATA: ses klasöründe 01-rol.mp3 biçiminde dosya yok.")
if not todo:
    print("Tüm satırların kelime zamanları hazır.")
    sys.exit(0)

model = WhisperModel("large-v3-turbo", device="cpu", compute_type="int8")
for f in todo:
    segs, _ = model.transcribe(os.path.join(ses, f), language="tr", word_timestamps=True, vad_filter=False)
    words = [[w.word.strip(), round(w.start, 3), round(w.end, 3)] for s in segs for w in s.words if w.word.strip()]
    data[f] = words
    print(f, "→", " ".join(w[0] for w in words))
    json.dump(dict(sorted(data.items())), open(out, "w", encoding="utf-8"), ensure_ascii=False)

print("\nÜstteki metni senaryoyla karşılaştır. Whisper birleşik kelimeleri ayırabilir ya da ayrıları birleştirebilir")
print('("yer de" → "yerde"). Altyazıda yanlış görünecekleri video.json → "duzeltme" içine yaz: {"yerde": "yer de"}.')
