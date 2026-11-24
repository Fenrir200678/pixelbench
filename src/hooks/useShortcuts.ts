import { useEffect, useEffectEvent } from 'react'
import {
  canvasKeys,
  clearVariantsKey,
  consoleKey,
  exportKey,
  newImageKey,
  toggleVariantsKey,
  toolNames,
  tools
} from '../editor/tools.js'
import type { Tool } from '../types/editor.js'

type Actions = {
  tool: Tool
  loaded: boolean
  canOpen: boolean
  dirty: boolean
  hasVariants: boolean
  canFrame: boolean
  canToggleMask: boolean
  canClearMask: boolean
  canSetBaseline: boolean
  canAdjust: boolean
  paintBrush: boolean
  stageHovered: () => boolean
  chooseTool: (tool: Tool) => void
  setEraser: (erase: boolean) => void
  selectBrush: (paint: boolean) => void
  setSpace: (space: boolean) => void
  togglePan: () => void
  toggleFrame: () => void
  toggleMask: () => void
  clearMask: () => void
  resizeBrush: (direction: -1 | 1) => void
  zoom: (direction: -1 | 0 | 1) => void
  fit: () => void
  setBaseline: () => void
  toggleAdjust: () => void
  toggleCompare: () => void
  canApply: boolean
  apply: () => void
  dismiss: () => void
  remove: () => void
  clearVariants: () => void
  toggleVariants: () => void
  movePreview: (by: number) => void
  open: () => void
  canNew: boolean
  newImage: () => void
  toggleConsole: () => void
  exportImage: () => void
  run: () => void
  travel: (direction: 'undo' | 'redo') => void
}

export function useShortcuts(actions: Actions) {
  const keyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return
    const key = event.key.toLowerCase()
    const ctrl = event.ctrlKey || event.metaKey
    const target = event.target
    if (ctrl && key === 'enter') {
      event.preventDefault()
      actions.run()
      return
    }
    if (ctrl && key === 'o') {
      event.preventDefault()
      if (actions.canOpen) actions.open()
      return
    }
    if (ctrl && key === 's') {
      event.preventDefault()
      actions.exportImage()
      return
    }
    const range = target instanceof HTMLInputElement && target.type === 'range'
    if (
      target instanceof HTMLElement &&
      (target.matches('input:not([type="range"], [type="checkbox"]), textarea, select') || target.isContentEditable)
    ) {
      // Escape leaves the field so the shortcuts work again. Open suggestion lists handle it first.
      if (key === 'escape') target.blur()
      return
    }
    if (ctrl && (key === 'z' || key === 'y')) {
      event.preventDefault()
      actions.travel(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      return
    }
    if (ctrl || event.altKey) return
    const mode = toolNames.find((tool) => tools[tool].key === key)
    if (mode && !event.shiftKey && !event.repeat) {
      actions.chooseTool(mode)
      return
    }
    const shortcut = (event.shiftKey && /^[a-z]$/.test(key) ? 'Shift+' : '') + key.toUpperCase()
    if (shortcut === consoleKey || shortcut === newImageKey) {
      if (event.repeat) return
      if (shortcut === consoleKey) actions.toggleConsole()
      else if (actions.canNew) actions.newImage()
      return
    }
    if (!actions.loaded) return
    const focusedControl =
      target instanceof HTMLElement &&
      target.matches('button:focus-visible, input, a:focus-visible, summary:focus-visible')
    if (
      key === ' ' &&
      !focusedControl &&
      (target === document.body || target instanceof HTMLCanvasElement || actions.stageHovered())
    ) {
      event.preventDefault()
      actions.setSpace(true)
    } else if (shortcut === canvasKeys.hand && !event.repeat) actions.togglePan()
    else if (shortcut === canvasKeys.frame && actions.canFrame && !event.repeat) actions.toggleFrame()
    else if (shortcut === canvasKeys.mask && actions.canToggleMask && !event.repeat) actions.toggleMask()
    else if (shortcut === canvasKeys.clearMask && actions.canClearMask && !event.repeat) actions.clearMask()
    else if (shortcut === canvasKeys.baseline && actions.canSetBaseline && !event.repeat) actions.setBaseline()
    else if (shortcut === canvasKeys.adjust && actions.canAdjust && !event.repeat) actions.toggleAdjust()
    else if (shortcut === exportKey && !event.repeat) actions.exportImage()
    else if (shortcut === canvasKeys.brush && !event.repeat) actions.selectBrush(true)
    else if (shortcut === canvasKeys.maskBrush && actions.tool === 'inpaint' && !event.repeat)
      actions.selectBrush(false)
    else if (shortcut === canvasKeys.eraser && (actions.paintBrush || actions.tool === 'inpaint'))
      actions.setEraser(true)
    else if (
      (actions.paintBrush || actions.tool === 'inpaint') &&
      (shortcut === canvasKeys.smallerBrush || shortcut === canvasKeys.largerBrush)
    )
      actions.resizeBrush(shortcut === canvasKeys.smallerBrush ? -1 : 1)
    else if (shortcut === canvasKeys.zoomOut) actions.zoom(-1)
    else if (shortcut === canvasKeys.zoomIn) actions.zoom(1)
    else if (shortcut === canvasKeys.zoomActual) actions.zoom(0)
    else if (shortcut === canvasKeys.fit) actions.fit()
    else if (shortcut === toggleVariantsKey && actions.hasVariants && !event.repeat) actions.toggleVariants()
    else if (key === 'v') actions.toggleCompare()
    else if (key === 'enter' && !focusedControl && actions.canApply && !event.repeat) actions.apply()
    else if (key === 'escape') actions.dismiss()
    else if (key === 'delete') actions.remove()
    else if (shortcut === clearVariantsKey && actions.hasVariants && !event.repeat) actions.clearVariants()
    else if (!range && actions.hasVariants && (key === 'arrowleft' || key === 'arrowright')) {
      event.preventDefault()
      actions.movePreview(key === 'arrowright' ? 1 : -1)
    }
  })
  const releaseSpace = useEffectEvent(() => actions.setSpace(false))

  useEffect(() => {
    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    window.addEventListener('keydown', keyDown, options)
    window.addEventListener(
      'keyup',
      (event) => {
        if (event.key === ' ') releaseSpace()
      },
      options
    )
    window.addEventListener('blur', releaseSpace, options)
    const guardDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', guardDrop, options)
    window.addEventListener('drop', guardDrop, options)
    return () => listeners.abort()
  }, [])

  useEffect(() => {
    if (!actions.dirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [actions.dirty])
}
