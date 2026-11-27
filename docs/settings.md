# Settings

Open **Settings** in the app. Backend settings are saved in `.settings.json` in the Pixelbench folder. Defaults, presets, model choices, LoRAs and layout are saved in the browser. **Reset → All settings in this browser** clears those (language and the ComfyUI setup stay).

## General

- **Session**: turn autosave on or off and set the delay after the last edit (1–300 seconds; default: 5). Turning it off leaves manual saving and restoring available.
- **Backup size limit** defaults to 50 MB (adjustable from 1 to 1000 MB) and applies to the compressed backup on disk. A new backup that exceeds the limit is rejected; the last backup is kept. **Storage used** shows the current file sizes. **Delete all sessions** frees that storage without closing the open workspace. Autosave can create a new backup after the next edit.
- **Switch to Edit after applying**: an image applied in Create opens straight in Edit.
- **Keep prompts when opening an image**: each mode keeps its prompt and negative prompt, for example for a series of images with the same edit.
- **Prompt history**: saves the prompt of every generation you start (default: on), see [Prompt history](editor.md#prompt-history). **Maximum entries** (1–500, default: 50): when the history is full, the prompt used longest ago is dropped, and lowering the number trims it right away. Turning it off stops saving and hides the button but keeps the saved prompts. **Clear history** deletes them. The server keeps them in `.runtime/prompt-history.json`, so **Reset → All settings in this browser** does not remove them.
- **Ask before discarding**: asks before unsaved changes or variants are lost.
- **Open the console on errors**: shows the ComfyUI log when a generation fails.
- **When a generation ends**: a system notification (only while Pixelbench is in the background) and an optional sound.
- **Window layout**: restores panel widths and expanded sections.
- Language and clock (24-hour or 12-hour; the default follows the browser) for times such as the prompt history, the console and the last session save.

## Export

File format, JPG quality, **Store generation data** (PNG only; prompt, seed and settings readable by Forge, ComfyUI tools and Pixelbench) and the file name pattern. Placeholders: name of the opened file, date (YYYY-MM-DD), time (hhmmss), seed, model file, workflow, width and height.

## ComfyUI

- **Private** (default): Pixelbench starts its own ComfyUI for itself only and cleans up afterwards.
- **External**: connects to a running ComfyUI on a local address (`127.0.0.1`, `localhost` or `[::1]`, plain HTTP). Use **Test connection**. Generating needs the private instance, see [Privacy](editor.md#privacy-and-the-private-comfyui-process).
- **ComfyUI folder**: the folder that contains `main.py`.
- **Python**: the `python.exe` of the environment ComfyUI is installed in, usually in `.venv\Scripts`. On macOS it is `python` in `.venv/bin`. It must have PyTorch.
- **Model folders** (model roots): folders with subfolders such as `checkpoints`, `loras` or `vae`. Models inside the ComfyUI folder are always found.
- **More folders per model type**: extra search folders for `diffusion_models`, `text_encoders`, `vae`, `checkpoints`, `loras`, `controlnet`, `model_patches`, `upscale_models` and `background_removal`.
- **Port**: leave empty to pick a free port on every start of the private process.
- **Extra launch options**: ComfyUI flags separated by spaces, such as `--use-sage-attention` or `--reserve-vram 2`. Flags that Pixelbench sets itself (network, folder, cache and memory flags such as `--listen`, `--port`, `--highvram`, `--cpu`) are refused. Use the memory setting for memory behavior.

Saving restarts the private process and reads the new search paths. Files that are added to already registered folders are found the next time the profiles are checked (**Reload model lists** or **Test connection**). Model weights are loaded from where they are. Pixelbench asks ComfyUI's real loader lists.

## Performance

These settings only apply to the private instance.

| Setting             | Behavior                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Balanced**        | Uses ComfyUI's node cache. Model loaders of image jobs and prompt refinement stay cached. ComfyUI decides based on free VRAM when to offload weights to RAM.                                                               |
| **Prefer VRAM**     | Also enables ComfyUI's high-VRAM mode for diffusion models. The text encoder can still be offloaded. With LoRAs, ComfyUI keeps an extra copy of the weights in VRAM, so large models can get very slow. Use Balanced then. |
| **Low memory**      | Disables the node cache. Loaders run again for every job.                                                                                                                                                                 |

Changing the mode restarts the private process. When an image session ends, the bridge frees its ComfyUI cache including the models. **Keep models when switching images** (default: off) skips that, but ComfyUI's `/free` always unloads models, so intermediate results of the previous session stay in memory until the process ends.

**Live preview while sampling** has three choices: Off, Fast (a rough color preview straight from the latent, practically free) and TAESD (a more accurate preview that needs the matching decoders in a `vae_approx` folder, otherwise it works like Fast).

## Server

Shows the connection status and device. **Restart server** stops ComfyUI and restarts both, and the page reconnects on its own. **Shut down server** stops Pixelbench and ComfyUI; you can only start it again from `Pixelbench.cmd` or a terminal. Ctrl+C in the start window also stops the server.

Paths in Settings are normal absolute paths. On Windows they need a drive letter, such as `D:\ComfyUI`. On macOS they look like `/Users/name/ComfyUI`. The folder and file pickers work on both systems.

## About

Version, author, license and the technology Pixelbench is built with. **What's new** links to the release notes of the installed version and to all releases.

**Updates**: checks for a new release and installs it with **Update now**, see [Installation](installation.md#in-app-update). **Check for updates on start** (default: on) asks GitHub at most once a day. **Offer beta versions** also offers pre-releases; it is on by default when the running version is itself a pre-release. Both are saved in the browser.

## Environment variables

| Variable                | Effect                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PIXELBENCH_PORT`       | Port of the Pixelbench server. Default 3720. Set it in every terminal when you also use the dev server.        |
| `PIXELBENCH_STATE`      | Folder that holds `.settings.json` and `.runtime` instead of the Pixelbench folder.                            |
| `PIXELBENCH_NO_BROWSER` | Set to `1` to keep `Pixelbench.cmd` or `Pixelbench.command` from opening the browser.                          |
| `PIXELBENCH_CHROME`     | Path to Chrome for `checks/references-ui.mjs`. Defaults: `C:/Program Files/Google/Chrome/Application/chrome.exe` on Windows, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS. |
| `PIXELBENCH_UPDATE_FEED` | Release list the update check reads instead of GitHub's, for testing the updater against a local server.     |

Existing browser settings from earlier versions are still read.

In PowerShell, set a variable for the current window with `$env:PIXELBENCH_PORT = 3721`. In zsh or bash on macOS, use `export PIXELBENCH_PORT=3721` in the terminal you start from.
