# Deploy patched client jar into .rpworld as a new profile "rpworld-engine".
# Reuses the existing 1.20.1-forge-47.4.20 profile JSON (so all libs/forge stay intact),
# only swaps the inner client jar reference.

. $PSScriptRoot\_paths.ps1

Assert-Path $RPWORLD_VER 'rpworld versions/'

$srcProfile = Join-Path $RPWORLD_VER '1.20.1-forge-47.4.20'
$dstProfile = Join-Path $RPWORLD_VER 'rpworld-engine'

Assert-Path $srcProfile 'source profile (forge 47.4.20)'

# Pick newest jar from MCP-Reborn build/libs
$libs = Join-Path $MCP_REBORN 'build\libs'
Assert-Path $libs 'MCP-Reborn build/libs'
$builtJar = Get-ChildItem $libs -Filter *.jar | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $builtJar) { throw 'no jar found in MCP-Reborn build/libs — run build.ps1 first' }
Write-Host "using: $($builtJar.FullName)" -ForegroundColor Cyan

# (Re)create destination profile dir as a copy of the forge profile
if (Test-Path $dstProfile) { Remove-Item $dstProfile -Recurse -Force }
Copy-Item $srcProfile $dstProfile -Recurse

# Rename profile id inside JSON
$oldJson = Join-Path $dstProfile '1.20.1-forge-47.4.20.json'
$newJson = Join-Path $dstProfile 'rpworld-engine.json'
Rename-Item $oldJson $newJson

$json = Get-Content $newJson -Raw | ConvertFrom-Json
$json.id = 'rpworld-engine'
# Inherit from the original forge profile so we don't duplicate forge libs entries.
# If the JSON already uses inheritsFrom, leave it; otherwise add it.
if (-not $json.inheritsFrom) {
    $json | Add-Member -NotePropertyName inheritsFrom -NotePropertyValue '1.20.1-forge-47.4.20' -Force
}
$json | ConvertTo-Json -Depth 50 | Set-Content $newJson -Encoding UTF8

# Drop a marker jar; launcher resolves the actual client.jar via the inherited 1.20.1 profile
# but we want our patched classes to take precedence. Approach:
# repackage built jar as profile jar (rpworld-engine.jar) — launcher will prefer this.
Copy-Item $builtJar.FullName (Join-Path $dstProfile 'rpworld-engine.jar') -Force

Write-Host "`ndeployed profile: rpworld-engine" -ForegroundColor Green
Write-Host 'in your launcher pick "rpworld-engine" instead of "1.20.1-forge-47.4.20".' -ForegroundColor Cyan
Write-Host 'mods/, config/, saves/ are shared via the same .rpworld dir, nothing to copy.' -ForegroundColor DarkGray
