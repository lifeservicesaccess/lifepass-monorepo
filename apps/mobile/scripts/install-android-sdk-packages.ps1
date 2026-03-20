param(
  [string]$SdkRoot = $(Join-Path $env:LOCALAPPDATA 'Android\Sdk')
)

$ErrorActionPreference = 'Stop'

$cmdlineBin = Join-Path $SdkRoot 'cmdline-tools\latest\bin'
$sdkManager = Join-Path $cmdlineBin 'sdkmanager.bat'
$avdManager = Join-Path $cmdlineBin 'avdmanager.bat'

$jdkCandidates = @(
  $env:JAVA_HOME,
  [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User'),
  'C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot',
  'C:\Program Files\Android\Android Studio\jbr'
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $jdkCandidates -or $jdkCandidates.Count -eq 0) {
  throw 'No supported JDK installation was found for sdkmanager.'
}

$env:JAVA_HOME = $jdkCandidates[0]

if (-not (Test-Path $sdkManager)) {
  throw "sdkmanager.bat not found at $sdkManager"
}

$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$cmdlineBin;$(Join-Path $SdkRoot 'platform-tools');$(Join-Path $SdkRoot 'emulator');$env:Path"

$licenseInput = @('y') * 20
$licenseInput | & $sdkManager --sdk_root=$SdkRoot --licenses | Out-Host

$packages = @(
  'platform-tools',
  'platforms;android-34',
  'build-tools;34.0.0',
  'emulator',
  'system-images;android-34;google_apis;x86_64'
)

& $sdkManager --sdk_root=$SdkRoot $packages

if (-not (Test-Path $avdManager)) {
  throw "avdmanager.bat not found at $avdManager"
}

Write-Output "JAVA_HOME=$env:JAVA_HOME"
Write-Output "SDK_ROOT=$SdkRoot"
Write-Output "AVDMANAGER_PATH=$avdManager"