import { useEffect, useMemo, useRef, useState } from 'react'
import {
  adjust,
  adjustFrame,
  autoLevels,
  histogram,
  isNeutral,
  neutralAdjustments,
  type AdjustmentKey,
  type Adjustments,
  type Histogram,
  type LevelChannel,
  type Levels
} from '../image/adjust.js'
import { canvas, context2d, pixelsAtSize } from '../image/canvas.js'
import type { Work } from '../types/editor.js'
import type { Frame } from '../types/image.js'

// The live preview runs on a copy of at most this edge length. Apply works on the full image.
const previewEdge = 2048

type Options = {
  work?: Work
  /** Alpha of the active mask in image pixels. The adjustment then only applies inside it. */
  mask?: Uint8ClampedArray
  commit: (next: Work) => void
}

function proxyFrame(image: Frame): Frame {
  const scale = Math.min(1, previewEdge / Math.max(image.w, image.h))
  if (scale === 1) return image
  const w = Math.max(1, Math.round(image.w * scale)),
    h = Math.max(1, Math.round(image.h * scale))
  return { ...image, w, h, pixels: pixelsAtSize(image, w, h) }
}

// Nearest-neighbor copy of the mask at the proxy size.
function proxyMask(mask: Uint8ClampedArray, image: Frame, proxy: Frame) {
  if (proxy === image) return mask
  const result = new Uint8ClampedArray(proxy.w * proxy.h)
  for (let y = 0; y < proxy.h; y++) {
    const row = Math.min(image.h - 1, Math.floor(((y + 0.5) * image.h) / proxy.h)) * image.w
    for (let x = 0; x < proxy.w; x++)
      result[y * proxy.w + x] = mask[row + Math.min(image.w - 1, Math.floor(((x + 0.5) * image.w) / proxy.w))]
  }
  return result
}

/** Brightness, contrast, color and sharpness for the open image, previewed live and applied as one undo step. */
export function useAdjustments({ work, mask, commit }: Options) {
  const image = work?.image
  // A session belongs to the image it was opened on. Any other image, by undo or a new file, ends it.
  const [session, setSession] = useState<{ image: Frame; values: Adjustments }>()
  const active = session && session.image === image ? session : undefined
  const openImage = active?.image
  const values = active?.values ?? neutralAdjustments
  const proxy = useMemo(() => (openImage ? proxyFrame(openImage) : undefined), [openImage])
  const previewMask = useMemo(
    () => (mask && openImage && proxy ? proxyMask(mask, openImage, proxy) : undefined),
    [mask, openImage, proxy]
  )
  // Two canvases take turns, so the viewport sees a new source on every update without new allocations.
  const surfaces = useRef<HTMLCanvasElement[]>([])
  // Off shows the unadjusted image for a quick before/after.
  const [showPreview, setShowPreview] = useState(true)
  const [rendered, setRendered] = useState<{ surface: HTMLCanvasElement; proxy: Frame; counts: Histogram }>()
  const sourceCounts = useMemo(() => (proxy ? histogram(proxy.pixels) : undefined), [proxy])

  useEffect(() => {
    if (!proxy || isNeutral(values)) return
    const frame = requestAnimationFrame(() => {
      const adjusted = adjustFrame(proxy, values, previewMask)
      let next = surfaces.current.find((surface) => surface !== rendered?.surface)
      if (!next || next.width !== proxy.w || next.height !== proxy.h) {
        next = canvas(proxy.w, proxy.h)
        surfaces.current = [next, ...surfaces.current.filter((surface) => surface === rendered?.surface)]
      }
      context2d(next).putImageData(new ImageData(new Uint8ClampedArray(adjusted.pixels), proxy.w, proxy.h), 0, 0)
      setRendered({ surface: next, proxy, counts: histogram(adjusted.pixels) })
    })
    return () => cancelAnimationFrame(frame)
    // The surface shown last is only read to pick the other one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxy, values, previewMask])

  function open() {
    setShowPreview(true)
    if (image) setSession({ image, values: { ...neutralAdjustments } })
  }

  function cancel() {
    setSession(undefined)
  }

  function set(key: AdjustmentKey, value: number) {
    if (active) setSession({ ...active, values: { ...active.values, [key]: value } })
  }

  function setLevels(channel: LevelChannel, levels: Levels) {
    if (active)
      setSession({ ...active, values: { ...active.values, levels: { ...active.values.levels, [channel]: levels } } })
  }

  // Auto works on the image as the other settings leave it, before any levels.
  function autoLevel() {
    if (!active || !proxy) return
    const before = { ...active.values, levels: neutralAdjustments.levels, sharpness: 0 }
    setLevels('rgb', autoLevels(histogram(adjust(proxy.pixels, proxy.w, proxy.h, before))))
  }

  function reset() {
    if (active) setSession({ ...active, values: { ...neutralAdjustments } })
  }

  function apply() {
    if (!active || !work) return
    if (!isNeutral(active.values)) commit({ ...work, image: adjustFrame(work.image, active.values, mask) })
    setSession(undefined)
  }

  const current = active && !isNeutral(values) && rendered && rendered.proxy === proxy ? rendered : undefined
  return {
    open: Boolean(active),
    values,
    masked: Boolean(mask),
    neutral: isNeutral(values),
    showPreview,
    setShowPreview,
    preview: showPreview ? current?.surface : undefined,
    /** Histogram of the adjusted preview, or of the image while nothing is adjusted. */
    counts: current?.counts ?? sourceCounts,
    setLevels,
    autoLevel,
    toggle: () => (active ? cancel() : open()),
    cancel,
    set,
    reset,
    apply
  }
}

export type AdjustmentsState = ReturnType<typeof useAdjustments>
