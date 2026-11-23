import { useLayoutEffect, useRef } from 'react'
import { context2d, surface } from '../image/canvas.js'
import type { Frame } from '../types/image.js'

export function Thumbnail({ frame }: { frame: Frame }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scale = Math.min(192 / frame.w, 96 / frame.h)
  const width = Math.max(1, Math.round(frame.w * scale))
  const height = Math.max(1, Math.round(frame.h * scale))
  useLayoutEffect(() => {
    const context = context2d(canvas.current!)
    context.clearRect(0, 0, width, height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(surface(frame), 0, 0, width, height)
  }, [frame, width, height])
  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" />
}
