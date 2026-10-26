@echo off
rem Video Mutfagi: one-click setup for Windows (for people who do not use an AI agent).
rem Mirrors kurulum/KURULUM.md steps 1-5. Installs nothing without asking; skips what already exists.
rem   kur.cmd            check, install what is missing (asks first), set up the repo, render the example video
rem   kur.cmd --kuru     only check and list; change nothing
rem   kur.cmd --acmadan  do not open the example video at the end
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "KURU=0"
set "ACMA=1"
:argumanlar
if "%~1"=="" goto argumanlar_bitti
if /i "%~1"=="--kuru" set "KURU=1"
if /i "%~1"=="--acmadan" set "ACMA=0"
shift
goto argumanlar
:argumanlar_bitti

echo.
echo ==============================================
echo   Video Mutfağı kurulumu (Windows)
echo ==============================================
echo Bu pencere işi bitene kadar açık kalsın. İlk kurulum 5-15 dakika sürebilir.
echo.

rem ---------- 1. Temel araçlar: Node 22+, ffmpeg, Python 3.12 ----------
echo [1/7] Temel araçlara bakıyorum...
set "EKSIK="
set "PAKETLER="

set "NODE_MAJ=v0"
for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do set "NODE_MAJ=%%v"
set "NODE_MAJ=%NODE_MAJ:v=%"
set "NODE_OK=0"
if %NODE_MAJ% GEQ 22 set "NODE_OK=1"
if "%NODE_OK%"=="1" (
  echo   ✓ Node.js v%NODE_MAJ%
) else (
  echo   ✗ Node.js 22 ya da üstü yok
  set "EKSIK=1"
  set "PAKETLER=%PAKETLER% OpenJS.NodeJS.LTS"
)

set "FF_OK=0"
where ffmpeg >nul 2>nul && where ffprobe >nul 2>nul && set "FF_OK=1"
if "%FF_OK%"=="1" (
  echo   ✓ ffmpeg
) else (
  echo   ✗ ffmpeg yok
  set "EKSIK=1"
  set "PAKETLER=%PAKETLER% Gyan.FFmpeg"
)

set "PYCMD="
if exist ".venv\Scripts\python.exe" set "PYCMD=hazir"
if not defined PYCMD py -3.12 -c "pass" >nul 2>nul && set "PYCMD=py -3.12"
if not defined PYCMD (
  for /f "tokens=2" %%p in ('python --version 2^>nul') do echo %%p| findstr /b "3.12." >nul && set "PYCMD=python"
)
if defined PYCMD (
  echo   ✓ Python 3.12
) else (
  echo   ✗ Python 3.12 yok
  set "EKSIK=1"
  set "PAKETLER=%PAKETLER% Python.Python.3.12"
)

if not defined EKSIK goto araclar_tamam

echo.
echo Eksik araçlar var. Kurulacak paketler:%PAKETLER%
where winget >nul 2>nul
if errorlevel 1 goto winget_yok
echo Her biri için şu komut çalışacak:  winget install -e --id ^<paket^>
echo Bazıları yönetici onayı isteyebilir. Windows sorarsa "Evet" de.
if "%KURU%"=="1" (
  echo.
  echo Deneme modu: hiçbir şey kurulmadı.
  goto son
)
echo.
choice /c EH /m "Bunları şimdi kurayım mı? E = evet, H = hayır"
if errorlevel 2 (
  echo Kurulum durduruldu. Hiçbir şey değişmedi.
  goto son
)
for %%p in (%PAKETLER%) do (
  echo.
  echo --- %%p kuruluyor ---
  (call )
  winget install -e --id %%p --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo ✗ %%p kurulamadı. Yukarıdaki hata mesajına bak.
    echo   Elle kurmak için: kurulum\KURULUM.md, Adım 1.
    goto hata
  )
)
echo.
echo ✓ Araçlar kuruldu.
echo Windows yeni araçları ancak yeni bir pencerede görür.
echo Bu pencereyi kapat, sonra kur.cmd dosyasına yeniden çift tıkla. Kaldığı yerden devam eder.
goto son

:winget_yok
echo.
echo ✗ Bu bilgisayarda winget yok, araçları kendim kuramıyorum.
echo   Elle kur, sonra kur.cmd'yi yeniden çalıştır:
echo   Node.js 22+ : https://nodejs.org  (LTS sürümünü indir)
echo   ffmpeg      : https://www.gyan.dev/ffmpeg/builds/
echo   Python 3.12 : https://www.python.org/downloads/  (kurarken "Add to PATH" kutusunu işaretle)
echo   winget'i almak için Microsoft Store'dan "App Installer" uygulamasını güncelleyebilirsin.
goto hata

:araclar_tamam
if "%KURU%"=="1" (
  echo.
  echo Deneme modu: araçlar tamam. Hiçbir şey değiştirilmedi.
  goto son
)

rem ---------- 2. npm paketleri ----------
echo.
echo [2/7] npm paketleri (HyperFrames, GSAP)...
if exist "node_modules\hyperframes\bin\hyperframes.mjs" if exist "node_modules\gsap\dist\gsap.min.js" (
  echo   ✓ zaten kurulu, atlıyorum
  goto npm_tamam
)
call npm install
if errorlevel 1 (
  echo ✗ npm install başarısız oldu. İnternet bağlantını kontrol et, sonra tekrar dene.
  goto hata
)
:npm_tamam

rem ---------- 3. Render browser (downloads once, ~150 MB) ----------
echo.
echo [3/7] Video çizen tarayıcı (Chrome, bir kez ~150 MB iner)...
call npx hyperframes browser ensure
if errorlevel 1 (
  echo ✗ Tarayıcı indirilemedi. İnternet bağlantını kontrol et, sonra tekrar dene.
  goto hata
)

rem ---------- 4. Python ortamı + Whisper ----------
echo.
echo [4/7] Python ortamı (.venv) ve Whisper...
if exist ".venv\Scripts\python.exe" (
  echo   ✓ .venv zaten var
) else (
  echo   .venv kuruluyor: %PYCMD% -m venv .venv
  %PYCMD% -m venv .venv
)
if not exist ".venv\Scripts\python.exe" (
  echo ✗ .venv kurulamadı.
  goto hata
)
".venv\Scripts\python.exe" -c "import faster_whisper, av; assert faster_whisper.__version__ == '1.2.1' and av.__version__.startswith('18.')" >nul 2>nul
if not errorlevel 1 (
  echo   ✓ Whisper paketleri doğru sürümde, atlıyorum
  goto python_tamam
)
echo   Sabit sürümler kuruluyor: kurulum\gereksinimler.txt
".venv\Scripts\python.exe" -m pip install -r kurulum\gereksinimler.txt
if errorlevel 1 (
  echo ✗ Python paketleri kurulamadı. Yukarıdaki hata mesajına bak.
  goto hata
)
:python_tamam

rem ---------- 5. Secret guard (only in a git clone) ----------
echo.
echo [5/7] Gizli bilgi kilidi...
if exist ".git\hooks\" (
  node kurulum\gizli-tara.js kur
) else (
  echo   - Burada git kilidi kurulamıyor ^(ZIP ile indirilmiş olabilir^). Atlıyorum, sorun değil.
)

rem ---------- 6. Doctor ----------
echo.
echo [6/7] Kontrol (doktor)...
node kurulum\doktor.js
if errorlevel 1 (
  echo ✗ Doktor eksik parça buldu. Yukarıdaki "→" satırlarını yap, sonra kur.cmd'yi tekrar çalıştır.
  goto hata
)

rem ---------- 7. Example video (the proof) ----------
echo.
echo [7/7] Örnek video...
set "ORNEK=videolar\oxygbio-v01-ucak"
set "MP4=%ORNEK%\cikti\oxygbio-v01-ucak-ucretsiz.mp4"
if exist "%MP4%" (
  echo   ✓ Örnek video zaten var, yeniden çizmiyorum.
  goto video_hazir
)
echo   Ses karıştırılıyor...
node uretim\mix.js %ORNEK%
if errorlevel 1 goto video_hata
echo   Video çiziliyor. Orta bir bilgisayarda 2-4 dakika sürer...
node uretim\kurgu.js %ORNEK% --render
if errorlevel 1 goto video_hata
if not exist "%MP4%" goto video_hata

:video_hazir
echo.
echo ==============================================
echo   Kurulum tamam.
echo   Örnek video: %MP4%
echo ==============================================
echo Sıradaki adımlar README.md dosyasında. Kendi videon için bir yapay zekâ ajanı
echo ^(Claude Code, Codex ya da Antigravity CLI^) aç ve "Kendi kanalım için kimlik kuralım" yaz.
if "%ACMA%"=="1" start "" "%MP4%"
goto son

:video_hata
echo ✗ Örnek video üretilemedi. Yukarıdaki hata mesajına bak.
echo   Sık sebep: repo çok derin bir klasörde. Kısa bir yola taşı ^(ör. C:\Users\^<ad^>\video-mutfagi^).
goto hata

:hata
echo.
echo Kurulum yarıda kaldı. Hiçbir şey silinmedi; sorunu çözüp kur.cmd'yi tekrar çalıştırabilirsin.
echo.
pause
endlocal
exit /b 1

:son
echo.
pause
endlocal
exit /b 0
