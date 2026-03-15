param(
  [Parameter(Mandatory = $true)]
  [string]$TrustRegistryAddress,
  [string]$ApiBaseUrl = '',
  [string]$ApiKey = '',
  [string]$HolderAddress = '',
  [switch]$SkipApiChecks
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'services/api'
$apiEnvLocalPath = Join-Path $apiDir '.env.local'
$apiEnvPath = Join-Path $apiDir '.env'

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

function Get-ConfigValue {
  param(
    [string]$Name,
    [hashtable]$Primary,
    [hashtable]$Secondary
  )

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($envValue)) { return $envValue }
  if ($Primary.ContainsKey($Name)) { return $Primary[$Name] }
  if ($Secondary.ContainsKey($Name)) { return $Secondary[$Name] }
  return ''
}

function Test-HexAddress {
  param([string]$Value)
  return $Value -match '^0x[a-fA-F0-9]{40}$'
}

function Invoke-RpcGetCode {
  param(
    [string]$RpcUrl,
    [string]$Address,
    [string]$Label
  )

  $payload = @{
    jsonrpc = '2.0'
    method = 'eth_getCode'
    params = @($Address, 'latest')
    id = 1
  } | ConvertTo-Json -Compress

  $resp = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType 'application/json' -Body $payload
  if ([string]::IsNullOrWhiteSpace($resp.result) -or $resp.result -eq '0x') {
    throw "No bytecode found for $Label at $Address"
  }

  return $resp.result
}

function Invoke-NodeInApiDir {
  param([string]$Code)
  Push-Location $apiDir
  try {
    $output = node -e $Code 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      throw $output.Trim()
    }
    return $output.Trim()
  } finally {
    Pop-Location
  }
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $invokeParams = @{
    Method = $Method
    Uri = $Url
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $invokeParams['ContentType'] = 'application/json'
    $invokeParams['Body'] = ($Body | ConvertTo-Json -Depth 10)
  }

  return Invoke-RestMethod @invokeParams
}

$apiLocal = Read-DotEnvFile -Path $apiEnvLocalPath
$api = Read-DotEnvFile -Path $apiEnvPath

$rpcUrl = Get-ConfigValue -Name 'RPC_URL' -Primary $apiLocal -Secondary $api
$privateKey = Get-ConfigValue -Name 'PRIVATE_KEY' -Primary $apiLocal -Secondary $api
$sbtAddress = Get-ConfigValue -Name 'SBT_CONTRACT_ADDRESS' -Primary $apiLocal -Secondary $api
$ageVerifierAddress = Get-ConfigValue -Name 'AGE_VERIFIER_ADDRESS' -Primary $apiLocal -Secondary $api
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $ApiKey = Get-ConfigValue -Name 'API_KEY' -Primary $apiLocal -Secondary $api
}

if ([string]::IsNullOrWhiteSpace($rpcUrl)) { throw 'RPC_URL is missing from services/api env files.' }
if ([string]::IsNullOrWhiteSpace($privateKey)) { throw 'PRIVATE_KEY is missing from services/api env files.' }
if (-not (Test-HexAddress $sbtAddress)) { throw 'SBT_CONTRACT_ADDRESS is missing or invalid.' }
if (-not (Test-HexAddress $TrustRegistryAddress)) { throw 'TrustRegistryAddress must be a valid 0x-prefixed address.' }
if (-not [string]::IsNullOrWhiteSpace($ageVerifierAddress) -and -not (Test-HexAddress $ageVerifierAddress)) { throw 'AGE_VERIFIER_ADDRESS is invalid.' }

Write-Host ''
Write-Host 'Amoy post-deploy verification' -ForegroundColor Cyan
Write-Host "RPC_URL: $rpcUrl"
Write-Host "SBT_CONTRACT_ADDRESS: $sbtAddress"
Write-Host "TRUST_REGISTRY_ADDRESS: $TrustRegistryAddress"
if ($ageVerifierAddress) {
  Write-Host "AGE_VERIFIER_ADDRESS: $ageVerifierAddress"
}

Write-Host ''
Write-Host '1. Verifying deployed bytecode on Amoy...' -ForegroundColor Cyan
Invoke-RpcGetCode -RpcUrl $rpcUrl -Address $sbtAddress -Label 'SBT contract' | Out-Null
Invoke-RpcGetCode -RpcUrl $rpcUrl -Address $TrustRegistryAddress -Label 'trust registry' | Out-Null
if ($ageVerifierAddress) {
  Invoke-RpcGetCode -RpcUrl $rpcUrl -Address $ageVerifierAddress -Label 'age verifier' | Out-Null
}
Write-Host 'Bytecode check passed.' -ForegroundColor Green

Write-Host ''
Write-Host '2. Verifying trust registry owner and updater permission...' -ForegroundColor Cyan
$ownerAndUpdater = Invoke-NodeInApiDir -Code @"
require('./tools/loadEnv').loadApiEnv();
process.env.TRUST_REGISTRY_ADDRESS = '$TrustRegistryAddress';
const { ethers } = require('ethers');
(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
  const abi = [
    'function owner() view returns (address)',
    'function scoreUpdaters(address) view returns (bool)'
  ];
  const contract = new ethers.Contract(process.env.TRUST_REGISTRY_ADDRESS, abi, provider);
  const owner = await contract.owner();
  const updaterEnabled = await contract.scoreUpdaters(wallet.address);
  console.log(JSON.stringify({ owner, deployer: wallet.address, updaterEnabled }));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
"@
$registryState = $ownerAndUpdater | ConvertFrom-Json
Write-Host "Owner: $($registryState.owner)"
Write-Host "Deployer: $($registryState.deployer)"
Write-Host "Updater enabled: $($registryState.updaterEnabled)"
if (-not $registryState.updaterEnabled) {
  throw 'Deployer wallet is not an enabled score updater on the trust registry.'
}

if ([string]::IsNullOrWhiteSpace($HolderAddress)) {
  $HolderAddress = $registryState.deployer
}
if (-not (Test-HexAddress $HolderAddress)) {
  throw 'HolderAddress must be a valid 0x-prefixed address.'
}

if ($SkipApiChecks) {
  Write-Host ''
  Write-Host 'API checks skipped by request.' -ForegroundColor Yellow
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
  throw 'ApiBaseUrl is required unless -SkipApiChecks is used.'
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw 'ApiKey is required for API checks when API_KEY is not available in local env.'
}

$ApiBaseUrl = $ApiBaseUrl.TrimEnd('/')
$healthUrl = "$ApiBaseUrl/health"

Write-Host ''
Write-Host '3. Checking Render API health...' -ForegroundColor Cyan
$health = Invoke-RestMethod -Method Get -Uri $healthUrl
if (-not $health.success) {
  throw 'Render API health endpoint did not return success=true.'
}
Write-Host 'Health check passed.' -ForegroundColor Green

$userId = "render-verify-$(Get-Date -Format 'yyyyMMddHHmmss')"
Write-Host ''
Write-Host "4. Creating verification user $userId and issuing session..." -ForegroundColor Cyan
$signup = Invoke-ApiJson -Method Post -Url "$ApiBaseUrl/onboarding/signup" -Body @{
  userId = $userId
  legalName = 'Render Verify User'
  purposeStatement = 'Verify post-deploy trust registry and milestone flow'
}
if (-not $signup.success) {
  throw 'Signup verification call failed.'
}
$token = $signup.session.token
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Signup did not return a bootstrap session token.'
}
Write-Host 'Signup and session issuance passed.' -ForegroundColor Green

Write-Host ''
Write-Host '5. Creating and anchoring a completed milestone through the API...' -ForegroundColor Cyan
$authHeaders = @{ Authorization = "Bearer $token" }
$milestone = Invoke-ApiJson -Method Post -Url "$ApiBaseUrl/users/$userId/milestones" -Headers $authHeaders -Body @{
  title = 'Verify deployed anchor path'
  status = 'completed'
}
if (-not $milestone.success) {
  throw 'Milestone creation failed.'
}

$anchor = Invoke-ApiJson -Method Post -Url "$ApiBaseUrl/users/$userId/milestones/$($milestone.milestone.id)/anchor" -Headers $authHeaders -Body @{
  holderAddress = $HolderAddress
  metadataUri = 'ipfs://render-postdeploy-verify'
}
if (-not $anchor.success) {
  throw 'Milestone anchor call failed.'
}

Write-Host "Anchor tx hash: $($anchor.anchor.txHash)"
Write-Host "Anchor simulated: $($anchor.anchor.simulated)"
Write-Host 'Milestone anchor API path passed.' -ForegroundColor Green

Write-Host ''
Write-Host '6. Reading holder action hashes directly from the trust registry...' -ForegroundColor Cyan
$actionHashesRaw = Invoke-NodeInApiDir -Code @"
require('./tools/loadEnv').loadApiEnv();
process.env.TRUST_REGISTRY_ADDRESS = '$TrustRegistryAddress';
const { ethers } = require('ethers');
(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const abi = ['function getActionHashes(address holder) view returns (bytes32[])'];
  const contract = new ethers.Contract(process.env.TRUST_REGISTRY_ADDRESS, abi, provider);
  const hashes = await contract.getActionHashes('$HolderAddress');
  console.log(JSON.stringify({ holder: '$HolderAddress', count: hashes.length, hashes }));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
"@
$actionHashes = $actionHashesRaw | ConvertFrom-Json
Write-Host "Holder: $($actionHashes.holder)"
Write-Host "Anchors found: $($actionHashes.count)"
if ([int]$actionHashes.count -lt 1) {
  throw 'No action anchors found for the holder address after API anchor call.'
}
Write-Host 'Direct chain verification passed.' -ForegroundColor Green

Write-Host ''
Write-Host 'Post-deploy verification completed successfully.' -ForegroundColor Green
