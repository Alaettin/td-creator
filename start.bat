@echo off
rem TD Creator lokal starten: installiert bei Bedarf und oeffnet den Browser.
cd /d "%~dp0"

where node 1>nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Abhaengigkeiten werden installiert ...
  call npm install
  if errorlevel 1 (
    echo npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo TD Creator startet auf http://localhost:5191 (Fenster schliessen zum Beenden)
node node_modules\vite\bin\vite.js --port 5191 --strictPort --open
if errorlevel 1 pause
