# Changelog

All notable changes to Pixelbench. Versions follow [Semantic Versioning](https://semver.org/).

## [0.5.0-beta.1]

### Added

- Remove background in Extras: BiRefNet cuts out the subject of the shown image and makes the background transparent, with ComfyUI's core nodes and the model in `background_removal`.
- Detailer: optional own sampler, scheduler, steps and CFG for the detected objects, separate from the render.
- Hires fix: optional own sampler and scheduler for the hires pass, next to its own steps.
- A **Detailer** button in the variant toolbar, next to the hires fix button, runs the detailer on the selected variant with the current detailer settings.
- Reference images can be reordered by dragging, and dropping an image file onto a reference replaces it.
- The outpaint frame can be moved as a whole, and its edges snap to the model's size grid.
- About Pixelbench links to the release notes of the installed version and to all releases.
- FLUX.2 [klein] 9B profiles: **FLUX.2 [klein] 9B** in Create, with image to image, hires fix and detailer, **FLUX.2 [klein] 9B KV Edit** in Edit, **FLUX.2 [klein] 9B Inpainting** in Inpaint and **FLUX.2 [klein] 9B KV Outpainting** in Outpaint. All need the Qwen3 8B text encoder.
- The FLUX.2 [klein] Edit profiles (4B and 9B) take up to 3 reference images.

### Changed

- The detailer and hires fix sections are split into **General** and **Advanced** tabs. A dot on the Advanced tab marks active custom settings there, such as own sampling.
- Hires fix: **Details** is now called **Strength**, and its button is now **Apply to current image**, as in the detailer.
- Scale by: the factor presets sit as marks under the factor slider instead of in a separate row.
- Removing a reference image no longer renumbers the image tags in the prompt, so a replacement image keeps its tags.
- Clearing variants is disabled while there is nothing to clear, and the variant strip stays visible while it only holds the source image.
- Various smaller fixes and improvements

## [0.4.0-beta.1]

### Added

- macOS support: Pixelbench can be installed and launched on macOS, including Apple Silicon, with its own install and launch commands and platform-specific keyboard shortcuts.
- Models that are not supported on Apple Silicon are flagged in the inspector instead of failing silently.

### Changed

- Variant handling was reworked: applying a variant shows its source on the canvas, and clearing variants also works for newly created documents.
- Shortcut hints in the editor and topbar follow the platform you are on.

## [0.3.0-beta.1]

### Added

- Outpainting prompt refinement can now look at the image: the vision model describes only the new area around it, so the extension continues the picture seamlessly.
- Press **Enter** to apply the shown variant as the working image.

### Changed

- Reworked variant strip with new variant actions, and a tidier canvas toolbar and responsive layout.
- The variant toggle moved out of the backend console and into the editor. **Shift+D** and the docs now say "variants" instead of "previews".

### Fixed

- Frame records are kept when pixel adjustments are applied, so the frame information stays correct.

## [0.2.0-beta.1]

> [!IMPORTANT]
> Installs of 0.1.0-beta.1 have no updater yet. Install this release once by hand: unpack the zip over your Pixelbench folder (or into a new one) and run `install.cmd`. From here on, Pixelbench updates itself.

### Added

- In-app update: Pixelbench checks GitHub for a new release at most once a day and installs it with one click under **Settings → About Pixelbench**. Settings, models and your own files stay, and a failed update rolls back. The check can be turned off, and beta versions are optional.
- Upscale model for small crops in the detailer, with an upscaler choice in the detailer settings.
- Color correction for image to image and upscaling.
- Blur in the image adjustments.
- Clearer errors for missing models, with the files a profile needs.

### Changed

- Various fixes and improvements, among them corrected contrast and brightness adjustments.

## [0.1.0-beta.1]

First public beta.

[0.4.0-beta.1]: https://github.com/Fenrir200678/pixelbench/releases/tag/v0.4.0-beta.1
[0.3.0-beta.1]: https://github.com/Fenrir200678/pixelbench/releases/tag/v0.3.0-beta.1
[0.2.0-beta.1]: https://github.com/Fenrir200678/pixelbench/releases/tag/v0.2.0-beta.1
[0.1.0-beta.1]: https://github.com/Fenrir200678/pixelbench/releases/tag/v0.1.0-beta.1
