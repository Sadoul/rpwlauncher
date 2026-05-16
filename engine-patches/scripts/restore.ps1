# Restore vanilla decompiled files from ../original/ snapshots.

. $PSScriptRoot\_paths.ps1

Assert-Path $MCP_SRC      'MCP-Reborn src'
Assert-Path $RPWE_ORIGINAL 'engine-patches/original'

$restored = 0
foreach ($name in $RPWE_FILE_MAP.Keys) {
    $rel      = $RPWE_FILE_MAP[$name]
    $vanilla  = Join-Path $MCP_SRC $rel
    $snapshot = Join-Path $RPWE_ORIGINAL $name

    if (-not (Test-Path $snapshot)) { Write-Warning "no snapshot for $name (skipped)"; continue }

    Copy-Item $snapshot $vanilla -Force
    Write-Host "  restored $name" -ForegroundColor Yellow
    $restored++
}

Write-Host "`nRestored $restored file(s)." -ForegroundColor Cyan
