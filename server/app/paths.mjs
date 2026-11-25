import { spawn } from 'node:child_process'
import { access, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, normalize } from 'node:path'
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
// The macOS picker is a JavaScript for Automation script run by osascript. The dialog runs in osascript itself
// (no System Events, so no extra Automation permission). Inputs are read from the environment, never from script text.
const macScript = `
ObjC.import('Foundation')
const environment = $.NSProcessInfo.processInfo.environment
const read = (name) => {
  const value = environment.objectForKey(name)
  return value ? ObjC.unwrap(value) : ''
}
const app = Application.currentApplication()
app.includeStandardAdditions = true
app.activate()
const kind = read('PIXELBENCH_PICK_KIND')
const initial = read('PIXELBENCH_PICK_INITIAL')
const options = { withPrompt: read('PIXELBENCH_PICK_TITLE'), invisibles: true }
if (initial) options.defaultLocation = Path(initial)
let result = ''
try {
  result = (kind === 'folder' ? app.chooseFolder(options) : app.chooseFile(options)).toString()
} catch (error) {
  if (error.errorNumber !== -128) throw error
}
result.length > 1 ? result.replace(/\\/$/, '') : result
`
let picking = false

function runPicker(command, args, env, windowsHide = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
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
      else if (/-128|User canceled/i.test(err)) resolve('')
      else reject(new Error(err.trim().split('\n')[0] || 'Exit ' + code))
    })
  })
}

// The start folder for the macOS dialog: the folder itself, or the parent of an existing file; '' when unusable.
async function macInitialFolder(initial) {
  if (!initial || !isAbsolute(initial)) return ''
  if (await isFolder(initial)) return initial
  const parent = dirname(initial)
  return (await isFolder(parent)) ? parent : ''
}

/** Opens the native folder or file picker. Resolves with the chosen path, or '' when cancelled. */
export async function pickPath({ kind, initial, title }) {
  const platform = process.platform
  if (platform !== 'win32' && platform !== 'darwin') reject('The folder picker is not available on this system.', 501)
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
    if (platform === 'darwin') {
      env.PIXELBENCH_PICK_INITIAL = await macInitialFolder(env.PIXELBENCH_PICK_INITIAL)
      return await runPicker('osascript', ['-l', 'JavaScript', '-e', macScript], env)
    }
    for (const shell of shells) {
      try {
        const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass']
        return await runPicker(shell, [...args, '-EncodedCommand', encodedScript], env, true)
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
  if (!isAbsolute(path.trim()) || path.length > 1024) return { state: 'invalid', message: 'Not an absolute path.' }
  const target = normalize(path.trim())
  if (kind === 'python') {
    if (!(await isFile(target))) return { state: 'missing', message: 'File not found.' }
    const executable =
      process.platform === 'win32'
        ? /\.exe$/i.test(target)
        : await access(target, constants.X_OK).then(
            () => true,
            () => false
          )
    return executable ? { state: 'ok' } : { state: 'invalid', message: 'Not an executable file.' }
  }
  if (!(await isFolder(target))) return { state: 'missing', message: 'Folder not found.' }
  if (kind === 'comfy' && !(await isFile(join(target, 'main.py'))))
    return { state: 'invalid', message: 'Not a ComfyUI folder: main.py is missing.' }
  return { state: 'ok' }
}
