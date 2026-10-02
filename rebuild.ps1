# One-command rebuild: verify Node, run full gates, run demo. ASCII-safe for PowerShell 5.1.
$ErrorActionPreference = "Stop"
& node --version
& npm run gates
if ($LASTEXITCODE -ne 0) { exit 1 }
& npm run demo
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Output "rebuild complete."
