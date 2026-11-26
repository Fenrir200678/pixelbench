# Profiles and models

## Profiles

A profile is a JSON file in `profiles/`. Its API workflow graph is in `workflows/`. Each profile holds its template, the node inputs, model categories, defaults and size rules. Sampler and scheduler lists come from the active ComfyUI instance.

| Mode      | Profiles                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create    | Krea 2 Turbo, FLUX.2 [klein] 9B, Z-Image Turbo, Z-Image, MOSS-Image Turbo, MOSS-Image, Qwen-Image 2.1 Turbo, Qwen-Image 2.1, SDXL                                                     |
| Edit      | Qwen-Image 2.1, Qwen-Image 2.1 Turbo, FLUX.2 [klein] 4B Edit, FLUX.2 [klein] 9B KV Edit, Krea 2 Turbo Edit, Qwen-Image 2.1 Turbo · Fun ControlNet                                    |
| Inpaint   | SDXL Inpainting, FLUX.1 Fill, Krea 2 Turbo Inpainting, Krea 2 Turbo · LanPaint, FLUX.2 [klein] 9B Inpainting, MOSS-Image Turbo Inpainting, MOSS-Image Turbo · LanPaint, Qwen-Image 2.1 Turbo · Fun ControlNet |
| Outpaint  | SDXL Inpainting, FLUX.1 Fill, FLUX.2 [klein] 9B KV Outpainting, Qwen-Image 2.1 Turbo · Fun ControlNet                                                                                       |
| Extras    | Upscaler only, Remove background · BiRefNet                                                                                                               |

FLUX.2 [klein] 4B Edit is an edit workflow, so outpainting is not available in it. Pick a profile under **Workflow profile** in the inspector. The inspector shows the searched folders for a profile and lists missing files.

The Qwen templates come from the ComfyUI template package that ComfyUI installs, and from Comfy-Org's [Qwen-Image 2.1 Edit](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json) and [Qwen-Image 2.1 Turbo Edit](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_turbo_image_edit.json) templates. The Create profiles use the ComfyUI templates `image_sdxl_simple`, `image_krea2_turbo_t2i`, `image_z_image_turbo`, `image_qwen_image_2_1_t2i` and `image_qwen_image_2_1_turbo_t2i`.

Notes on specific profiles:

- Qwen-Image 2.1 Turbo uses the fixed sigma schedule of the official template.
- FLUX.1 Fill uses a separate FLUX Guidance with a fixed CFG of 1. It needs the Fill diffusion model, `clip_l.safetensors` and a T5-XXL encoder.
- SDXL Inpainting needs an inpainting checkpoint (an SDXL model with nine input channels, text encoders and VAE). It is used for both inpainting and outpainting.
- Z-Image Turbo needs weights under `diffusion_models`, plus `qwen_3_4b.safetensors` and `ae.safetensors`. Shift can be set under **Render**.
- Z-Image is the undistilled base model (`z_image_bf16.safetensors` or `z_image_int8_convrot.safetensors`) with the same text encoder and VAE. It follows the Comfy-Org template: 25 steps, CFG 4, `res_multistep`, shift 3 and a negative prompt.
- Qwen-Image 2.1 supports GGUF weights.

## Model selection

Under **Models** in the inspector you can pick every model component on its own. The profile file gives recommendations. Other local files come from the list of the matching ComfyUI loader. An entry in that list only means the loader finds the file. Its model family must also fit the workflow. The choice is saved per profile in the browser, and a replay uses the choice of the original job.

Model files are looked up in the ComfyUI folder and in the model roots set in [Settings](settings.md#comfyui). Weights are loaded where they are and never copied.

## LoRAs

Under **LoRAs** in the inspector you can add up to eight LoRAs to any profile, each with its own strength from -2 to 2. You can switch them on and off and remove them one by one.

- Files come from the choice list of ComfyUI's LoRA loader and live under `loras` or `Lora` in a model root folder. You can add folders in Settings under `loras`.
- Pixelbench reads the model family from the safetensors header, not from the folder name. Matching LoRAs are listed first. Others stay selectable and show a notice. A trigger word stored in the header is shown under the entry.
- The choice is saved per profile in the browser, and a replay uses the LoRAs of the original job.

## Image references

Under the prompt, **Image references** shows the current starting image as `<image1>` and extra references as numbered thumbnails. With Qwen-Image 2.1 and Turbo you can add up to 15 references by multi-select or drag-and-drop, with the FLUX.2 [klein] Edit profiles up to 3. For FLUX.2, Pixelbench writes the tags as plain words (`image 2`), and each reference is chained as a `ReferenceLatent` as in the Comfy-Org multi-reference templates.

Type `<` in the prompt to open an image picker. Arrow keys choose, Enter inserts the tag at the cursor and Escape closes the list. Removing a reference removes its tags from the prompt and renumbers the following images.

## Qwen auto render resolution

With **Qwen-Image 2.1** and **Qwen-Image 2.1 Turbo**, **Size → Render resolution → Auto** limits large inputs to about 2.36 megapixels. A 1920 x 1080 px template is rendered at 1920 x 1088 px on the 32 px grid. For another render resolution turn **Auto** off. Manually you can set up to 2048 px per side.

Both profiles prefer the [Texture-Fix VAE](https://huggingface.co/madebyollin/texture-fix-vae-for-qwen-image-2.1) when ComfyUI finds it. The default VAE is the fallback. Choose a specific VAE under **Advanced settings → Qwen-Image 2.1 VAE**.

## Qwen-Image 2.1 Turbo · Fun ControlNet

This profile uses the Turbo weights and their fixed sigma schedule. Under **Render**, **ControlNet strength** is set per mode from 0 to 1.

- In **Edit**, the Canny edges of the input image guide the structure, with a default strength of 0.35.
- In **Inpaint** and **Outpaint**, the strength starts at 1 and the Pixelbench mask controls the adapter and the sampling. In Outpaint the image context comes from the masked ControlNet input.

The [Fun ControlNet adapter from Alibaba PAI](https://huggingface.co/alibaba-pai/Qwen-Image-2.1-Fun-Controlnet-Union) belongs in `model_patches` under a configured model root folder.

## Qwen-Image 2.1 with GGUF

GGUF weights appear under **Model** in the base **Qwen-Image 2.1** profile as soon as the private ComfyUI worker reports the GGUF loader. Put the weights in `diffusion_models` inside a configured model root folder. The installer downloads the required [ComfyUI-GGUF fork](https://github.com/leejet/ComfyUI-GGUF/tree/ff8d48666758866bcc9e93b22e1e07cb636e084f) with Qwen-Image 2.1 support and the `gguf` Python package for you. See [Third-party components](third-party.md).

## Krea 2 Turbo

### Inpainting

Under **Inpaint**, choose **Krea 2 Turbo Inpainting**, mask the area and describe what should appear. The default sampler uses 8 steps, Euler, the `simple` scheduler, CFG 1 and denoising 0.5. Raise denoising to 1 for a full replacement. The automatic render resolution follows the crop and stays at about 1 megapixel or less. Manually you can set up to 2048 x 2048 px. Original pixels outside the brush mask are kept. See the [Krea 2 template](https://docs.comfy.org/tutorials/image/krea/krea-2) and [Differential Diffusion](https://docs.comfy.org/built-in-nodes/DifferentialDiffusion).

**Krea 2 Turbo · LanPaint** uses the same brush and model weights. It starts like the Krea 2 example of LanPaint with 15 sampling steps, 5 LanPaint iterations, Euler, `simple`, CFG 1 and denoising 1. For difficult masks, raise the LanPaint iterations under **Render** from 5 to 10. More iterations take longer. See the [LanPaint example](https://github.com/scraed/LanPaint/tree/2.2.0#krea2).

The profiles need a ComfyUI version with native Krea 2 support and these files in the configured model paths:

| Folder             | File                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diffusion_models` | [`krea2_turbo_fp8_scaled.safetensors`](https://huggingface.co/Comfy-Org/Krea-2/blob/main/diffusion_models/krea2_turbo_fp8_scaled.safetensors) (13.1 GB)                                   |
| `text_encoders`    | [`qwen3vl_4b_fp8_scaled.safetensors`](https://huggingface.co/Comfy-Org/Krea-2/blob/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors) or `qwen3vl_4b.safetensors`                      |
| `vae`              | [`qwen_image_vae.safetensors`](https://huggingface.co/Comfy-Org/Krea-2/blob/main/vae/qwen_image_vae.safetensors)                                                                          |

### More variation with Krea 2 Turbo

Krea 2 Turbo is distilled to few steps and often gives very similar images for the same prompt. **Variation** under **Render** adds seed-dependent noise to the prompt embedding in the first quarter of the steps in **Create**, then the model continues with the clean prompt. 0 is off, 1 is the node author's recommendation, and values up to 5 vary more and follow the prompt less. The same seed still gives the same image. The option appears when ComfyUI loads the node [Seed Variance Enhancer - Krea 2 Turbo](https://github.com/harukimix/KreaSeedVarianceEnhancer).

### Krea 2 Turbo Edit

The **Krea 2 Turbo Edit** profile in **Edit** changes an image from an instruction using the Krea 2 edit LoRAs by [conradlocke](https://huggingface.co/conradlocke/krea2-identity-edit): **General Edit V2** for removing, recoloring, light, background and outfits, or **Identity Edit V2** to put a person in a new scene. The LoRAs belong in `models/loras` (or `Lora`), for example `krea2_general_edit_v2_r128.safetensors`. The workflow loads the LoRA itself, so do not add it again under LoRAs. The file variant (r64, r128, full) is under **Advanced settings**. The V2 LoRAs are free for private and non-commercial use only.

**Reference fidelity** (`ref_boost`) pulls the result closer to the source image. The LoRA author recommends 4 for General Edit and 2 for Identity Edit, but Pixelbench starts at 1. Any other value forces a dense attention mask that, on a 24 GB card at 1 MP, needs so much VRAM that ComfyUI aborts. The profile needs the nodes from [comfyui-krea2edit](https://github.com/lbouaraba/comfyui-krea2edit).

## FLUX.2 [klein] 4B Edit

The distilled profile needs the FP8 diffusion weight (about 3.79 GB) in `diffusion_models`: [flux-2-klein-4b-fp8.safetensors from Black Forest Labs](https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8/blob/main/flux-2-klein-4b-fp8.safetensors). It also uses `qwen_3_4b.safetensors` as text encoder and the FLUX.2 VAE (`flux2-vae.safetensors`).

## FLUX.2 [klein] 9B

Two profiles use the distilled 9B weights with 4 steps, Euler and a fixed CFG of 1. The 9B model needs the larger Qwen3 8B text encoder; the 4B encoder does not fit it. The 9B weights are under the [FLUX Non-Commercial License](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B), unlike the Apache-2.0 4B model.

- **FLUX.2 [klein] 9B** in **Create** follows the distilled branch of the Comfy-Org template `image_flux2_klein_text_to_image`. It supports image to image, the hires fix (also tiled, through `UltimateSDUpscaleGuider`) and the detailer. The KV weights work here too, since the KV cache only acts on reference images.
- **FLUX.2 [klein] 9B KV Edit** in **Edit** follows `image_flux2_klein_9b_kv_image_edit` and needs the KV weights, because `FluxKVCache` switches the model to the reference method those weights were trained for. It takes up to 3 reference images.
- **FLUX.2 [klein] 9B Inpainting** in **Inpaint** samples only the masked part of the encoded image, with Differential Diffusion for soft mask edges. **Denoising Strength** (default 0.8) shortens the Flux2 sigma schedule. Raise it to 1 for a full replacement. Both weight types work.
- **FLUX.2 [klein] 9B KV Outpainting** in **Outpaint** follows the Comfy-Org template `templates_doc_workbox_klein_9b_image_extend`: the new area is painted green, the image goes in as a reference, and the prompt asks the model to replace the green part. Your description is appended to that instruction. Like the edit profile, it needs the KV weights.

| Folder             | File                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diffusion_models` | [`flux-2-klein-9b-kv-fp8.safetensors`](https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-kv-fp8) (9.1 GB) for both profiles, or [`flux-2-klein-9b-fp8.safetensors`](https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8) for Create only |
| `text_encoders`    | [`qwen_3_8b_fp8mixed.safetensors`](https://huggingface.co/Comfy-Org/flux2-klein-9B/blob/main/split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors) (8.1 GB)                                       |
| `vae`              | [`flux2-vae.safetensors`](https://huggingface.co/Comfy-Org/flux2-dev/blob/main/split_files/vae/flux2-vae.safetensors)                                                                               |

## Prompt weights

You can weight parts of the prompt like in A1111 and Forge: `(word:1.3)` strengthens, `(word:0.7)` weakens, `(word)` equals 1.1, nesting multiplies, and `\(` and `\)` are literal parentheses. **Ctrl+Up/Down** changes the weight of the selection or the word at the cursor by 0.1 (with Shift by 0.05). At 1 the parentheses disappear. Weighted passages are highlighted in the prompt: warm for stronger, cool for weaker.

- **SDXL and FLUX Fill**: ComfyUI's `CLIPTextEncode` evaluates the weights itself. ComfyUI calculates differently from Forge, so the same number has a slightly different strength.
- **Krea 2**: the Qwen3-VL text encoder ignores the syntax. Pixelbench uses `Krea2PromptWeight` from [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) (GPL-3.0), which scales attention per token. `(word:-1)` reliably removes a concept, and values above 1 emphasize more loosely.
- **FLUX.2 klein, Qwen-Image 2.1 and Z-Image**: their LLM text encoders ignore weights. Pixelbench removes the syntax before sending and shows a notice. Without KJNodes the same applies to Krea 2.

Forge's `[word]` is converted to `(word:0.91)` when you take over generation data.

## Upscale models and the hires fix

Upscale models belong under `upscale_models`, `ESRGAN` or `RealESRGAN` in a model root folder. See [Editor and modes](editor.md#extras). The tiled hires fix needs [Ultimate SD Upscale](https://github.com/ssitu/ComfyUI_UltimateSDUpscale). Tiles have the profile's target size, with a Chess pattern and 64 px overlap. Profiles with a KSampler use `UltimateSDUpscale`, and Qwen-Image 2.1 Turbo with its fixed sigma schedule uses `UltimateSDUpscaleGuider`.

## Background removal

The BiRefNet model `birefnet.safetensors` from [Comfy-Org/BiRefNet](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) belongs under `background_removal` in a model root folder. ComfyUI 0.43 or later reads it with its core nodes, so no custom nodes are needed. See [Editor and modes](editor.md#extras).

## Custom nodes are installed for you

The nodes mentioned above (LanPaint, ComfyUI-GGUF, Ultimate SD Upscale, KreaSeedVarianceEnhancer, ComfyUI-KJNodes, comfyui-krea2edit) are downloaded by `install.cmd` into `.runtime/custom_nodes`, with the Python packages they need in `.runtime/python`. Restart Pixelbench after changing them. See [Third-party components](third-party.md).
