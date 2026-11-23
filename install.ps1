# Pixelbench installer for Windows. Makes sure Node.js is present, then hands over to scripts/setup.mjs.
# Written for Windows PowerShell 5.1, which every Windows 10 and 11 has. Run it through install.cmd.
# Options are passed on to setup.mjs, for example: install.cmd --comfy "D:\ComfyUI_windows_portable"
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$minNode = 24

function Write-Step($text) { Write-Host "`n> $text" }
function Write-Ok($text) { Write-Host '  + ' -ForegroundColor Green -NoNewline; Write-Host $text }
function Write-Problem($text) { Write-Host '  x ' -ForegroundColor Red -NoNewline; Write-Host $text }

function Update-SessionPath {
  # winget changes PATH in the registry only. Reload it so this session sees the new node.exe.
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Get-NodeMajor {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return 0 }
  $version = & $node.Source -p 'process.versions.node' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $version) { return 0 }
  return [int]($version.Split('.')[0])
}

function Install-Node {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Problem "Please install Node.js $minNode or newer from https://nodejs.org and run install.cmd again."
    exit 1
  }
  $answer = Read-Host "  ? Install Node.js LTS with winget now? (Y/n)"
  if ($answer -and $answer -notmatch '^y(es)?$') {
    Write-Problem "Pixelbench needs Node.js $minNode or newer."
    exit 1
  }
  winget install --id OpenJS.NodeJS.LTS --exact --source winget
  if ($LASTEXITCODE -ne 0) {
    Write-Problem 'winget could not install Node.js.'
    exit 1
  }
  Update-SessionPath
}

function New-Shortcut {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $file = Join-Path $desktop 'Pixelbench.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($file)
  $link.TargetPath = Join-Path $root 'Pixelbench.cmd'
  $link.WorkingDirectory = $root
  $link.Description = 'Start Pixelbench'
  $link.Save()
  Write-Ok "Shortcut on the desktop: $file"
}

Write-Host 'Pixelbench installer'

# Files from a downloaded zip carry the internet zone mark. Remove it from this folder's scripts.
Get-ChildItem -Path $root -File -Include *.ps1, *.cmd -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\(node_modules|\.runtime)\\' } |
  Unblock-File -ErrorAction SilentlyContinue

Write-Step 'Checking Node.js'
if ((Get-NodeMajor) -lt $minNode -and (Get-Command fnm -ErrorAction SilentlyContinue)) {
  # fnm puts node on PATH from the shell profile, which this window skips. Load its default version.
  fnm env --shell powershell | Out-String | Invoke-Expression
}
if ((Get-NodeMajor) -lt $minNode) {
  Write-Host "  Node.js $minNode or newer was not found."
  Install-Node
  if ((Get-NodeMajor) -lt $minNode) {
    Write-Problem 'Node.js is installed, but this window does not see it yet. Close it and run install.cmd again.'
    exit 1
  }
}
Write-Ok "Node.js $(node --version)"

& node (Join-Path $root 'scripts\setup.mjs') @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($args -contains '--check' -or $args -contains '--help') { exit 0 }

$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Pixelbench.lnk'
if (-not (Test-Path $desktopLink) -and ($args -notcontains '--yes')) {
  $answer = Read-Host "`n  ? Create a desktop shortcut? (Y/n)"
  if (-not $answer -or $answer -match '^y(es)?$') { New-Shortcut }
}
