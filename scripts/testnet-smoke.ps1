param(
  [ValidateSet('testnet', 'simulated')]
  [string]$Mode = 'testnet',
  [switch]$SkipApply,
  [switch]$AllowSimulatedMint,
  [switch]$SkipPreflight,
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'services/api'
$readinessScript = Join-Path $PSScriptRoot 'testnet-readiness.ps1'
$apiEnvLocalPath = Join-Path $repoRoot 'services/api/.env.local'
$apiEnvPath = Join-Path $repoRoot 'services/api/.env'
$webEnvLocalPath = Join-Path $repoRoot 'apps/web/.env.local'
$webEnvPath = Join-Path $repoRoot 'apps/web/.env'

function Read-DotEnvFile {
  param([string]$Path)
  $result = @{}
  if (-not (Test-Path $Path)) { return $result }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $result[$key] = $value
  }

  return $result
}

function Get-Value {
  param(
    [string]$Name,
    [hashtable]$ApiLocal,
    [hashtable]$Api,
    [hashtable]$WebLocal,
    [hashtable]$Web
  )

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) { return $envValue }
  if ($ApiLocal.ContainsKey($Name)) { return $ApiLocal[$Name] }
  if ($Api.ContainsKey($Name)) { return $Api[$Name] }
  if ($WebLocal.ContainsKey($Name)) { return $WebLocal[$Name] }
  if ($Web.ContainsKey($Name)) { return $Web[$Name] }
  return ''
}

function Is-HexAddress {
  param([string]$Value)
  return $Value -match '^0x[a-fA-F0-9]{40}$'
}

function Is-HexPrivateKey {
  param([string]$Value)
  return $Value -match '^0x[a-fA-F0-9]{64}$'
}

function Test-ConfiguredPathExists {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $false }
  return Test-Path -Path $PathValue
}

function Mask-Value {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '<empty>' }

  $len = $Value.Length
  if ($len -le 12) { return ('*' * $len) }
  return '{0}...{1}' -f $Value.Substring(0, 6), $Value.Substring($len - 4)
}

function Show-PreflightSummary {
  param(
    [string]$Mode
  )

  $apiLocal = Read-DotEnvFile -Path $apiEnvLocalPath
  $api = Read-DotEnvFile -Path $apiEnvPath
  $webLocal = Read-DotEnvFile -Path $webEnvLocalPath
  $web = Read-DotEnvFile -Path $webEnvPath

  $rpcUrl = Get-Value -Name 'RPC_URL' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $privateKey = Get-Value -Name 'PRIVATE_KEY' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $sbtAddress = Get-Value -Name 'SBT_CONTRACT_ADDRESS' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $ageVerifier = Get-Value -Name 'AGE_VERIFIER_ADDRESS' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $wcProjectId = Get-Value -Name 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $useSnark = Get-Value -Name 'USE_SNARKJS' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $snarkWasmPath = Get-Value -Name 'SNARK_WASM_PATH' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $snarkZkeyPath = Get-Value -Name 'SNARK_ZKEY_PATH' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $snarkVkeyPath = Get-Value -Name 'SNARK_VKEY_PATH' -ApiLocal $apiLocal -Api $api -WebLocal $webLocal -Web $web
  $snarkEnabled = $useSnark -eq '1'

  $rows = @(
    [pscustomobject]@{ Key = 'RPC_URL'; Present = (-not [string]::IsNullOrWhiteSpace($rpcUrl)); Format = 'URL-ish'; Valid = (-not [string]::IsNullOrWhiteSpace($rpcUrl)); Sample = (Mask-Value $rpcUrl) }
    [pscustomobject]@{ Key = 'PRIVATE_KEY'; Present = (-not [string]::IsNullOrWhiteSpace($privateKey)); Format = '0x + 64 hex'; Valid = (Is-HexPrivateKey $privateKey); Sample = (Mask-Value $privateKey) }
    [pscustomobject]@{ Key = 'SBT_CONTRACT_ADDRESS'; Present = (-not [string]::IsNullOrWhiteSpace($sbtAddress)); Format = '0x + 40 hex'; Valid = (Is-HexAddress $sbtAddress); Sample = (Mask-Value $sbtAddress) }
    [pscustomobject]@{ Key = 'AGE_VERIFIER_ADDRESS'; Present = (-not [string]::IsNullOrWhiteSpace($ageVerifier)); Format = 'optional 0x + 40 hex'; Valid = ([string]::IsNullOrWhiteSpace($ageVerifier) -or (Is-HexAddress $ageVerifier)); Sample = (Mask-Value $ageVerifier) }
    [pscustomobject]@{ Key = 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID'; Present = (-not [string]::IsNullOrWhiteSpace($wcProjectId)); Format = 'non-empty'; Valid = (-not [string]::IsNullOrWhiteSpace($wcProjectId)); Sample = (Mask-Value $wcProjectId) }
    [pscustomobject]@{ Key = 'USE_SNARKJS'; Present = $true; Format = '0 or 1'; Valid = ($useSnark -in @('0','1','')); Sample = (Mask-Value $useSnark) }
  )

  if ($snarkEnabled) {
    $rows += [pscustomobject]@{ Key = 'SNARK_WASM_PATH'; Present = (-not [string]::IsNullOrWhiteSpace($snarkWasmPath)); Format = 'existing file path'; Valid = (Test-ConfiguredPathExists $snarkWasmPath); Sample = (Mask-Value $snarkWasmPath) }
    $rows += [pscustomobject]@{ Key = 'SNARK_ZKEY_PATH'; Present = (-not [string]::IsNullOrWhiteSpace($snarkZkeyPath)); Format = 'existing file path'; Valid = (Test-ConfiguredPathExists $snarkZkeyPath); Sample = (Mask-Value $snarkZkeyPath) }
    $rows += [pscustomobject]@{ Key = 'SNARK_VKEY_PATH'; Present = (-not [string]::IsNullOrWhiteSpace($snarkVkeyPath)); Format = 'existing file path'; Valid = (Test-ConfiguredPathExists $snarkVkeyPath); Sample = (Mask-Value $snarkVkeyPath) }
  }

  Write-Host ''
  Write-Host 'Preflight Config Summary (masked)' -ForegroundColor Cyan
  $rows | Format-Table -AutoSize

  $requiredFailures = @()
  if ($Mode -eq 'testnet') {
    $requiredFailures = @($rows | Where-Object {
      ($_.Key -in @('RPC_URL', 'PRIVATE_KEY', 'SBT_CONTRACT_ADDRESS', 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID')) -and (-not $_.Valid)
    })

    if ($snarkEnabled) {
      $requiredFailures += @($rows | Where-Object {
        ($_.Key -in @('SNARK_WASM_PATH', 'SNARK_ZKEY_PATH', 'SNARK_VKEY_PATH')) -and (-not $_.Valid)
      })
    }
  }

  return [pscustomobject]@{
    Rows = $rows
    RequiredFailures = $requiredFailures
    Values = @{
      RPC_URL = $rpcUrl
      SBT_CONTRACT_ADDRESS = $sbtAddress
      USE_SNARKJS = $useSnark
    }
  }
}

function Assert-ContractBytecodePresent {
  param(
    [string]$RpcUrl,
    [string]$ContractAddress
  )

  if ([string]::IsNullOrWhiteSpace($RpcUrl) -or [string]::IsNullOrWhiteSpace($ContractAddress)) {
    throw 'Cannot verify on-chain bytecode: RPC_URL or SBT_CONTRACT_ADDRESS is missing.'
  }

  $payload = @{
    jsonrpc = '2.0'
    method = 'eth_getCode'
    params = @($ContractAddress, 'latest')
    id = 1
  } | ConvertTo-Json -Depth 6 -Compress

  try {
    $resp = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType 'application/json' -Body $payload
  } catch {
    throw "Failed to query RPC URL '$RpcUrl' for contract bytecode. Verify RPC_URL is reachable."
  }

  $code = $resp.result
  if ([string]::IsNullOrWhiteSpace($code) -or $code -eq '0x') {
    throw "No bytecode found at SBT_CONTRACT_ADDRESS ($ContractAddress) on the configured RPC network."
  }
}

function Wait-ForPort {
  param(
    [string]$HostName = '127.0.0.1',
    [int]$Port = 3003,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect($HostName, $Port, $null, $null)
      $connected = $iar.AsyncWaitHandle.WaitOne(1000, $false)
      if ($connected -and $client.Connected) {
        $client.EndConnect($iar)
        $client.Close()
        return $true
      }
      $client.Close()
    } catch {
      # Keep waiting until timeout.
    }
    Start-Sleep -Milliseconds 300
  }

  return $false
}

function Invoke-ReadinessApply {
  param(
    [string]$Mode
  )

  Write-Host "Applying mode '$Mode' via readiness checklist..." -ForegroundColor Cyan
  powershell -ExecutionPolicy Bypass -File $readinessScript -Mode $Mode -Apply
  if ($LASTEXITCODE -ne 0) {
    throw "Readiness apply failed for mode '$Mode'."
  }
}

function Invoke-SmokeTests {
  param(
    [string]$ApiDir,
    [string]$Mode,
    [bool]$AllowSimulatedMint,
    [bool]$UseSnark
  )

  Write-Host "Running smoke-test.js..." -ForegroundColor Cyan
  Push-Location $ApiDir
  try {
    if ($UseSnark) {
      Write-Host "Running validate:snark..." -ForegroundColor Cyan
      npm run validate:snark
      if ($LASTEXITCODE -ne 0) {
        throw 'npm run validate:snark failed.'
      }
    }

    node scripts/smoke-test.js
    if ($LASTEXITCODE -ne 0) {
      throw 'scripts/smoke-test.js failed.'
    }

    Write-Host "Running test_verify_onchain.js..." -ForegroundColor Cyan
    node scripts/test_verify_onchain.js
    if ($LASTEXITCODE -ne 0) {
      throw 'scripts/test_verify_onchain.js failed.'
    }

    if ($Mode -eq 'testnet' -and -not $AllowSimulatedMint) {
      Write-Host "Checking /sbt/mint is not simulated in testnet mode..." -ForegroundColor Cyan
      $tokenId = [int64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $payload = @{
        to = '0x0000000000000000000000000000000000000001'
        tokenId = $tokenId
        metadata = @{
          purpose = 'SmokeTest'
          trustScore = 0
          verificationLevel = 'Silver'
          didUri = ''
        }
      } | ConvertTo-Json -Depth 5

      $resp = Invoke-RestMethod -Uri 'http://localhost:3003/sbt/mint' -Method Post -ContentType 'application/json' -Body $payload
      if ($resp.simulated -eq $true) {
        throw 'Testnet mode is still returning simulated mint. Ensure RPC_URL, PRIVATE_KEY, and SBT_CONTRACT_ADDRESS are valid.'
      }
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $readinessScript)) {
  throw "Missing readiness script: $readinessScript"
}

if (-not (Test-Path $apiDir)) {
  throw "Missing API directory: $apiDir"
}

if (-not $SkipApply) {
  Invoke-ReadinessApply -Mode $Mode
}

 $preflight = $null
if (-not $SkipPreflight) {
  $preflight = Show-PreflightSummary -Mode $Mode

  if ($PreflightOnly) {
    Write-Host ''
    if ($preflight.RequiredFailures.Count -eq 0) {
      Write-Host 'Preflight-only status: READY' -ForegroundColor Green
      exit 0
    }

    Write-Host 'Preflight-only status: NOT READY' -ForegroundColor Yellow
    Write-Host 'Missing or invalid required keys:' -ForegroundColor Yellow
    foreach ($item in $preflight.RequiredFailures) {
      Write-Host "- $($item.Key): expected $($item.Format)" -ForegroundColor Yellow
    }
    exit 1
  }
}

if ($Mode -eq 'testnet' -and -not $AllowSimulatedMint) {
  if ($preflight -and $preflight.RequiredFailures.Count -gt 0) {
    $missing = ($preflight.RequiredFailures | ForEach-Object { $_.Key }) -join ', '
    throw "Required testnet config missing or invalid: $missing"
  }

  # Before starting the API, ensure the configured contract exists on-chain.
  if (-not $preflight) {
    $preflight = Show-PreflightSummary -Mode $Mode
  }
  Assert-ContractBytecodePresent -RpcUrl $preflight.Values.RPC_URL -ContractAddress $preflight.Values.SBT_CONTRACT_ADDRESS
}

$logDir = Join-Path $env:TEMP 'lifepass-smoke'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdoutPath = Join-Path $logDir 'api-stdout.log'
$stderrPath = Join-Path $logDir 'api-stderr.log'
if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -Force }
if (Test-Path $stderrPath) { Remove-Item $stderrPath -Force }

Write-Host 'Starting API server for smoke run...' -ForegroundColor Cyan
$apiProc = Start-Process -FilePath node -ArgumentList 'index.js' -WorkingDirectory $apiDir -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

try {
  if (-not (Wait-ForPort -HostName '127.0.0.1' -Port 3003 -TimeoutSeconds 30)) {
    $stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { '' }
    throw "API did not become ready on port 3003. STDERR:`n$stderr"
  }

  Invoke-SmokeTests -ApiDir $apiDir -Mode $Mode -AllowSimulatedMint:$AllowSimulatedMint -UseSnark:($preflight.Values.USE_SNARKJS -eq '1')

  Write-Host ''
  Write-Host 'Smoke run complete: PASS' -ForegroundColor Green
  Write-Host "Mode: $Mode"
  Write-Host "Logs: $stdoutPath"
  exit 0
} catch {
  Write-Host ''
  Write-Host 'Smoke run complete: FAIL' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red

  if (Test-Path $stdoutPath) {
    Write-Host ''
    Write-Host 'API STDOUT (tail):' -ForegroundColor Yellow
    Get-Content $stdoutPath -Tail 40
  }

  if (Test-Path $stderrPath) {
    Write-Host ''
    Write-Host 'API STDERR (tail):' -ForegroundColor Yellow
    Get-Content $stderrPath -Tail 40
  }

  exit 1
} finally {
  if ($apiProc -and -not $apiProc.HasExited) {
    Stop-Process -Id $apiProc.Id -Force
  }
}
