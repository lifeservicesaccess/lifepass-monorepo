# GitHub Issues Import

This backlog package includes:
- `docs/github-issues-backlog.csv` (issue definitions)
- `docs/github-issues-mvp-phased.csv` (milestone-phased issue definitions)
- `scripts/import-backlog-issues.ps1` (creates issues + dependency links)

## Required Labels
Create these labels in the repository before import:
- Priority: `P0`, `P1`, `P2`
- Domain: `api`, `contracts`, `web`, `mobile`, `ai`, `ops`

You can create them quickly with GitHub CLI:

```powershell
gh label create P0 --color FF0000 --description "Critical path" --repo lifeservicesaccess/lifepass-monorepo
gh label create P1 --color FBCA04 --description "Core roadmap" --repo lifeservicesaccess/lifepass-monorepo
gh label create P2 --color 0E8A16 --description "Growth/scale" --repo lifeservicesaccess/lifepass-monorepo
gh label create api --color 1D76DB --description "Backend API" --repo lifeservicesaccess/lifepass-monorepo
gh label create contracts --color 5319E7 --description "Smart contracts" --repo lifeservicesaccess/lifepass-monorepo
gh label create web --color 0052CC --description "Web frontend" --repo lifeservicesaccess/lifepass-monorepo
gh label create mobile --color 006B75 --description "Mobile app" --repo lifeservicesaccess/lifepass-monorepo
gh label create ai --color C2E0C6 --description "AI/agent systems" --repo lifeservicesaccess/lifepass-monorepo
gh label create ops --color BFDADC --description "DevOps/SRE/Security" --repo lifeservicesaccess/lifepass-monorepo
```

## Import Command
From repo root:

```powershell
./scripts/import-backlog-issues.ps1 -Repo "lifeservicesaccess/lifepass-monorepo"
```

For milestone-phased import:

```powershell
./scripts/import-backlog-issues.ps1 -Repo "lifeservicesaccess/lifepass-monorepo" -CsvPath "docs/github-issues-mvp-phased.csv"
```

## Dry Run

```powershell
./scripts/import-backlog-issues.ps1 -Repo "lifeservicesaccess/lifepass-monorepo" -DryRun
```

## Notes
- The importer uses `key` and `depends_on` columns in the CSV.
- Dependencies are added as issue comments (e.g., `blocked by #123`).
- If you want native dependency links in Projects, map these issues into a GitHub Project and add linked-item dependencies there.
