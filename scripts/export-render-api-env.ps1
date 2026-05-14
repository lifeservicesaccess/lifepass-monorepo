# Export Render API Environment Variables
# Usage: .\export-render-api-env.ps1 [-ServiceId <service_id>] [-OutFile <path>]
# Requires: RENDER_API_KEY environment variable set (with read access)

param(
    [string]$ServiceId = $env:RENDER_SERVICE_ID,
    [string]$OutFile = ".render-api.env"
)

if (-not $ServiceId) {
    Write-Error "ServiceId not provided. Set RENDER_SERVICE_ID env var or use -ServiceId."
    exit 1
}
if (-not $env:RENDER_API_KEY) {
    Write-Error "RENDER_API_KEY environment variable not set."
    exit 1
}

$headers = @{ "Authorization" = "Bearer $($env:RENDER_API_KEY)" }
$uri = "https://api.render.com/v1/services/$ServiceId/env-vars"

try {
    $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
    $envs = $response.envVars | Where-Object { $_.value -ne $null } | ForEach-Object { "{0}={1}" -f $_.key, $_.value }
    Set-Content -Path $OutFile -Value $envs
    Write-Host "Exported Render env vars to $OutFile"
    exit 0
} catch {
    Write-Error "Failed to fetch env vars from Render: $_"
    exit 2
}
