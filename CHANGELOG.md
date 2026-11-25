# Changelog

All notable changes to Pixelbench. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Remove background in Extras: BiRefNet cuts out the subject of the shown image and makes the background transparent, with ComfyUI's core nodes and the model in `background_removal`.

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
