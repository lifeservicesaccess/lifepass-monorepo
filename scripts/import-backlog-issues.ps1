param(
  [string]$Repo = "lifeservicesaccess/lifepass-monorepo",
  [string]$CsvPath = "docs/github-issues-backlog.csv",
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GhCmd = $null
$ghLookup = Get-Command gh -ErrorAction SilentlyContinue
if ($ghLookup) {
  $GhCmd = $ghLookup.Source
} else {
  $commonGh = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $commonGh) {
    $GhCmd = $commonGh
  }
}

if (-not $GhCmd) {
  throw "GitHub CLI (gh) is required. Install from https://cli.github.com/ and reopen your terminal."
}

$authOk = $true
try {
  & $GhCmd auth status *> $null
  if ($LASTEXITCODE -ne 0) { $authOk = $false }
} catch {
  $authOk = $false
}

if (-not $authOk -and -not $DryRun) {
  throw "GitHub CLI is not authenticated. Run: gh auth login"
}

if (-not (Test-Path $CsvPath)) {
  throw "CSV not found at $CsvPath"
}

$items = Import-Csv -Path $CsvPath
if (-not $items -or $items.Count -eq 0) {
  throw "No rows found in $CsvPath"
}

$keyToIssue = @{}

Write-Host "Creating issues from $CsvPath into $Repo ..."
foreach ($item in $items) {
  $labels = @()
  if ($item.labels) {
    $labels = $item.labels.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }

  $body = @"
Backlog Key: $($item.key)
Priority: $($item.priority)

$($item.body)
"@

  if ($DryRun) {
    Write-Host "[DRY-RUN] Would create: $($item.key) $($item.title) labels=[$($labels -join ', ')]"
    continue
  }

  $args = @("issue", "create", "--repo", $Repo, "--title", $item.title, "--body", $body)
  foreach ($label in $labels) {
    $args += @("--label", $label)
  }

  $raw = & $GhCmd @args 2>$null
  $url = if ($raw) { "$raw".Trim() } else { "" }
  if (-not $url) {
    throw "Failed to create issue for key $($item.key)"
  }

  $number = $url.Split('/')[-1]
  $keyToIssue[$item.key] = [int]$number
  Write-Host "Created $($item.key) -> #$number"
}

if ($DryRun) {
  Write-Host "Dry run complete. No issues were created."
  exit 0
}

Write-Host "Applying dependency links ..."
foreach ($item in $items) {
  if (-not $item.depends_on) { continue }

  if (-not $keyToIssue.ContainsKey($item.key)) {
    Write-Warning "Skipping dependencies for missing key mapping: $($item.key)"
    continue
  }

  $issueNumber = $keyToIssue[$item.key]
  $depKeys = $item.depends_on.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $depNums = @()
  foreach ($depKey in $depKeys) {
    if ($keyToIssue.ContainsKey($depKey)) {
      $depNums += "#$($keyToIssue[$depKey])"
    } else {
      $depNums += "$depKey (not found)"
    }
  }

  if ($depNums.Count -gt 0) {
    $comment = "Dependencies: blocked by " + ($depNums -join ', ')
    & $GhCmd issue comment $issueNumber --repo $Repo --body $comment | Out-Null
    Write-Host "Linked dependencies for #$issueNumber -> $($depNums -join ', ')"
  }
}

Write-Host "Done. Issues and dependency comments created."