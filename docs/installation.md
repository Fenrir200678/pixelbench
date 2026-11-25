# Installation

## Before you start

You need Windows 10 or 11, or macOS on Apple Silicon (M-series), a working ComfyUI install, an internet connection and Node.js 24 or newer. See the [README](../README.md#prerequisites) for the full list.

The ComfyUI install can be Comfy Desktop, the legacy ComfyUI Desktop, the portable build or a manual install. Its Python environment must have PyTorch. On Windows, an NVIDIA GPU with CUDA is strongly recommended. On a Mac, PyTorch uses the GPU through MPS (Metal); there is no CUDA on macOS.

## Run the installer

1. Get the Pixelbench folder with `git clone` or by unpacking a release zip.
2. On Windows, double-click `install.cmd`. On macOS, double-click `install.command` (see [macOS](#macos)).

`install.cmd` starts `install.ps1` in Windows PowerShell 5.1 with the execution policy set to Bypass for this one run. Apart from Node.js (only if you agree to install it) and the optional desktop shortcut, both scripts only touch the Pixelbench folder. The window stays open at the end so you can read the result.

To pass options, run `install.cmd` from a terminal, for example `install.cmd --comfy "D:\ComfyUI_windows_portable"`.

## macOS

macOS support on Apple Silicon is new and less tested than Windows. It has been tried on one MacBook Pro M4 max so far.

1. Get the Pixelbench folder with `git clone` or by unpacking a release zip.
2. Double-click `install.command`. It opens Terminal and runs the setup. The options are the same as for `install.cmd`, for example `./install.command --comfy ~/ComfyUI-Installs/ComfyUI`.

If macOS says the file cannot be opened, which is typical for a downloaded zip because the developer is not identified, run this once in Terminal from the Pixelbench folder:

```sh
bash install.command
```

The installer then makes both `.command` files executable, so double-clicking works afterwards.

## What the installer does

`install.ps1` (Windows):

1. Removes the internet-zone mark that Windows puts on downloaded scripts (`Unblock-File`).
2. Checks for Node.js 24 or newer. If `fnm` is installed, it loads the default Node version from it. If Node is still missing, it offers to run `winget install OpenJS.NodeJS.LTS`. If winget is missing or you decline, it stops and asks you to install Node.js from <https://nodejs.org>.
3. Runs `scripts/setup.mjs` with your options.
4. Offers to create a desktop shortcut `Pixelbench.lnk` that points to `Pixelbench.cmd`. It does not ask if the shortcut already exists or if you pass `--yes`.

On macOS, `install.command` does the equivalent of steps 1 and 2: it removes the download quarantine flag from the folder, finds Node.js 24 or newer (also through nvm, fnm or Homebrew), and offers `brew install node` if Homebrew is installed and Node.js is missing. It creates no desktop shortcut. Then it runs the same `scripts/setup.mjs` as on Windows.

`scripts/setup.mjs`:

1. **Finds ComfyUI.** It looks at Comfy Desktop (`installations.json` and its model folders), legacy ComfyUI Desktop, and portable or manual folders in your user folders and drive roots. It also reads `extra_model_paths.yaml` for extra model folders. If it finds more than one install it asks you to pick one. If it finds none it asks for the folder path. On macOS it looks at Comfy Desktop in `~/Library/Application Support/Comfy Desktop` (including its shared model folders), the older ComfyUI Desktop app, and folders with "comfy" in the name in your home folder, Desktop, Downloads and Documents. The Python environment is `.venv/bin/python` (or `venv`) inside or next to the ComfyUI folder.
2. **Probes ComfyUI's Python.** It reports the Python version, PyTorch, CUDA, GPU name and VRAM, and the ComfyUI version. It stops if PyTorch does not load. It warns if CUDA is missing or ComfyUI is older than 0.46.0. On macOS there is no CUDA, and PyTorch uses the GPU through MPS.
3. **Downloads the custom nodes** pinned in `scripts/setup/manifest.json` into `.runtime/custom_nodes`. See [Third-party components](third-party.md).
4. **Installs missing Python packages** into `.runtime/python` with `pip --target`. The ComfyUI Python environment is never changed.
5. **Prepares the editor.** It runs `npm ci` and builds the editor. A release zip ships a built `dist/` folder, so it only installs the runtime packages there. A git checkout installs all packages and rebuilds after each new commit.
6. **Writes `.settings.json`** with the ComfyUI folder, Python path and model folders. You can change all of them later in Settings.

If settings already exist and still point to a working ComfyUI, the installer keeps them.

## Options

Pass these to `install.cmd`, or run `node scripts/setup.mjs` directly.

| Option              | Effect                                                    |
| ------------------- | --------------------------------------------------------- |
| `--check`           | Only check, change nothing.                               |
| `--comfy <folder>`  | Use this ComfyUI folder instead of searching.             |
| `--reconfigure`     | Search for ComfyUI again even if settings exist.          |
| `--rebuild`         | Build the editor even if it looks current.                |
| `--yes`             | Accept the first choice for every question.               |
| `--help`            | Show the option list.                                     |

## Where files go

Everything lives in the Pixelbench folder, or in the folder named by `PIXELBENCH_STATE` (see [Settings](settings.md#environment-variables)).

| Path                         | Content                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `.settings.json`             | ComfyUI paths and backend settings.                         |
| `.runtime/custom_nodes/`     | The downloaded custom nodes.                                |
| `.runtime/python/`           | Extra Python packages for the private ComfyUI process.      |
| `.runtime/install.json`      | Bookkeeping for npm packages and the editor build.          |
| `.runtime/update/`           | Last update check and result, backup of the last update.    |
| `release.json`               | Version and file list of a release (release zips only).     |
| `node_modules/`, `dist/`     | npm packages and the built editor.                          |
| Desktop `Pixelbench.lnk`     | Optional shortcut (Windows only).                           |

## Start

`Pixelbench.cmd` (Windows) and `Pixelbench.command` (macOS) run `scripts/launch.mjs`. It starts the server and opens the default browser at <http://127.0.0.1:3720> once the server answers. If Pixelbench already runs on that port, it only opens the browser. Pass `--no-browser` or set `PIXELBENCH_NO_BROWSER=1` to skip opening the browser. If the port is used by another program, set `PIXELBENCH_PORT`.

## Update and repair

### In-app update

Pixelbench asks the GitHub releases of this project for a newer version, on start at most once a day and on demand under **Settings → About Pixelbench**. The request carries no images, prompts or personal data. Turn the automatic check off there, and choose whether beta versions (pre-releases) are offered.

**Update now**:

1. Downloads the release zip and compares its SHA-256 with the checksum GitHub lists for it.
2. Unpacks it to `.runtime/update/staged` and stops the server and the private ComfyUI.
3. Runs `scripts/update.mjs` from the new release in the start window. It saves every file it replaces or removes to `.runtime/update/backup`, copies the new files, removes files that the old release shipped and the new one does not, and runs `scripts/setup.mjs --yes` for npm packages, custom nodes and Python packages.
4. Starts the server again. The page reloads with the new version.

Only files listed in the release's `release.json` are touched. `.settings.json`, `.runtime/`, `node_modules/` and files you added, such as your own profiles, stay. If a step fails, the previous files come back and the error is shown under **About Pixelbench**. Do not close the start window during an update; if it was closed, run `install.cmd` (Windows) or `install.command` (macOS) to repair the install.

A git checkout only shows that a new release exists. Update it with `git pull` and `install.cmd`.

### Repair

Run `install.cmd` (Windows) or `install.command` (macOS) again. It compares each custom node with its pinned commit, installs missing Python packages and rebuilds the editor when needed. To update a git checkout, run `git pull` first. A node folder that is a git checkout on another commit is left alone.

`install.cmd --check` (Windows) or `./install.command --check` (macOS) reports what is missing without changing anything.

## Uninstall

Delete the Pixelbench folder. On Windows, also delete the desktop shortcut. On macOS there is no shortcut to remove. ComfyUI, its models and its Python environment are never modified.

## Troubleshooting

- **Node.js not found after winget.** winget changes the PATH for new windows only. Close the window and run `install.cmd` again.
- **Node.js not found on macOS.** Install Node.js 24 or newer, for example with `brew install node`, then run `install.command` again.
- **macOS will not open `install.command`.** Run `bash install.command` once in Terminal from the Pixelbench folder, see [macOS](#macos).
- **No ComfyUI found.** Enter the folder that contains `main.py`, or run `install.cmd --comfy "<folder>"` (Windows) or `./install.command --comfy "<folder>"` (macOS). The folder needs a Python environment next to it.
- **PyTorch does not load.** Fix the ComfyUI environment first. Pixelbench uses the same Python.
- **Runs without CUDA.** On Windows, install a CUDA build of PyTorch in the ComfyUI environment. Without CUDA, generating is very slow. On macOS there is no CUDA; PyTorch uses the GPU through MPS.
- **ComfyUI is older than 0.46.0.** Some profiles may not load. Update ComfyUI.
- **Download failed.** The custom nodes come from GitHub. Check your connection and run `install.cmd` again.
- **pip is missing.** The installer cannot add Python packages without it. Install pip in the ComfyUI environment.
- **"Pixelbench is not set up yet."** Run `install.cmd` (or `install.command` on macOS) first. `Pixelbench.cmd` and `Pixelbench.command` need `.settings.json` and a built `dist/`.
- **Port in use.** Set `PIXELBENCH_PORT` to a free port and start again.
- **The configured ComfyUI is gone.** The installer warns and searches again. You can also use `--reconfigure`.
