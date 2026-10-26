#!/usr/bin/env bash
# Video Mutfagi: one-click setup for Mac and Linux (for people who do not use an AI agent).
# Mirrors kurulum/KURULUM.md steps 1-5. Installs nothing without asking; skips what already exists.
#   bash kur.sh            check, install what is missing (asks first), set up the repo, render the example video
#   bash kur.sh --kuru     only check and list; change nothing
#   bash kur.sh --acmadan  do not open the example video at the end
set -u

KURU=0
ACMA=1
for a in "$@"; do
  case "$a" in
    --kuru) KURU=1 ;;
    --acmadan) ACMA=0 ;;
  esac
done

cd "$(dirname "$0")" || exit 1

hata() {
  echo
  echo "✗ $1"
  echo "Kurulum yarıda kaldı. Hiçbir şey silinmedi; sorunu çözüp kur.sh'yi tekrar çalıştırabilirsin."
  exit 1
}

echo
echo "=============================================="
echo "  Video Mutfağı kurulumu (Mac / Linux)"
echo "=============================================="
echo "Bu pencere işi bitene kadar açık kalsın. İlk kurulum 5-15 dakika sürebilir."
echo

OS="$(uname -s)"
case "$OS" in
  Darwin) SISTEM=mac ;;
  Linux) SISTEM=linux ;;
  *) hata "Bu betik Mac ve Linux için. Windows'ta kur.cmd dosyasına çift tıkla." ;;
esac

# ---------- 1. Temel araçlar: Node 22+, ffmpeg, Python 3.12 ----------
echo "[1/7] Temel araçlara bakıyorum..."
EKSIK=()
BREW_PAKET=()

NODE_MAJ=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJ="$(node -v | sed 's/^v//; s/\..*//')"
fi
if [ "$NODE_MAJ" -ge 22 ] 2>/dev/null; then
  echo "  ✓ Node.js v$NODE_MAJ"
else
  echo "  ✗ Node.js 22 ya da üstü yok"
  EKSIK+=("Node.js 22+"); BREW_PAKET+=("node")
fi

if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
  echo "  ✓ ffmpeg"
else
  echo "  ✗ ffmpeg yok"
  EKSIK+=("ffmpeg"); BREW_PAKET+=("ffmpeg")
fi

PY=""
if [ -x ".venv/bin/python" ]; then
  PY="hazir"
elif command -v python3.12 >/dev/null 2>&1; then
  PY="python3.12"
elif command -v python3 >/dev/null 2>&1 && python3 --version 2>&1 | grep -q '^Python 3\.12\.'; then
  PY="python3"
fi
if [ -n "$PY" ]; then
  echo "  ✓ Python 3.12"
else
  echo "  ✗ Python 3.12 yok"
  EKSIK+=("Python 3.12"); BREW_PAKET+=("python@3.12")
fi

if [ ${#EKSIK[@]} -gt 0 ]; then
  echo
  echo "Eksik araçlar: ${EKSIK[*]}"
  if [ "$SISTEM" = mac ]; then
    if ! command -v brew >/dev/null 2>&1; then
      echo "Bu Mac'te Homebrew yok, araçları kendim kuramıyorum."
      echo "Önce Homebrew'u kur (https://brew.sh adresindeki tek satırı Terminal'e yapıştır),"
      echo "sonra bu betiği tekrar çalıştır. İstersen araçları elle de kurabilirsin:"
      echo "  Node.js: https://nodejs.org   ffmpeg: https://ffmpeg.org   Python 3.12: https://www.python.org"
      hata "Homebrew yok."
    fi
    echo "Çalışacak komut:  brew install ${BREW_PAKET[*]}"
    if [ "$KURU" = 1 ]; then echo; echo "Deneme modu: hiçbir şey kurulmadı."; exit 0; fi
    CEVAP=""
    if [ -t 0 ]; then read -r -p "Bunları şimdi kurayım mı? (e/h) " CEVAP; fi
    case "$CEVAP" in
      e|E|evet|Evet) ;;
      *) echo "Kurulum durduruldu. Hiçbir şey değişmedi."; exit 0 ;;
    esac
    brew install "${BREW_PAKET[@]}" || hata "brew install başarısız oldu. Yukarıdaki hata mesajına bak."
    echo
    echo "✓ Araçlar kuruldu. Devam ediyorum."
    hash -r
    [ -z "$PY" ] && command -v python3.12 >/dev/null 2>&1 && PY="python3.12"
    [ -z "$PY" ] && hata "Python 3.12 kuruldu ama bulunamadı. Terminali kapatıp açtıktan sonra tekrar dene."
  else
    # Linux: installing system packages needs sudo, so we only print the commands.
    echo "Linux'ta sistem paketi kurmak yönetici (sudo) ister. Bu betik sistemine dokunmaz."
    echo "Eksikleri kendin kur, sonra bu betiği tekrar çalıştır. Ubuntu/Debian örneği:"
    echo "  sudo apt install ffmpeg python3.12 python3.12-venv"
    echo "  Node.js 22+: https://nodejs.org (sistem Node'u eskiyse kurulum/KURULUM.md → Sunucu bölümüne bak)"
    if [ "$KURU" = 1 ]; then echo; echo "Deneme modu: hiçbir şey kurulmadı."; exit 0; fi
    hata "Eksik araçlar var."
  fi
fi

if [ "$KURU" = 1 ]; then
  echo
  echo "Deneme modu: araçlar tamam. Hiçbir şey değiştirilmedi."
  exit 0
fi

# ---------- 2. npm paketleri ----------
echo
echo "[2/7] npm paketleri (HyperFrames, GSAP)..."
if [ -f node_modules/hyperframes/bin/hyperframes.mjs ] && [ -f node_modules/gsap/dist/gsap.min.js ]; then
  echo "  ✓ zaten kurulu, atlıyorum"
else
  npm install || hata "npm install başarısız oldu. İnternet bağlantını kontrol et, sonra tekrar dene."
fi

# ---------- 3. Render browser (downloads once, ~150 MB) ----------
echo
echo "[3/7] Video çizen tarayıcı (Chrome, bir kez ~150 MB iner)..."
npx hyperframes browser ensure || hata "Tarayıcı indirilemedi. İnternet bağlantını kontrol et, sonra tekrar dene."

# ---------- 4. Python ortamı + Whisper ----------
echo
echo "[4/7] Python ortamı (.venv) ve Whisper..."
if [ -x .venv/bin/python ]; then
  echo "  ✓ .venv zaten var"
else
  echo "  .venv kuruluyor: $PY -m venv .venv"
  "$PY" -m venv .venv || hata ".venv kurulamadı. Linux'ta python3.12-venv paketi gerekebilir."
fi
if .venv/bin/python -c "import faster_whisper, av; assert faster_whisper.__version__ == '1.2.1' and av.__version__.startswith('18.')" >/dev/null 2>&1; then
  echo "  ✓ Whisper paketleri doğru sürümde, atlıyorum"
else
  echo "  Sabit sürümler kuruluyor: kurulum/gereksinimler.txt"
  .venv/bin/python -m pip install -r kurulum/gereksinimler.txt || hata "Python paketleri kurulamadı. Yukarıdaki hata mesajına bak."
fi

# ---------- 5. Secret guard (only in a git clone) ----------
echo
echo "[5/7] Gizli bilgi kilidi..."
if [ -d .git/hooks ]; then
  node kurulum/gizli-tara.js kur
else
  echo "  - Burada git kilidi kurulamıyor (ZIP ile indirilmiş olabilir). Atlıyorum, sorun değil."
fi

# ---------- 6. Doctor ----------
echo
echo "[6/7] Kontrol (doktor)..."
node kurulum/doktor.js || hata "Doktor eksik parça buldu. Yukarıdaki → satırlarını yap, sonra kur.sh'yi tekrar çalıştır."

# ---------- 7. Example video (the proof) ----------
echo
echo "[7/7] Örnek video..."
ORNEK="videolar/oxygbio-v01-ucak"
MP4="$ORNEK/cikti/oxygbio-v01-ucak-ucretsiz.mp4"
if [ -f "$MP4" ]; then
  echo "  ✓ Örnek video zaten var, yeniden çizmiyorum."
else
  echo "  Ses karıştırılıyor..."
  node uretim/mix.js "$ORNEK" || hata "Örnek videonun sesi karıştırılamadı. Yukarıdaki hata mesajına bak."
  echo "  Video çiziliyor. Orta bir bilgisayarda 2-4 dakika sürer..."
  node uretim/kurgu.js "$ORNEK" --render || hata "Örnek video üretilemedi. Yukarıdaki hata mesajına bak."
  [ -f "$MP4" ] || hata "Örnek video dosyası oluşmadı."
fi

echo
echo "=============================================="
echo "  Kurulum tamam."
echo "  Örnek video: $MP4"
echo "=============================================="
echo "Sıradaki adımlar README.md dosyasında. Kendi videon için bir yapay zekâ ajanı"
echo "(Claude Code, Codex ya da Antigravity CLI) aç ve \"Kendi kanalım için kimlik kuralım\" yaz."
if [ "$ACMA" = 1 ]; then
  if [ "$SISTEM" = mac ]; then open "$MP4"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$MP4" >/dev/null 2>&1 &
  fi
fi
exit 0
