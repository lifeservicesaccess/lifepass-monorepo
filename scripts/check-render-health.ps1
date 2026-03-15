param(
  [string]$ApiBaseUrl = 'https://lifepass-api.onrender.com',
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'

function Normalize-BaseUrl {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw 'ApiBaseUrl is required.'
  }

  return $Value.TrimEnd('/')
}

function Add-Finding {
  param(
    [System.Collections.Generic.List[object]]$Findings,
    [string]$Severity,
    [string]$Check,
    [string]$Why,
    [string]$Action,
    [string[]]$EnvVars
  )

  $Findings.Add([pscustomobject]@{
    Severity = $Severity
    Check = $Check
    EnvVars = ($EnvVars -join ', ')
    Why = $Why
    Action = $Action
  }) | Out-Null
}

function Get-FindingsForCheck {
  param([pscustomobject]$Item)

  $findings = New-Object 'System.Collections.Generic.List[object]'
  $check = [string]$Item.check
  $status = [string]$Item.status
  $detail = [string]$Item.detail

  switch ($check) {
    'CORS_ALLOWED_ORIGINS configured' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'critical' $check 'Production browser requests will be blocked by CORS.' 'Render dashboard -> lifepass-api -> Environment -> set CORS_ALLOWED_ORIGINS to the deployed web origin, then redeploy.' @('CORS_ALLOWED_ORIGINS')
      }
    }
    'API_KEY set' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'critical' $check 'Protected routes are not configured as intended for production.' 'Render dashboard -> lifepass-api -> Environment -> set API_KEY. Also set the same API_KEY in the hosted web app for the Next.js /api/mint proxy.' @('API_KEY')
      }
    }
    'PRIVATE_KEY format' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'critical' $check 'The server signer cannot initialize correctly with this value.' 'Render dashboard -> lifepass-api -> Environment -> replace PRIVATE_KEY with a valid 0x-prefixed 64-byte hex key.' @('PRIVATE_KEY')
      }
    }
    'SBT_CONTRACT_ADDRESS format' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'critical' $check 'Minting cannot use the on-chain contract with an invalid address.' 'Render dashboard -> lifepass-api -> Environment -> set SBT_CONTRACT_ADDRESS to the deployed LifePassSBT contract address.' @('SBT_CONTRACT_ADDRESS')
      }
    }
    'On-chain mint mode' {
      if ($status -ne 'pass') {
        Add-Finding $findings 'warning' $check 'The API will simulate minting instead of using the chain.' 'Render dashboard -> lifepass-api -> Environment -> ensure RPC_URL, PRIVATE_KEY, and SBT_CONTRACT_ADDRESS are all present and correct.' @('RPC_URL', 'PRIVATE_KEY', 'SBT_CONTRACT_ADDRESS')
      }
    }
    'TRUST_REGISTRY_ADDRESS format' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'warning' $check 'Trust action anchoring cannot use an invalid registry address.' 'Render dashboard -> lifepass-api -> Environment -> set TRUST_REGISTRY_ADDRESS to the deployed LifePassTrustRegistry address.' @('TRUST_REGISTRY_ADDRESS')
      }
    }
    'On-chain action anchoring mode' {
      if ($status -ne 'pass') {
        Add-Finding $findings 'warning' $check 'Milestone anchors will fall back to simulated mode.' 'Render dashboard -> lifepass-api -> Environment -> ensure RPC_URL, PRIVATE_KEY, and TRUST_REGISTRY_ADDRESS are all present and correct.' @('RPC_URL', 'PRIVATE_KEY', 'TRUST_REGISTRY_ADDRESS')
      }
    }
    'AGE_VERIFIER_ADDRESS format' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'critical' $check 'Proof verification is not fully configured for production.' 'Render dashboard -> lifepass-api -> Environment -> set AGE_VERIFIER_ADDRESS to a valid contract address. If this is intentionally optional outside production, also verify REQUIRE_AGE_VERIFIER.' @('AGE_VERIFIER_ADDRESS', 'REQUIRE_AGE_VERIFIER')
      }
    }
    'LIFEPASS_SSO_JWT_SECRET configured' {
      if ($status -ne 'pass') {
        Add-Finding $findings 'warning' $check 'SSO token issue and verify endpoints will not work.' 'Render dashboard -> lifepass-api -> Environment -> set LIFEPASS_SSO_JWT_SECRET and redeploy.' @('LIFEPASS_SSO_JWT_SECRET')
      }
    }
    'POLICY_TWO_PERSON_REQUIRED readiness' {
      if ($status -eq 'fail') {
        Add-Finding $findings 'warning' $check 'Policy changes are blocked because the approval configuration is incomplete.' 'Render dashboard -> lifepass-api -> Environment -> set POLICY_APPROVAL_SIGNING_KEYS_JSON and POLICY_REQUIRED_APPROVALS, or disable POLICY_TWO_PERSON_REQUIRED.' @('POLICY_TWO_PERSON_REQUIRED', 'POLICY_APPROVAL_SIGNING_KEYS_JSON', 'POLICY_REQUIRED_APPROVALS')
      }
    }
    'USE_SNARKJS in production' {
      if ($status -eq 'warn') {
        Add-Finding $findings 'info' $check 'The API is using fallback proof generation instead of configured SNARK artifacts.' 'If real SNARK mode is required, set USE_SNARKJS=1 and provide SNARK_WASM_PATH, SNARK_ZKEY_PATH, and SNARK_VKEY_PATH in the deployment environment.' @('USE_SNARKJS', 'SNARK_WASM_PATH', 'SNARK_ZKEY_PATH', 'SNARK_VKEY_PATH')
      }
    }
  }

  return $findings
}

$baseUrl = Normalize-BaseUrl -Value $ApiBaseUrl
$healthUrl = "$baseUrl/health"

Write-Host ''
Write-Host 'LifePass Render Health Check' -ForegroundColor Cyan
Write-Host "Endpoint: $healthUrl" -ForegroundColor Cyan

try {
  $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec $TimeoutSeconds
} catch {
  Write-Host '' -ForegroundColor Red
  Write-Host "Failed to fetch $healthUrl" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

if (-not $response.success) {
  Write-Host '' -ForegroundColor Red
  Write-Host 'Health endpoint responded without success=true.' -ForegroundColor Red
  $response | ConvertTo-Json -Depth 8
  exit 1
}

$checks = @($response.checks)

Write-Host ''
Write-Host ('Service: {0}   Mode: {1}   hasCriticalFailure: {2}' -f $response.service, $response.mode, $response.hasCriticalFailure) -ForegroundColor Yellow
Write-Host ''

$checks |
  Select-Object @{Name='Status';Expression={$_.status.ToUpper()}}, check, detail |
  Format-Table -AutoSize

$allFindings = New-Object 'System.Collections.Generic.List[object]'
foreach ($item in $checks) {
  $mapped = Get-FindingsForCheck -Item $item
  foreach ($finding in $mapped) {
    $allFindings.Add($finding) | Out-Null
  }
}

Write-Host ''
if ($allFindings.Count -eq 0) {
  Write-Host 'No obvious broken env mappings were detected from /health.' -ForegroundColor Green
  Write-Host 'If requests still fail, inspect endpoint-specific logs and compare them against docs/render-log-playbook.md.' -ForegroundColor Green
  exit 0
}

Write-Host 'Likely Broken Env Or Config Areas' -ForegroundColor Cyan
$allFindings |
  Sort-Object @{Expression='Severity';Descending=$false}, Check |
  Format-Table -AutoSize

$criticalCount = @($allFindings | Where-Object { $_.Severity -eq 'critical' }).Count
$warningCount = @($allFindings | Where-Object { $_.Severity -eq 'warning' }).Count

Write-Host ''
Write-Host 'Recommended next Render dashboard action:' -ForegroundColor Cyan
Write-Host 'Open lifepass-api -> Environment, fix the critical items first, save changes, wait for redeploy, then rerun this script.'

if ($criticalCount -gt 0) {
  exit 2
}

if ($warningCount -gt 0) {
  exit 0
}

exit 0
