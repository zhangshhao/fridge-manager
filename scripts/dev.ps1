$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
New-Item -ItemType Directory -Force -Path '.local' | Out-Null
$nodeExe = (Get-Command node).Source
$tsxCli = Join-Path (Get-Location).Path 'node_modules/tsx/dist/cli.mjs'
if (-not (Test-Path -LiteralPath $tsxCli)) { throw 'Run npm ci first.' }
$dbPort = Get-NetTCPConnection -LocalPort 54329 -State Listen -ErrorAction SilentlyContinue
if (-not $dbPort) {
  $taskArgs = '"' + $tsxCli + '" scripts/local-db.ts'
  Start-Process -FilePath $nodeExe -ArgumentList $taskArgs -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput '.local/db.log' -RedirectStandardError '.local/db-error.log' | Out-Null
  for ($i=0; $i -lt 30; $i++) { if (Get-NetTCPConnection -LocalPort 54329 -State Listen -ErrorAction SilentlyContinue) { break }; Start-Sleep -Seconds 1 }
}
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
npm run demo:seed
if ($LASTEXITCODE -ne 0) { throw 'Demo setup failed.' }
npm run dev
