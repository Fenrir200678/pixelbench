import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { win32 } from 'node:path'
import { reject } from './http.mjs'

// The native Windows picker runs in PowerShell. PowerShell 7 (.NET) shows the modern Explorer folder dialog,
// Windows PowerShell 5.1 the classic one. Inputs travel as environment variables, never as script text.
const pickerScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[Windows.Forms.Application]::EnableVisualStyles()
$initial = $env:PIXELBENCH_PICK_INITIAL
$owner = New-Object Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0; Width = 1; Height = 1; StartPosition = 'CenterScreen' }
$owner.Show()
$owner.Activate()
if ($env:PIXELBENCH_PICK_KIND -eq 'folder') {
  $dialog = New-Object Windows.Forms.FolderBrowserDialog
  $dialog.Description = $env:PIXELBENCH_PICK_TITLE
  try { $dialog.UseDescriptionForTitle = $true } catch {}
  if ($initial -and (Test-Path -LiteralPath $initial -PathType Container)) { $dialog.SelectedPath = $initial }
  $result = $dialog.ShowDialog($owner)
  $path = $dialog.SelectedPath
} else {
  $dialog = New-Object Windows.Forms.OpenFileDialog
  $dialog.Title = $env:PIXELBENCH_PICK_TITLE
  $dialog.Filter = $env:PIXELBENCH_PICK_FILTER
  if ($initial) {
    $folder = if (Test-Path -LiteralPath $initial -PathType Container) { $initial } else { Split-Path -LiteralPath $initial -Parent }
    if ($folder -and (Test-Path -LiteralPath $folder -PathType Container)) { $dialog.InitialDirectory = $folder }
    if (Test-Path -LiteralPath $initial -PathType Leaf) { $dialog.FileName = Split-Path -LiteralPath $initial -Leaf }
  }
  $result = $dialog.ShowDialog($owner)
  $path = $dialog.FileName
}
$owner.Dispose()
if ($result -eq [Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($path) }
`
const encodedScript = Buffer.from(pickerScript, 'utf16le').toString('base64')
const shells = ['pwsh.exe', 'powershell.exe']
const filters = {
  python: 'Python (python.exe)|python.exe;pythonw.exe|Programme (*.exe)|*.exe',
  file: 'Alle Dateien (*.*)|*.*'
}
let picking = false

function runPicker(shell, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      shell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript
      ],
      { windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let out = ''
    let err = ''
    // A forgotten dialog must not block the next pick forever.
    const timeout = setTimeout(() => child.kill(), 10 * 60_000)
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (err += chunk))
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve(out.trim())
      else reject(new Error(err.trim().split('\n')[0] || 'Exit ' + code))
    })
  })
}

/** Opens the native folder or file picker. Resolves with the chosen path, or '' when cancelled. */
export async function pickPath({ kind, initial, title }) {
  if (process.platform !== 'win32') reject('The folder picker is only available on Windows.', 501)
  if (!['folder', 'python', 'file'].includes(kind)) reject('Unknown picker.')
  if (picking) reject('A picker is already open.', 409)
  picking = true
  const env = {
    PIXELBENCH_PICK_KIND: kind === 'folder' ? 'folder' : 'file',
    PIXELBENCH_PICK_INITIAL: typeof initial === 'string' ? initial.slice(0, 1024) : '',
    PIXELBENCH_PICK_TITLE: typeof title === 'string' ? title.slice(0, 200) : '',
    PIXELBENCH_PICK_FILTER: filters[kind] ?? filters.file
  }
  try {
    for (const shell of shells) {
      try {
        return await runPicker(shell, env)
      } catch (error) {
        // Without PowerShell 7 the built-in Windows PowerShell takes over.
        if (error.code !== 'ENOENT') throw error
      }
    }
    reject('PowerShell was not found.', 501)
  } catch (error) {
    if (error.status) throw error
    reject('Could not open the picker · ' + error.message, 500)
  } finally {
    picking = false
  }
}

const isFile = (path) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false
  )
const isFolder = (path) =>
  stat(path).then(
    (info) => info.isDirectory(),
    () => false
  )

/** Checks one configured path. kind: folder, python (an executable file) or comfy (a ComfyUI source folder). */
export async function checkPath({ kind, path }) {
  if (typeof path !== 'string' || !path.trim()) return { state: 'empty' }
  if (!/^[a-z]:[\\/]/i.test(path) || path.length > 1024) return { state: 'invalid', message: 'Not an absolute path.' }
  const target = win32.normalize(path.trim())
  if (kind === 'python') {
    if (!(await isFile(target))) return { state: 'missing', message: 'File not found.' }
    return /\.exe$/i.test(target) ? { state: 'ok' } : { state: 'invalid', message: 'Not an executable file.' }
  }
  if (!(await isFolder(target))) return { state: 'missing', message: 'Folder not found.' }
  if (kind === 'comfy' && !(await isFile(win32.join(target, 'main.py'))))
    return { state: 'invalid', message: 'Not a ComfyUI folder: main.py is missing.' }
  return { state: 'ok' }
}
