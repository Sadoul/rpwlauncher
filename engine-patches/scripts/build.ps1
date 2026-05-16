# Build patched Minecraft client jar via MCP-Reborn gradle.

. $PSScriptRoot\_paths.ps1

Assert-Path $MCP_REBORN 'MCP-Reborn'

Push-Location $MCP_REBORN
try {
    Write-Host "running: gradlew build (this can take 10+ minutes on first run)" -ForegroundColor Cyan
    & .\gradlew.bat build --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "gradle build failed with code $LASTEXITCODE" }

    $libs = Join-Path $MCP_REBORN 'build\libs'
    if (-not (Test-Path $libs)) { throw "build/libs not produced" }

    Write-Host "`nartifacts:" -ForegroundColor Green
    Get-ChildItem $libs -Filter *.jar | ForEach-Object { Write-Host "  $($_.FullName) ($([math]::Round($_.Length/1MB,2)) MB)" }
}
finally { Pop-Location }
