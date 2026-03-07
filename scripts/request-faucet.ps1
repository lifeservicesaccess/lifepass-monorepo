param(
  [switch]$Open,
  [decimal]$RecommendedPol = 0.7
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiEnvLocalPath = Join-Path $repoRoot 'services/api/.env.local'

if (-not (Test-Path $apiEnvLocalPath)) {
  throw "Missing env file: $apiEnvLocalPath"
}

function Read-DotEnvFile {
  param([string]$Path)

  $result = @{}
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

$envMap = Read-DotEnvFile -Path $apiEnvLocalPath
$rpcUrl = $envMap['RPC_URL']
$privateKey = $envMap['PRIVATE_KEY']

if ([string]::IsNullOrWhiteSpace($rpcUrl)) {
  throw 'RPC_URL is missing in services/api/.env.local'
}

if ([string]::IsNullOrWhiteSpace($privateKey)) {
  throw 'PRIVATE_KEY is missing in services/api/.env.local'
}

if (-not $privateKey.StartsWith('0x') -or $privateKey.Length -ne 66) {
  throw 'PRIVATE_KEY must be a 0x-prefixed 64-byte hex string'
}

Add-Type -AssemblyName System.Numerics

$Nibbles = '0123456789abcdef'
function Convert-HexToDecimalString {
  param([string]$HexValue)

  $hex = $HexValue.ToLowerInvariant()
  if ($hex.StartsWith('0x')) {
    $hex = $hex.Substring(2)
  }

  $total = [System.Numerics.BigInteger]::Zero
  foreach ($char in $hex.ToCharArray()) {
    $nibble = $Nibbles.IndexOf($char)
    if ($nibble -lt 0) { throw "Invalid hex char: $char" }
    $total = ($total * 16) + $nibble
  }

  return $total
}

$ethersPackagePath = (Join-Path $repoRoot 'services/api/node_modules/ethers') -replace '\\', '/'
$deployerAddress = (& node -e "const { ethers } = require(process.argv[2]); const w = new ethers.Wallet(process.argv[1]); console.log(w.address);" $privateKey $ethersPackagePath).Trim()
if ([string]::IsNullOrWhiteSpace($deployerAddress)) {
  throw 'Failed to derive deployer address from PRIVATE_KEY'
}

$jsonRpcBody = @{
  jsonrpc = '2.0'
  method = 'eth_getBalance'
  params = @($deployerAddress, 'latest')
  id = 1
} | ConvertTo-Json -Depth 4

$balanceResult = Invoke-RestMethod -Method Post -Uri $rpcUrl -ContentType 'application/json' -Body $jsonRpcBody
if (-not $balanceResult.result) {
  throw 'Could not fetch balance from RPC_URL'
}

$balanceWei = Convert-HexToDecimalString -HexValue $balanceResult.result
$weiPerPol = [System.Numerics.BigInteger]::Parse('1000000000000000000')
$balancePol = [decimal]($balanceWei.ToString()) / [decimal]($weiPerPol.ToString())
$balancePolRounded = [Math]::Round($balancePol, 6)

$faucetLinks = @(
  'https://faucet.polygon.technology/',
  'https://faucet.triangleplatform.com/polygon/amoy',
  'https://faucets.chain.link/polygon-amoy'
)

Write-Host ''
Write-Host 'LifePass Amoy Funding Helper' -ForegroundColor Cyan
Write-Host ''
Write-Host "Deployer:           $deployerAddress"
Write-Host "Amoy RPC:            $rpcUrl"
Write-Host "Current POL balance: $balancePolRounded"
Write-Host "Recommended minimum: $RecommendedPol"

if ($balancePol -ge $RecommendedPol) {
  Write-Host 'Status:              PASS (balance looks sufficient)' -ForegroundColor Green
} else {
  $needed = [Math]::Round(($RecommendedPol - $balancePol), 6)
  Write-Host "Status:              NEEDS FUNDING (add at least ~$needed POL)" -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'PolygonScan:'
Write-Host "https://amoy.polygonscan.com/address/$deployerAddress"

Write-Host ''
Write-Host 'Faucets:'
foreach ($url in $faucetLinks) {
  Write-Host "- $url"
}

if ($Open) {
  Start-Process "https://amoy.polygonscan.com/address/$deployerAddress" | Out-Null
  foreach ($url in $faucetLinks) {
    Start-Process $url | Out-Null
  }
}
