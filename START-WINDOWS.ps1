$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js не знайдено. Встановіть Node.js LTS з https://nodejs.org/' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Створено .env. Відкрийте його та задайте ADMIN_PASSWORD і SESSION_SECRET.' -ForegroundColor Yellow
  notepad .env
  Read-Host 'Після збереження .env натисніть Enter'
}
if (-not (Test-Path 'node_modules')) { npm install }
npm run dev
