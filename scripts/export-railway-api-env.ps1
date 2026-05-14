# Export Railway API Environment Variables
# Usage: .\export-railway-api-env.ps1 [-ProjectId <project_id>] [-ServiceName <service_name>] [-OutFile <path>]
# Requires: RAILWAY_API_TOKEN environment variable set (with read access)

param(
    [string]$ProjectId = $env:RAILWAY_PROJECT_ID,
    [string]$ServiceName = $env:RAILWAY_SERVICE_NAME,
    [string]$OutFile = ".railway-api.env"
)

if (-not $ProjectId) {
    Write-Error "ProjectId not provided. Set RAILWAY_PROJECT_ID env var or use -ProjectId."
    exit 1
}
if (-not $ServiceName) {
    Write-Error "ServiceName not provided. Set RAILWAY_SERVICE_NAME env var or use -ServiceName."
    exit 1
}
if (-not $env:RAILWAY_API_TOKEN) {
    Write-Error "RAILWAY_API_TOKEN environment variable not set."
    exit 1
}

$headers = @{ "Authorization" = "Bearer $($env:RAILWAY_API_TOKEN)" }
$uri = "https://backboard.railway.app/graphql/v2"
$body = @{ query = @"
query EnvVars {
  project(id: \"$ProjectId\") {
    services {
      name
      environments {
        variables {
          key
          value
        }
      }
    }
  }
}
"@ } | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $body -ContentType 'application/json'
    $service = $response.data.project.services | Where-Object { $_.name -eq $ServiceName }
    if (-not $service) { Write-Error "Service $ServiceName not found in project $ProjectId"; exit 2 }
    $envs = $service.environments[0].variables | Where-Object { $_.value -ne $null } | ForEach-Object { "{0}={1}" -f $_.key, $_.value }
    Set-Content -Path $OutFile -Value $envs
    Write-Host "Exported Railway env vars to $OutFile"
    exit 0
} catch {
    Write-Error "Failed to fetch env vars from Railway: $_"
    exit 3
}
