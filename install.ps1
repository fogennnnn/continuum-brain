# ContinuumBrain-v1 install: Node check only. ASCII-safe for PowerShell 5.1.
$ErrorActionPreference = "Stop"
try { $ver = (& node --version) } catch { Write-Output "ERROR: node is not installed. Install Node.js 22+ first."; exit 1 }
$num = $ver.TrimStart("v")
$major = [int]($num.Split(".")[0])
if ($major -lt 22) { Write-Output ("ERROR: Node 22+ required (found " + $ver + ")."); exit 1 }
Write-Output ("Node " + $ver + " OK (22+ required). No packages to install (zero dependencies).")
& node src/demo.js > $null
if ($LASTEXITCODE -ne 0) { Write-Output "smoke demo FAILED"; exit 1 }
Write-Output "smoke demo OK"
