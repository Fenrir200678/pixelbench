# Editor and modes

The editing modes are in the middle of the header and switch with the keys **1** to **5**. The tools, mask controls and zoom are below the canvas. Job settings are in the inspector on the right.

| Key | Mode                                      | Needs an open image |
| --- | ----------------------------------------- | ------------------- |
| 1   | Create (create image)                     | No                  |
| 2   | Edit (edit image)                         | Yes                 |
| 3   | Inpaint (inpaint area)                    | Yes                 |
| 4   | Outpaint (extend image)                   | Yes                 |
| 5   | Extras (generation data and upscale)      | Yes                 |

Which profiles each mode offers is listed in [Profiles and models](profiles-and-models.md#profiles).

## Resume an editing session

Pixelbench saves one local session. By default, it saves automatically five seconds after the last edit. Change the delay or turn autosave off in **Settings → General → Session**. Use the disk icon in the header to save immediately, or **Restore session** to pick up after a reload or restart.

The session includes prompts for each mode, workflow settings, the working image, masks, drawing, pending adjustments, references and finished variants. Running jobs and undo/redo history are not carried over. A newly opened editor keeps the old session until you restore it or explicitly replace it with **Save session now**.

## Create

Create an image from a prompt without a starting image.

- **Size.** Aspect ratio chips choose a size that fits the profile. You can also type width and height. The arrow between them swaps both values.
- **Apply** or **Set as starting image** makes a variant the working image and switches to Edit. If an image is open, Pixelbench asks first, and **Ctrl+Z** restores it.
- **New** in the header closes the document (after asking about unexported changes), deletes the variants and starts a new image in Create. The prompt stays.
- **Template.** You can use the current image or a dropped image as a template for img2img. The box is only ticked for you when you open or drop an image in Create. **Apply** on a variant leaves it as it is, and **New** clears it. Low strength stays close to the template, high strength is freer. Without a template, the image comes from the prompt only.
- **Color correction** in the Img2Img section matches the colors of the result to the template, like the Forge option "Apply color correction to img2img results". It helps when img2img shifts saturation or contrast. 0 is off, 1 is full. Turn it off when the prompt is meant to change colors. It needs the KJNodes node `ColorMatchV2`, which the installer adds.
  The Img2Img section shows the source image as a thumbnail. Img2Img always uses the source image, not a variant you are only looking at. While another variant is shown, a note offers **Use variant N as source**.
- **Variation** (Krea 2 Turbo) adds seed-dependent noise to the prompt embedding in the first quarter of the steps. 0 is off, 1 is the node author's recommendation and values up to 5 vary more and follow the prompt less. The same seed still gives the same image. See [Profiles and models](profiles-and-models.md#more-variation-with-krea-2-turbo).

### Hires fix

The hires fix lives in Create. It enlarges an image and re-renders it with low strength in an img2img pass at the target size, like in Forge.

- **Apply when generating** upscales every created image in a second job right after the first render. Both variants stay in the strip.
- **Render in tiles** switches to Ultimate SD Upscale. Above the profile's maximum size (usually 2048 px or 4.2 MP) a notice warns about the higher VRAM and time needs without tiles. Tiled mode uses a Chess pattern with 64 px overlap.
- The same prompt, seed and LoRAs apply.
- **Strength** sets how strongly the enlarged image is re-rendered. Around 0.3 stays close to the first render.
- **Upscale model** enlarges the image before the re-render. **Lanczos (no model)** enlarges without a model, which is faster but softer.
- The **Advanced** tab holds **Color correction**, which matches the colors of the result to the image before upscaling (0 is off), the pass's own **Hires steps** (0 uses the steps under **Render**), **Sampler** and **Scheduler** (**Same as render** by default) and **Render in tiles**. A dot on the tab shows that one of them differs from the default.
- **Lock seed** in the section keeps the seed of the last created or selected variant, like the lock under **Render**. It is set automatically when you turn the hires fix on, and you can unset it. With a locked seed the first render comes from the cache and only the hires fix is recomputed.
- **Apply to current image** runs the same pass on the open image without a new render.
- For variants from Create, **Hires fix 2x** in the variant strip runs it afterwards.

## Edit

Edit an image with an instruction and optional image references (up to 15 with Qwen-Image 2.1, up to 3 with the FLUX.2 [klein] Edit profiles). If the Qwen base model is missing, the editor picks the available Turbo profile. See [Image references](profiles-and-models.md#image-references).

## Inpaint

Replace an area with the mask brush.

- **M** selects the **Mask Brush** and **E** the **Eraser**. **,** and **.** change the brush size, and Ctrl plus the mouse wheel over the image does too.
- **H** shows or hides the mask. **Shift+M** clears it. **Ctrl+Z** undoes a stroke or the clearing.
- **Auto** under **Render resolution** picks the crop around the mask including context. With **Auto** off the whole image is used by default. A manually set frame takes priority.
- A soft mask edge works inside the painted pixels. The display opacity only changes how the mask looks.
- **Color correction** in the Mask section matches the colors of the result to the source image, as in Img2Img (0 is off). It needs the KJNodes node `ColorMatchV2`.
- **C** switches the generation frame on or off in Edit and Inpaint.
- Applying a detailer variant turns the detected masks into the Inpaint mask, where you can extend or erase them.

Outside the mask the original pixels are kept. PNG channel values outside the effective mask stay unchanged.

## Outpaint

Extend the image by dragging the eight frame handles, or type target width, target height and the original's offset (**Original from left**, **Original from top**). The target frame can be up to 8192 px per side and 24 MP. Drag inside the frame to move it as a whole around the image. While dragging, the frame edges snap to the size grid of the model.

The **Transition** setting can blend inside the original along the extended edges. At 0 px the original pixels match everywhere in the placed rectangle.

**Color correction** under **Size** matches the colors of the result to the original image (0 is off). The gray filler of the new area is left out of the reference. It needs the KJNodes node `ColorMatchV2`.

## Extras

Extras has three jobs.

**Generation data.** Drop an image on the field at the top of the section, or click the field to choose a file, to read its stored generation data (prompt, negative prompt, seed, settings and raw data). The image appears there as a thumbnail next to its data, and the canvas keeps the open image. The × button clears the field. You can copy values, **Send to canvas** to open the image, or send the settings to Create, Edit or Inpaint (everything except the model). An image dropped on the canvas always opens, as in the other modes, and does not fill this section. Data written by Forge, ComfyUI tools and Pixelbench is readable.

**Upscale (upscaler only).** Enlarges the whole working image with an upscale model, or with Lanczos if you choose no model. There is no prompt and no diffusion model.

- **Scale by** takes a factor from 1 to 4. **Scale to** takes a width and height.
- With the aspect ratio lock open, the image is cropped from the center to the new aspect ratio.
- The result stays within 8192 px per side and 24 MP.
- Upscale models such as `4x-UltraSharpV2.safetensors` belong in `upscale_models`, `ESRGAN` or `RealESRGAN` in a model root folder. UltraSharp is preselected when found. You can add folders in Settings under `upscale_models`. DAT models like UltraSharpV2 are much slower than ESRGAN models.

For more detail than a plain upscale, use the hires fix in Create.

**Remove background.** Cuts out the subject of the shown image (the selected variant or the open image) with BiRefNet and makes the background transparent. **Apply to current image** creates a variant at the same size. There is no prompt and no diffusion model.

- The canvas shows transparent areas as a checkerboard. Export as PNG to keep the transparency. JPG fills them with white.
- Later jobs in other modes see transparent areas as neutral gray.
- With **Keep the background as the Inpaint mask** (on by default), applying the variant turns the transparent area, including the soft edges, into the mask for Inpaint. Switch to Inpaint and describe the new background to fill it.
- It needs ComfyUI 0.43 or later, whose core nodes `LoadBackgroundRemovalModel` and `RemoveBackground` do the work, and the model [`birefnet.safetensors`](https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal) (444 MB, MIT license) in `background_removal` in a model root folder. If several files are there, you can pick one.

## Drawing layer

The drawing layer is for color and shape sketches in all workflows.

- **B** selects the solid brush and creates a layer if needed. Pick the color in the canvas controls, where you can also create and delete the layer.
- **E** and the right mouse button erase on the active layer.
- In inpainting, the sketch works inside the mask. In outpainting you can also paint into the extension area.
- The sketch becomes part of the model's input image. Applying a variant removes the layer. Export uses the last applied working image.

## Detailer

The detailer re-renders detected objects (for example faces) one at a time with the model, LoRAs and seed of the render. A switch at the top picks how it finds them:

- **YOLO** (default) runs a small detection model in the browser on the CPU. It needs no ComfyUI job and no extra VRAM, so the render models stay loaded. The installer downloads `yolov11s-face` for faces and `hand_yolov8n` for hands to `.runtime/models/yolo`. Pick one as the detection model. Further YOLO detection models exported to ONNX (Ultralytics YOLOv8, YOLO11, YOLOv10 or YOLO26) can go into the same folder, with an optional `<name>.json` such as `{ "labels": ["face"] }` for their class names. YOLO finds boxes, so the masks are rectangles; mask growth and feathering soften their edges.
- **SAM3** finds any object from a short English description, at the cost of a ComfyUI job and more VRAM. It needs ComfyUI with SAM3 and the model `sam3.1_multiplex_fp16.safetensors` under `checkpoints`. Enter the description as the object prompt (for example `person, car, cat`, separated by commas; `face:2` limits the hits).

Options include a detailer prompt (empty uses the main prompt), strength, padding, mask growth, detection threshold and maximum hits. Around 0.4 strength the face stays similar. Each crop is rendered at least at the profile's target size; small crops can first be enlarged with an upscale model for sharper results. By default the browser scales them, which gives a softer result. **Apply to current image** refines the selected variant or open image without a new render.

The section has two tabs. **General** holds the object prompt, detailer prompt, strength, the display and mask options and **Apply to current image**. **Advanced** holds detection (maximum hits, threshold), the mask settings (padding, growth, transition), the upscale model and optional **own sampling settings**: sampler, scheduler, steps and CFG for the objects only, where the profile exposes them. With the option off, the detailer uses the render's values.

When a variant is selected, the **Detailer** button in the canvas toolbar, next to the hires fix button, runs the detailer on it with the current detailer settings. A created variant keeps its own profile, prompt, seed and LoRAs, like the quick hires fix.

## Image adjustments

**A** shows or hides the adjustments panel: brightness, contrast, saturation, hue, temperature, blur, sharpness and levels with a live histogram. **V** shows or hides the adjustment preview. Double-click a slider to reset it. With a mask, adjustments apply only to the masked area.

## Variants and compare

- Every job adds a variant to the strip under the canvas. Right-click a variant for actions.
- **Left/Right arrow** switches between variants at the same zoom.
- **V** splits the canvas into before and after. Drag the divider, or move it with the arrow keys when its handle has focus.
- The **Source** card at the start of the strip shows the open image that the next job starts from, in every mode. Click it to show it on the canvas. A variant only becomes the source through **Apply** or **Set as starting image**. In Create without Img2Img the card is dimmed, because the source is not used there. A click still shows the image until you pick a variant or press **Esc**.
- **Apply** (or **Enter**) sets the working state. **Set as starting image** (canvas controls or **S**) uses the shown image for further jobs and starts with an empty mask. The variants stay available. **Ctrl+Z** undoes both actions.
- The circular arrow runs a job again with its original inputs, effective settings, model paths and seed.
- **Delete** removes a variant. **Shift+D** deletes all variants and **Shift+V** shows or hides the strip.

## Canvas and view

- The mouse wheel zooms around the pointer. **-** and **+** zoom in steps, **0** resets to 100 % and **F** fits the view.
- **G** toggles the hand tool. The middle mouse button or **Space** plus dragging pans temporarily.
- **Effective** shows the generation grid before you start. The original image size or the set outpaint frame determines the export.

Under **Size** you can set frame size and render resolution separately. The lock next to each size keeps the aspect ratio. You can move the frame on the canvas. Under **Render**, the seed lock enables manual entry. With the lock open, a random seed is used per run.

## Prompt refinement

**Refine prompt** asks a local text model to rewrite your prompt. You choose the model under **Advanced settings → Prompt refinement model** in the inspector. The suggestion appears for you to accept or discard.

## Prompt history

Every generation you start in Create, Edit, Inpaint or Outpaint saves its prompt and, if the model uses one, its negative prompt. Typing alone saves nothing. The history button next to **Refine prompt** lists the saved prompts, newest first, with their mode and time. A click puts the prompt back into the field, and a saved negative prompt replaces the current one. **×** deletes an entry right away; **Undo** brings it back until the list closes. Running the same prompt again moves it to the top instead of adding it twice. With 15 or more entries, a search field appears.

## Console

The **Console** in the footer (**Shift+C**) shows timestamps, running nodes, phase durations, cache hits and messages from ComfyUI and the bridge. The log is kept in memory only. You can open it automatically on errors in Settings.

## Sessions, files and export

- The editor keeps undo history in memory. Session backups, including images and masks, are stored locally under `.runtime/editor-session`. Backend settings are saved in `.settings.json`; defaults and presets are saved in the browser.
- Export downloads a file with a new name. Inputs are PNG (up to 8 bits per channel), JPEG and WebP, up to 8192 px per side and 24 MP. PNG export has 8 bits per channel and contains every pixel of the working size. Metadata and color profiles of the input are left out, but generation data can be stored in exported PNGs (see Settings → Export).
- Starting a new image ends the previous editing session.
- When you close or leave the tab with an unexported applied result, the browser shows its native warning after you interacted with the page.

## Privacy and the private ComfyUI process

The app binds only to 127.0.0.1. It starts your existing ComfyUI as a separate process with its own working folder under `.runtime`. Inputs go through a job folder and outputs through PreviewImage into the private temp folder. After a job finishes or is cancelled, the bridge removes the job files and its own history entry. A process lock protects running private instances when orphaned folders are cleaned up. Cancel targets the job ID of the bridge's own ComfyUI job.

An external ComfyUI instance is only for diagnostics. ComfyUI's standard API gives the bridge no way to safely delete all job files, so jobs are blocked in that mode.
