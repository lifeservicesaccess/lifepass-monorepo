param(
  [switch]$Persist
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot 'android'
$localPropertiesPath = Join-Path $androidDir 'local.properties'

$jdkCandidates = @(
  'C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot',
  'C:\Program Files\Android\Android Studio\jbr'
)

$sdkCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
  'C:\Users\Elfun Gift\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe'
)

$javaHome = $jdkCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $javaHome) {
  throw 'No supported JDK installation was found.'
}

$androidHome = $sdkCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $androidHome) {
  throw 'No Android SDK root or platform-tools installation was found.'
}

$pathEntries = @(
  (Join-Path $javaHome 'bin'),
  (Join-Path $androidHome 'platform-tools')
)

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
foreach ($entry in $pathEntries) {
  if ((Test-Path $entry) -and -not (($env:Path -split ';') -contains $entry)) {
    $env:Path = "$entry;$env:Path"
  }
}

if ($Persist) {
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidHome, 'User')
  [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $androidHome, 'User')

  $userPath = @([Environment]::GetEnvironmentVariable('Path', 'User') -split ';' | Where-Object { $_ -and $_.Trim() })
  foreach ($entry in $pathEntries) {
    if ((Test-Path $entry) -and ($userPath -notcontains $entry)) {
      $userPath += $entry
    }
  }
  [Environment]::SetEnvironmentVariable('Path', ($userPath -join ';'), 'User')
}

$sdkDirValue = $androidHome.Replace('\', '\\')
Set-Content -Path $localPropertiesPath -Value "sdk.dir=$sdkDirValue" -Encoding ascii

$requiredSdkPaths = @(
  (Join-Path $androidHome 'platforms\android-34'),
  (Join-Path $androidHome 'build-tools\34.0.0')
)

$missingSdkPieces = $requiredSdkPaths | Where-Object { -not (Test-Path $_) }

Write-Output "JAVA_HOME=$javaHome"
Write-Output "ANDROID_HOME=$androidHome"
Write-Output "local.properties written to $localPropertiesPath"

if ($missingSdkPieces.Count -gt 0) {
  Write-Warning 'Android SDK platform/build-tools 34.0.0 are still missing.'
  $missingSdkPieces | ForEach-Object { Write-Output "Missing: $_" }
  Write-Output 'Next step: open Android Studio, install SDK platform/build-tools 34.0.0, then run npm run doctor and npm run android.'
} else {
  Write-Output 'Android SDK platform/build-tools 34.0.0 detected.'
}