# Launch the patched Forge client directly, bypassing RPWorld's launcher.
#
# Builds the JVM command from versions/1.20.1-forge-47.4.20/<id>.json + parent
# 1.20.1.json, mirroring exactly what RPWLauncher would do, then runs it
# headless with stdout/stderr captured to logs/.
#
# Stops the JVM after a configurable timeout — long enough for full ModLauncher
# bootstrap, Forge mod discovery, all Mixin transformations, and reaching the
# main menu (or crashing during bootstrap, which is what we want to capture).

param(
    [int]$TimeoutSec = 180,
    [switch]$Vanilla   # restore srg backup, run without our patches (control)
)

. $PSScriptRoot\_paths.ps1

if ($Vanilla) {
    Write-Host "VANILLA MODE: restoring srg jar from backup before launch" -ForegroundColor Yellow
    & "$PSScriptRoot\restore.ps1" -RestoreJar | Out-Null
}

$gameDir = $RPWORLD
$verDir  = Join-Path $RPWORLD_VER '1.20.1-forge-47.4.20'
$forgeJsonPath  = Join-Path $verDir '1.20.1-forge-47.4.20.json'
$vanillaJsonPath = Join-Path $RPWORLD_VER '1.20.1\1.20.1.json'
Assert-Path $forgeJsonPath 'forge profile JSON'
Assert-Path $vanillaJsonPath 'vanilla profile JSON'

$forgeJson   = Get-Content $forgeJsonPath -Raw | ConvertFrom-Json
$vanillaJson = Get-Content $vanillaJsonPath -Raw | ConvertFrom-Json

$libDir   = Join-Path $RPWORLD 'libraries'
$natDir   = Join-Path $verDir  '1.20.1-forge-47.4.20-natives'
$assetIdx = $vanillaJson.assetIndex.id
$assetDir = Join-Path $RPWORLD 'assets'
$mainCls  = $forgeJson.mainClass

# Resolve every library jar (forge entries override vanilla on artifact key)
function Resolve-LibPath($lib) {
    if ($lib.downloads -and $lib.downloads.artifact -and $lib.downloads.artifact.path) {
        return Join-Path $libDir $lib.downloads.artifact.path
    }
    if ($lib.name) {
        # name format: group:artifact:version[:classifier]
        $parts = $lib.name -split ':'
        $g = $parts[0] -replace '\.', '/'
        $a = $parts[1]; $v = $parts[2]
        $cls = if ($parts.Count -gt 3) { "-$($parts[3])" } else { '' }
        return Join-Path $libDir "$g/$a/$v/$a-$v$cls.jar"
    }
    return $null
}

$libsByKey = @{}   # key=group:artifact, value=path. Forge overrides vanilla
foreach ($lib in $vanillaJson.libraries) {
    $p = Resolve-LibPath $lib; if (-not $p -or -not (Test-Path $p)) { continue }
    $key = ($lib.name -split ':')[0..1] -join ':'
    $libsByKey[$key] = $p
}
foreach ($lib in $forgeJson.libraries) {
    $p = Resolve-LibPath $lib; if (-not $p -or -not (Test-Path $p)) { continue }
    $key = ($lib.name -split ':')[0..1] -join ':'
    $libsByKey[$key] = $p
}
# include the vanilla client jar itself
$clientJar = Join-Path $RPWORLD_VER '1.20.1\1.20.1.jar'
if (Test-Path $clientJar) { $libsByKey['__client__'] = $clientJar }

$cpEntries = $libsByKey.Values | Sort-Object -Unique
Write-Host ("classpath entries: {0}" -f $cpEntries.Count) -ForegroundColor DarkGray

$cp = $cpEntries -join ';'

# ---- assemble JVM args from forge JSON template ----
$placeholders = @{
    '${library_directory}'  = $libDir
    '${classpath_separator}' = ';'
    '${version_name}'       = '1.20.1-forge-47.4.20'
    '${natives_directory}'  = $natDir
    '${launcher_name}'      = 'rpworld-engine-launch'
    '${launcher_version}'   = '1.0'
    '${classpath}'          = $cp
}

function Resolve-Tmpl($s) {
    foreach ($k in $placeholders.Keys) { $s = $s.Replace($k, $placeholders[$k]) }
    return $s
}

$jvmArgs = @()
foreach ($a in $forgeJson.arguments.jvm) {
    if ($a -is [string]) { $jvmArgs += (Resolve-Tmpl $a) }
}
# heap settings (RPWLauncher passed 0M which is broken; default to 4G)
$jvmArgs += '-Xmx4G'
$jvmArgs += '-Xms1G'
# headless safety: don't actually keep the window open forever; we'll kill via timeout
$jvmArgs += "-Dlog4j2.formatMsgNoLookups=true"

# game args: vanilla template + forge overrides
$gameArgs = @()
foreach ($a in $vanillaJson.arguments.game) {
    if ($a -is [string]) { $gameArgs += (Resolve-Tmpl $a) }
}
foreach ($a in $forgeJson.arguments.game) {
    if ($a -is [string]) { $gameArgs += (Resolve-Tmpl $a) }
}
# Substitute the few remaining auth/user placeholders with offline values
$gamePlaceholders = @{
    '${auth_player_name}'     = 'RpwePatchTest'
    '${version_name}'         = '1.20.1-forge-47.4.20'
    '${game_directory}'       = $gameDir
    '${assets_root}'          = $assetDir
    '${assets_index_name}'    = $assetIdx
    '${auth_uuid}'            = '00000000-0000-0000-0000-000000000000'
    '${auth_access_token}'    = '0'
    '${clientid}'             = ''
    '${auth_xuid}'            = ''
    '${user_type}'            = 'legacy'
    '${version_type}'         = 'release'
    '${resolution_width}'     = '854'
    '${resolution_height}'    = '480'
    '${user_properties}'      = '{}'
}
$gameArgs = $gameArgs | ForEach-Object {
    $s = $_
    foreach ($k in $gamePlaceholders.Keys) { $s = $s.Replace($k, $gamePlaceholders[$k]) }
    $s
}
# strip any conditional blocks (objects) - already filtered by $a -is [string]

$logsDir = Join-Path $RPWE_ROOT 'logs'; New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$tag = if ($Vanilla) { 'vanilla' } else { 'patched' }
$stdoutFile = Join-Path $logsDir "launch-$tag.stdout.log"
$stderrFile = Join-Path $logsDir "launch-$tag.stderr.log"
$cmdDump    = Join-Path $logsDir "launch-$tag.cmd.txt"

$java = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot\bin\java.exe'

# write the full command for inspection
@($java; $jvmArgs; $mainCls; $gameArgs) | Out-File $cmdDump -Encoding UTF8
Write-Host "command dump: $cmdDump" -ForegroundColor DarkGray

Write-Host "launching ($tag, timeout ${TimeoutSec}s)..." -ForegroundColor Cyan
$allArgs = $jvmArgs + @($mainCls) + $gameArgs

$proc = Start-Process -FilePath $java `
    -ArgumentList $allArgs `
    -WorkingDirectory $gameDir `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -PassThru -NoNewWindow

Write-Host "  pid=$($proc.Id), monitoring..." -ForegroundColor DarkGray

# Wait/monitor
$start = Get-Date
$crashed = $false
while ($true) {
    if ($proc.HasExited) {
        $elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
        Write-Host ("  process exited at {0}s with code {1}" -f $elapsed, $proc.ExitCode) -ForegroundColor (@{$true='Red'; $false='Yellow'}[$proc.ExitCode -ne 0])
        $crashed = ($proc.ExitCode -ne 0)
        break
    }
    if (((Get-Date) - $start).TotalSeconds -ge $TimeoutSec) {
        Write-Host "  reached ${TimeoutSec}s timeout, killing..." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        # wait briefly for child JVM processes
        Get-Process -Name java -ErrorAction SilentlyContinue | Where-Object { $_.Id -eq $proc.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
        break
    }
    Start-Sleep -Seconds 2
}

Write-Host "`nlogs:" -ForegroundColor Cyan
Write-Host "  stdout: $stdoutFile  ($((Get-Item $stdoutFile -ErrorAction SilentlyContinue).Length) bytes)"
Write-Host "  stderr: $stderrFile  ($((Get-Item $stderrFile -ErrorAction SilentlyContinue).Length) bytes)"

if ($crashed) {
    Write-Host "`n--- last 60 lines of stderr ---" -ForegroundColor Red
    Get-Content $stderrFile -Tail 60 -ErrorAction SilentlyContinue
}
