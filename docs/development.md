# Development

Use a git checkout and run `install.cmd` once. It installs all npm packages and builds the editor. Then use the commands below with Node.js 24 or newer. On Windows, use PowerShell; use `npm.cmd` if PowerShell blocks `npm.ps1`. On macOS, the same commands work in any shell (zsh or bash).

## npm scripts

| Command                  | Effect                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm start`              | Starts the bridge server (`server/index.mjs`) on <http://127.0.0.1:3720>.               |
| `npm run dev`            | Starts the Vite dev server on <http://127.0.0.1:5173>.                                  |
| `npm run build`          | Type-checks, then builds the editor into `dist/`.                                       |
| `npm run typecheck`      | Runs `tsc --noEmit`.                                                                    |
| `npm run lint`           | Checks JavaScript, TypeScript, React and React Hooks with ESLint.                       |
| `npm run format:check`   | Checks formatting of the source and project configuration with Prettier.                |
| `npm run format`         | Applies Prettier.                                                                       |
| `npm test`               | Builds, then runs `node --test checks/*.test.mjs`.                                      |

## Dev server

Start the bridge with `npm start` and Vite in a second terminal with `npm run dev`. Open <http://127.0.0.1:5173> for React Fast Refresh. Vite proxies `/api/` to the local bridge. If you use another `PIXELBENCH_PORT`, set it in both terminals. The production build lands in `dist/` and is served directly by the bridge.

Brush strokes and panning are processed directly on the canvas during the gesture. The history takes over finished strokes. Browser presets and model selection use the same storage keys as before.

## Project layout

| Path                  | Content                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `src/components`      | UI components (canvas, inspector, settings, variants).                                        |
| `src/ui`              | Shared controls.                                                                              |
| `src/style`           | Styles.                                                                                       |
| `src/hooks`           | React hooks for image history, variants, workflow and backend connection, among others.       |
| `src/editor`          | Logic for tools, models and generation.                                                       |
| `src/image`           | Canvas, masks and image files.                                                                |
| `src/api`             | HTTP client for the bridge.                                                                   |
| `src/helpers`         | General helper functions.                                                                     |
| `src/types`           | Shared types.                                                                                 |
| `src/i18n`            | UI texts and translations.                                    |
| `server/`             | The Node bridge: HTTP API, jobs, ComfyUI process and client, profile handling.                |
| `profiles/`           | Profile JSON files.                                                                           |
| `workflows/`          | ComfyUI API workflow graphs used by the profiles.                                             |
| `scripts/`            | `setup.mjs` and `setup/` (installer logic, `manifest.json`), `launch.mjs`.                    |
| `checks/`             | Tests.                                                                                        |
| `docs/`               | This documentation.                                                                           |

## Tests

```powershell
npm test
node checks/gpu.mjs
```

The commands are the same on macOS.

`npm test` runs the `checks/*.test.mjs` tests. They cover the size grid, alpha-preserving compositing, the block on external jobs, targeted cleanup of marked orphaned work folders, prompt weights, references, metadata, adjustments, setup logic and more. A local API test instance checks connection loss. They need no inference.

`checks/gpu.mjs` needs a running editor and local model weights. `checks/references-ui.mjs` uses an installed Chrome at its usual place on Windows or macOS. Set `PIXELBENCH_CHROME` for a different Chrome path. The tests use generated test images and remove their export files from the system temp folder.
