param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('render-api', 'railway-api', 'vercel-web')]
  [string]$Target,

  [string]$EnvFile,

  [string]$Label
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$validatorPath = Join-Path $repoRoot 'scripts/validate_deployment_contract.js'

function Resolve-DefaultEnvFile {
  param([string]$Target)

  switch ($Target) {
    'render-api' { return Join-Path $repoRoot '.render-api.env' }
    'railway-api' { return Join-Path $repoRoot '.railway-api.env' }
    'vercel-web' { return Join-Path $repoRoot '.vercel-web.env' }
    default { throw "Unsupported target: $Target" }
  }
}

function Resolve-ValidationArgs {
  param(
    [string]$Target,
    [string]$EnvFile,
    [string]$Label
  )

  switch ($Target) {
    'render-api' {
      return @('--api-env', $EnvFile, '--api-env-label', $(if ($Label) { $Label } else { 'Render production API environment' }))
    }
    'railway-api' {
      return @('--api-env', $EnvFile, '--api-env-label', $(if ($Label) { $Label } else { 'Railway production API environment' }))
    }
    'vercel-web' {
      return @('--web-env', $EnvFile, '--web-env-label', $(if ($Label) { $Label } else { 'Vercel production environment' }))
    }
    default {
      throw "Unsupported target: $Target"
    }
  }
}

if (-not (Test-Path $validatorPath)) {
  throw "Validator script not found at $validatorPath"
}

$resolvedEnvFile = if ([string]::IsNullOrWhiteSpace($EnvFile)) { Resolve-DefaultEnvFile -Target $Target } else { $EnvFile }

if (-not (Test-Path $resolvedEnvFile)) {
  throw "Env snapshot file not found: $resolvedEnvFile`nExport the host environment into this file or pass -EnvFile explicitly."
}

$nodeArgs = @(
  $validatorPath,
  '--skip-render',
  '--skip-railway',
  '--skip-web-env-example'
) + (Resolve-ValidationArgs -Target $Target -EnvFile $resolvedEnvFile -Label $Label)

Write-Host "Validating $Target using $resolvedEnvFile" -ForegroundColor Cyan
& node $nodeArgs

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}