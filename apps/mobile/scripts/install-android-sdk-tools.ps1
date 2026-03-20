param(
  [string]$SdkRoot = $(Join-Path $env:LOCALAPPDATA 'Android\Sdk')
)

$ErrorActionPreference = 'Stop'

$cmdlineRoot = Join-Path $SdkRoot 'cmdline-tools'
$latestRoot = Join-Path $cmdlineRoot 'latest'
$zipPath = Join-Path $env:TEMP ("commandlinetools-win-{0}.zip" -f ([guid]::NewGuid().ToString('N')))
$url = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'

New-Item -ItemType Directory -Path $SdkRoot -Force | Out-Null
New-Item -ItemType Directory -Path $cmdlineRoot -Force | Out-Null

Write-Output "Downloading Android command-line tools from $url"
Write-Output "ZIP_PATH=$zipPath"
if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
  & curl.exe -L $url -o $zipPath
} else {
  Invoke-WebRequest -Uri $url -OutFile $zipPath
}

if (Test-Path $latestRoot) {
  Remove-Item $latestRoot -Recurse -Force
}

$extractedRoot = Join-Path $cmdlineRoot 'cmdline-tools'
if (Test-Path $extractedRoot) {
  Remove-Item $extractedRoot -Recurse -Force
}

Expand-Archive -Path $zipPath -DestinationPath $cmdlineRoot -Force
Rename-Item -Path $extractedRoot -NewName 'latest'

$sdkManager = Join-Path $latestRoot 'bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
  throw "sdkmanager.bat not found at $sdkManager"
}

Write-Output "SDK_ROOT=$SdkRoot"
Write-Output "SDKMANAGER_PATH=$sdkManager"