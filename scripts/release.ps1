<#
.SYNOPSIS
  Releases Pixelbench: checks, version bump, commit, tag and push. The Release workflow does the rest.

.EXAMPLE
  ./scripts/release.ps1 0.3.0-beta.1
  ./scripts/release.ps1 0.3.0-beta.1 -DryRun     # only validates, changes nothing
  ./scripts/release.ps1 0.3.0-beta.1 -SkipChecks # skips lint, format check and tests
  ./scripts/release.ps1 0.3.0-beta.1 -Yes        # skips the confirmation prompt
#>
param(
  [Parameter(Mandatory)][string]$Version,
  [switch]$DryRun,
  [switch]$SkipChecks,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Fail($text) { throw $text }

# Runs a native command and stops when it fails.
function Run {
  & $args[0] $args[1..($args.Count - 1)]
  if ($LASTEXITCODE -ne 0) { Fail "Failed: $($args -join ' ')" }
}

$Version = $Version.TrimStart('v')
$tag = "v$Version"
if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') {
  Fail "'$Version' is not a valid version. Use for example 0.3.0 or 0.3.0-beta.1."
}

Step 'Validating'
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if (git status --porcelain) { Fail 'The working tree is not clean. Commit or stash your changes first.' }
git fetch --tags origin
if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' }
if (git tag --list $tag) { Fail "Tag $tag already exists locally." }
if (git ls-remote --tags origin "refs/tags/$tag") { Fail "Tag $tag already exists on origin." }
if (git rev-list "HEAD..origin/$branch" 2>$null) { Fail "origin/$branch has commits you do not have. Pull first." }

$current = (Get-Content package.json -Raw | ConvertFrom-Json).version
node -e "process.exit(require('semver').gt(process.argv[1], process.argv[2]) ? 0 : 1)" $Version $current
if ($LASTEXITCODE -ne 0) { Fail "$Version is not newer than the current version $current." }

if ((Get-Content CHANGELOG.md -Raw) -notmatch "(?m)^## \[$([regex]::Escape($Version))\]") {
  Fail "CHANGELOG.md has no '## [$Version]' section. Add it (and the link at the bottom) first."
}
Write-Host "Branch $branch, $current -> $Version, tag $tag"
if ($branch -ne 'main') {
  Write-Host "Note: you are on '$branch', not main. Merge it into main after the release." -ForegroundColor Yellow
}

if ($DryRun) { Write-Host "`nDry run finished. Nothing was changed." -ForegroundColor Green; return }

if (-not $SkipChecks) {
  Step 'Lint, format check and tests'
  Run npm run lint
  Run npm run format:check
  Run npm test
}

$answer = if ($Yes) { 'y' } else { Read-Host "`nBump to $Version, commit, tag $tag and push '$branch' plus the tag to origin? [y/N]" }
if ($answer -notmatch '^(y|yes|j|ja)$') { Write-Host 'Aborted. Nothing was changed.'; return }

Step 'Bumping the version'
Run npm version $Version --no-git-tag-version
Run git add package.json package-lock.json
Run git commit -m "Set version to $Version"
Run git tag -a $tag -m "Pixelbench $tag"

Step 'Pushing'
Run git push origin $branch
Run git push origin $tag

Write-Host "`nDone. The Release workflow builds and publishes ${tag}:" -ForegroundColor Green
Write-Host 'https://github.com/Fenrir200678/pixelbench/actions'
