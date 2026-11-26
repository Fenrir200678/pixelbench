import { useMemo, useState } from 'react'
import { brushLimits } from '../editor/tools.js'
import type { Drawing } from '../image/mask.js'
import { clamp } from '../image/pixels.js'
import type { Tool, Work } from '../types/editor.js'

type Inputs = {
  tool: Tool
  work: Work | undefined
  create: boolean
  drawing: Drawing | undefined
  commit: (work: Work) => void
  /** Leaves the previewed variant so the canvas shows the editable image again. */
  deselect: () => void
}

export type SessionTools = {
  pan: boolean
  frameMode: boolean
  eraser: boolean
  paintBrush: boolean
  brushColor: string
  brushSize: number
  showMask: boolean
}

/** Canvas interaction state: pan, frame, brush, eraser and mask visibility. */
export function useCanvasTools({ tool, work, create, drawing, commit, deselect }: Inputs) {
  const [pan, setPan] = useState(false)
  const [frameMode, setFrameMode] = useState(false)
  const [space, setSpace] = useState(false)
  const [eraser, setEraser] = useState(false)
  const [paintBrush, setPaintBrush] = useState(false)
  const [brushColor, setBrushColor] = useState('#b3263c')
  const [brushSize, setBrushSize] = useState(48)
  const [showMask, setShowMask] = useState(true)
  const sessionState = useMemo(
    () => ({ pan, frameMode, eraser, paintBrush, brushColor, brushSize, showMask }),
    [pan, frameMode, eraser, paintBrush, brushColor, brushSize, showMask]
  )

  function chooseEraser(value: boolean) {
    deselect()
    setPan(false)
    setFrameMode(false)
    setEraser(value)
  }

  function selectBrush(paint: boolean) {
    if (!work || create) return
    if (paint && !drawing) commit({ ...work, drawing: [] })
    if (!paint) setShowMask(true)
    setPaintBrush(paint)
    chooseEraser(false)
  }

  function deleteDrawing() {
    if (!work || !drawing) return
    commit({ ...work, drawing: undefined })
    setPaintBrush(false)
    setEraser(false)
    deselect()
  }

  function clearMask() {
    if (!work?.strokes.length) return
    commit({ ...work, strokes: [] })
    setShowMask(true)
  }

  /** Resets every mode that does not carry over to another tool. */
  function resetForTool() {
    setPan(false)
    setFrameMode(false)
    setPaintBrush(false)
    setEraser(false)
  }

  /** Resets the state tied to the previous document. */
  function resetForDocument() {
    setShowMask(true)
    setFrameMode(false)
    setPaintBrush(false)
  }

  /** Resets the state after a preview or baseline replaced the working image. */
  function resetAfterReplace() {
    setShowMask(true)
    if (paintBrush) setEraser(false)
    setPaintBrush(false)
  }

  function toggleFrame() {
    setFrameMode(tool !== 'outpaint' && (!frameMode || pan))
    if (tool === 'outpaint') setPaintBrush(false)
    setPan(false)
  }

  return {
    sessionState,
    restore(next: SessionTools) {
      setPan(next.pan)
      setFrameMode(next.frameMode)
      setSpace(false)
      setEraser(next.eraser)
      setPaintBrush(next.paintBrush)
      setBrushColor(next.brushColor)
      setBrushSize(next.brushSize)
      setShowMask(next.showMask)
    },
    pan,
    space,
    frameMode,
    eraser,
    paintBrush,
    brushColor,
    brushSize,
    showMask,
    setPan,
    setSpace,
    setBrushColor,
    setBrushSize,
    setShowMask,
    chooseEraser,
    selectBrush,
    deleteDrawing,
    clearMask,
    resetForTool,
    resetForDocument,
    resetAfterReplace,
    toggleFrame,
    togglePan: () => setPan((value) => !value),
    toggleMask: () => setShowMask((value) => !value),
    resizeBrush: (direction: number) =>
      setBrushSize((size) => clamp(size + direction * 8, brushLimits.min, brushLimits.max))
  }
}
