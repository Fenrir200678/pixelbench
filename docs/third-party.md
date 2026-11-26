# Third-party components

## ComfyUI

ComfyUI is a separate prerequisite. Pixelbench does not include, redistribute or modify it. It starts your existing ComfyUI install as a private process with its own working folder under `.runtime` and uses its Python environment. See the [README](../README.md#prerequisites).

## Custom nodes

`install.cmd` downloads these custom nodes from GitHub at install time, each at a pinned commit, into `.runtime/custom_nodes`. They are not part of the Pixelbench repository and are not redistributed with it. The pins are in `scripts/setup/manifest.json`. Licenses were read from the `LICENSE` file of each downloaded folder. Check the upstream repository for the current terms.

| Folder                       | Repository                                                                          | Pinned commit | Purpose                          | License           |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------- | -------------------------------- | ----------------- |
| `pixelbench_lanpaint`        | [scraed/LanPaint](https://github.com/scraed/LanPaint)                               | `2d7912f`     | LanPaint inpainting              | GPL-3.0           |
| `pixelbench_gguf`            | [leejet/ComfyUI-GGUF](https://github.com/leejet/ComfyUI-GGUF)                       | `ff8d486`     | GGUF model loaders               | Apache-2.0        |
| `ComfyUI_UltimateSDUpscale`  | [ssitu/ComfyUI_UltimateSDUpscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale) | `a5547db`     | Tiled hires fix                  | GPL-3.0           |
| `KreaSeedVarianceEnhancer`   | [harukimix/KreaSeedVarianceEnhancer](https://github.com/harukimix/KreaSeedVarianceEnhancer) | `1515d23`     | Seed variance for Krea 2 Turbo   | MIT-0 (MIT No Attribution) |
| `ComfyUI-KJNodes`            | [kijai/ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes)                   | `aa2b5ea`     | Prompt weights for Krea 2        | GPL-3.0           |
| `comfyui-krea2edit`          | [lbouaraba/comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit)       | `13ef60f`     | Krea 2 edit                      | Apache-2.0        |

Full pinned commits:

- LanPaint: `2d7912f9a5efe5ece8de334c7ca18317b8288c39`
- ComfyUI-GGUF: `ff8d48666758866bcc9e93b22e1e07cb636e084f` (a fork state with Qwen-Image 2.1 support)
- ComfyUI_UltimateSDUpscale: `a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df`, with its submodule [Coyote-A/ultimate-upscale-for-automatic1111](https://github.com/Coyote-A/ultimate-upscale-for-automatic1111) at `2322caa480535b1011a1f9c18126d85ea444f146` (GPL-3.0)
- KreaSeedVarianceEnhancer: `1515d23a5b399a44ccd97482e1105a43937268ae`
- ComfyUI-KJNodes: `aa2b5ea5e7f61b51f5d26d726f23c1d74e951016`
- comfyui-krea2edit: `13ef60f20828949becada815d3cbc371eb5ccaab`

Notes:

- The nodes run inside the private ComfyUI process that Pixelbench starts, not inside Pixelbench itself.
- Some nodes need extra Python packages (`gguf`, `sentencepiece`, `pillow`, `color-matcher`, `matplotlib`, `mss`, and an OpenCV package). The installer adds only the missing ones into `.runtime/python` with `pip --target`. Your ComfyUI environment is not changed.

## Detection models and ONNX Runtime Web

The installer downloads these YOLO detection models for the detailer into `.runtime/models/yolo`, each pinned to a commit and checked against its SHA-256 (see `scripts/setup/manifest.json`). They are not part of the Pixelbench repository and are not redistributed with it.

| File | Source | Origin | License |
| --- | --- | --- | --- |
| `yolov11s-face.onnx` | [deepghs/yolo-face](https://huggingface.co/deepghs/yolo-face) at `e366257` | ONNX export of [akanametov/yolo-face](https://github.com/akanametov/yolo-face) | GPL-3.0 (upstream); deepghs adds a model redistribution disclaimer |
| `hand_yolov8n.onnx` | [AbrahamPJ/nightmare-adetailer](https://huggingface.co/AbrahamPJ/nightmare-adetailer) at `eb37ca2` | ONNX export of [Bingsu/adetailer](https://huggingface.co/Bingsu/adetailer)'s `hand_yolov8n.pt` | Apache-2.0 |

The editor runs them with [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT), which is bundled into the built editor.

## Models and workflow templates

Pixelbench does not ship model weights. Models are downloaded by you from their publishers and are subject to their own licenses, for example the V2 Krea 2 edit LoRAs are free for private and non-commercial use only. The Qwen workflow templates come from [Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates).

## Pixelbench

Pixelbench itself is released under the [MIT License](../LICENSE).
