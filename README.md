# Pixelbench

<p align="center">
  <img src="docs/pixelbench.png" alt="Pixelbench screenshot">
</p>

Pixelbench started as a "just for me" project: a way to streamline my own generative AI workflows and shape the tools around how I actually work. Then a few friends saw it and wanted it too, so I turned it into a complete, polished app.

It brings together the concepts and features I found most useful in ComfyUI, Automatic1111 / sd-webui-forge, SwarmUI and InvokeAI: the flexibility of ComfyUI's node workflows, the fast prompt-to-image loop and hires fix of the A1111 family, SwarmUI's idea of a friendly front end on top of ComfyUI, and the canvas-first editing of InvokeAI. All of it sits in a modern interface laid out like a classic image editor such as Photoshop, with tools on the left, settings on the right and your image in the middle. On top of that, it builds in a handful of community extensions and custom nodes that I found to be a good fit, such as LanPaint for inpainting, Ultimate SD Upscale for tiled hires fix and GGUF loaders for quantized models (see [Third-party components](docs/third-party.md)).

None of these tools are bad, and I still like all of them. For my workflow, though, each one on its own was either too bloated, too cluttered or too complicated. Pixelbench is my attempt to keep the parts I use every day and leave out the rest.

Pixelbench is a local image editor for Windows and for Macs with Apple Silicon. It drives a private ComfyUI process that it starts and stops itself, so you get create, edit, inpaint, outpaint and upscale tools on one canvas without building node graphs. Everything runs on your machine. Images and prompts never leave it.

> [!NOTE]
> **This is a first beta.** So far it has only been tested on my own machine: Windows 11 with an RTX 4090, and on a MacBook Pro M4 max. macOS support is new and less tested than Windows. Other GPUs, smaller amounts of VRAM and other ComfyUI setups may well run into problems I have never seen. Bug reports, feature requests and feedback of any kind are very welcome, so please open an issue.

## Features

- Create images from a prompt, with optional hires fix and a reference or template image (img2img).
- Edit an image with an instruction and image references: up to 15 with Qwen-Image Edit 2.1, up to 3 with FLUX.2 [klein].
- Inpaint with a mask brush, outpaint by dragging the frame handles, and paint color sketches on a drawing layer.
- Detailer that finds objects by prompt and redraws them in more detail, with its own sampling settings if wanted.
- Remove the background of an image with BiRefNet.
- Upscale with an upscale model or Lanczos, and view the metadata stored in PNG files (Automatic1111's PNG info).
- Variants strip, before/after compare, undo and redo, image adjustments with live histogram, LoRAs and per-component model selection.
- Profiles are plain JSON files in `profiles/` that point to ComfyUI API workflows in `workflows/`.

## Supported models

| Model family      | Profiles                                                   |
| ----------------- | ---------------------------------------------------------- |
| Krea 2 Turbo | Text to image, image to image, edit, inpainting, LanPaint inpainting |
| Qwen-Image 2.1    | Text to image, image to image and edit, base and Turbo; Turbo Fun ControlNet for edit, inpainting and outpainting |
| Z-Image           | Text to image and image to image, base and Turbo |
| MOSS-Image        | Text to image and image to image, base and Turbo; Turbo inpainting and LanPaint inpainting |
| FLUX.2 [klein] 4B | Edit with up to 3 reference images                         |
| FLUX.2 [klein] 9B | Text to image, image to image, KV edit with up to 3 reference images, inpainting and KV outpainting |
| FLUX.1 Fill       | Inpainting and outpainting                                 |
| SDXL              | Text to image, image to image, inpainting and outpainting |
| Upscale models    | ESRGAN-style upscalers through ComfyUI, or plain Lanczos   |

Pixelbench does not download models. It uses the weights you already have in your ComfyUI model folders, and each profile shows which files it is missing. See [Profiles and models](docs/profiles-and-models.md).

> [!NOTE]
> **Video models are not supported, and that is not planned.** Pixelbench is built for still images, so please don't open feature requests for video. Maybe one day I'll build a "Videobench" that is made for exactly that. :)

## Prerequisites

- Windows 10 or 11, or macOS on Apple Silicon (M-series).
- A working ComfyUI install: Comfy Desktop, ComfyUI Desktop, the portable build or a manual install. Its Python environment must have PyTorch.
- On Windows, an NVIDIA GPU with CUDA is strongly recommended. Without CUDA, generating is very slow. On a Mac, PyTorch uses the GPU through MPS (Metal). There is no CUDA on macOS.
- Internet access during the install.
- Node.js 24 or newer. On Windows, the installer offers to install it with winget. On macOS, the installer finds it (also via nvm, fnm or Homebrew) or offers `brew install node` if Homebrew is installed.

ComfyUI is a separate prerequisite. Pixelbench uses it but never modifies it.

## Install

1. Get the folder: `git clone` this repository or download and unpack a release zip.
2. On Windows, double-click `install.cmd`. On macOS, double-click `install.command`, which opens Terminal. If macOS refuses to open it, see [Installation](docs/installation.md#macos).

The installer finds ComfyUI, downloads the custom nodes Pixelbench needs and builds the editor. On Windows it also offers a desktop shortcut. See [Installation](docs/installation.md) for the details.

## Start

On Windows, double-click `Pixelbench.cmd` or the desktop shortcut. On macOS, double-click `Pixelbench.command`. It opens Pixelbench in your default browser at <http://127.0.0.1:3720>. The first start can take up to 90 seconds while the private ComfyUI process loads its nodes. Close the window or press Ctrl+C to stop the server.

## Update or repair

Pixelbench checks GitHub for a new release at most once a day and shows a dot on the settings button when one is available. Open **Settings → About Pixelbench** and click **Update now**: Pixelbench downloads the release, swaps its files, updates packages and custom nodes and restarts. Your settings, `.runtime` and files you added yourself stay. The automatic check can be turned off there.

To repair an install, run `install.cmd` again. It only changes what is missing or outdated. A git checkout updates with `git pull` followed by `install.cmd`. Installs older than the first release with the updater need one manual update.

## Uninstall

Delete the Pixelbench folder. On Windows, also delete the desktop shortcut `Pixelbench.lnk`. ComfyUI is never modified, so there is nothing to undo there.

## Documentation

- [Documentation index](docs/README.md)
- [Installation](docs/installation.md)
- [Getting started](docs/getting-started.md)
- [Editor and modes](docs/editor.md)
- [Keyboard shortcuts](docs/keyboard-shortcuts.md)
- [Profiles and models](docs/profiles-and-models.md)
- [Settings](docs/settings.md)
- [Development](docs/development.md)
- [Third-party components](docs/third-party.md)

## License

Pixelbench is released under the [MIT License](LICENSE). The custom nodes the installer downloads have their own licenses, see [Third-party components](docs/third-party.md).
