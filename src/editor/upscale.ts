import { maxEdge, maxPixels } from '../image/pixels.js'

// "by" multiplies the source size. "to" sets the result size; locked, the height follows the source ratio.
export type Scale = { mode: 'by' | 'to'; factor: number; w: number; h: number; lock: boolean }
export const initialScale: Scale = { mode: 'by', factor: 2, w: 2048, h: 2048, lock: true }
export const upscaleFactors = [1.5, 2, 3, 4]

// The source covers the result and is cropped from the center, so it grows by a factor of 1 to 4.
// The result stays within the editor's input limits.
export function scaledSize([sw, sh]: [number, number], scale: Scale): [number, number] {
  const [w, h] =
    scale.mode === 'by'
      ? [sw * scale.factor, sh * scale.factor]
      : scale.lock
        ? [scale.w, (scale.w * sh) / sw]
        : [scale.w, scale.h]
  const cover = Math.max(w / sw, h / sh)
  const fit = cover > 4 ? 4 / cover : cover < 1 ? 1 / cover : 1
  const k = Math.min(fit, maxEdge / w, maxEdge / h, Math.sqrt(maxPixels / (w * h)))
  return [Math.max(64, Math.floor(w * k + 1e-6)), Math.max(64, Math.floor(h * k + 1e-6))]
}

// One hires pass renders the whole result, snapped to the profile grid. Above the profile's size limits it needs
// much more VRAM and time, and the inspector says so. Tiling stays the user's choice.
export function exceedsProfile(sizes: { grid: number; max: number; area: number }, [w, h]: [number, number]) {
  const snap = (n: number) => Math.max(sizes.grid, Math.round(n / sizes.grid) * sizes.grid)
  const [rw, rh] = [snap(w), snap(h)]
  return rw > sizes.max || rh > sizes.max || rw * rh > sizes.area
}

// The result has another aspect ratio than the source and is cropped from the center.
export const cropped = ([sw, sh]: [number, number], [w, h]: [number, number]) => Math.abs(w / h / (sw / sh) - 1) > 0.01
