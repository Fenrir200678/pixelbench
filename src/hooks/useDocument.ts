import { useTranslation } from 'react-i18next'
import { useMemo, useReducer, useRef, useState, type RefObject } from 'react'
import { emptyMargins, sizeLabel, suggestExpansion } from '../editor/geometry.js'
import { messageOf } from '../helpers/async.js'
import { exportImage, importImage } from '../image/files.js'
import { generationOf } from '../editor/frameInfo.js'
import { exportFileName } from '../settings/fileName.js'
import { confirmDiscard, usePreferences } from '../settings/preferences.js'
import { exportText, withMetadata } from '../metadata/export.js'
import { readMetadata, type GenerationInfo } from '../metadata/index.js'
import { Drawing, Mask } from '../image/mask.js'
import { expandedRect } from '../image/pixels.js'
import type { Notice, Tool, Work } from '../types/editor.js'
import type { Frame, Margins, Rect, Stroke } from '../types/image.js'

type DocumentState = {
  work?: Work
  original?: Frame
  saved?: Frame
  fileName: string
  // Generation data of the opened file, such as Forge parameters or a ComfyUI graph.
  info?: GenerationInfo
  // True when the document was created from a variant and not opened from a file.
  created?: boolean
  mask?: Mask
  drawing?: Drawing
  past: Work[]
  future: Work[]
}
const initial: DocumentState = { past: [], future: [], fileName: '' }
export type SessionDocument = Omit<DocumentState, 'past' | 'future' | 'mask' | 'drawing'>
type Change =
  | { type: 'open'; work: Work; mask: Mask; fileName: string; saved?: boolean; info?: GenerationInfo }
  | { type: 'commit'; work: Work; mask: Mask; drawing?: Drawing }
  | { type: 'margins'; margins: Margins }
  | { type: 'crop'; crop?: Rect }
  | { type: 'undo' | 'redo'; mask: Mask; drawing?: Drawing }
  | { type: 'saved'; image: Frame }
  | { type: 'restore'; document: DocumentState }
  | { type: 'close' }

function reducer(state: DocumentState, change: Change): DocumentState {
  switch (change.type) {
    case 'open':
      return {
        ...initial,
        work: change.work,
        original: change.work.image,
        saved: change.saved === false ? undefined : change.work.image,
        mask: change.mask,
        fileName: change.fileName,
        info: change.info,
        created: change.saved === false
      }
    case 'commit': {
      if (!state.work) return state
      const past = [...state.past, state.work]
      const bytes = () =>
        [...new Set(past.map((item) => item.image))].reduce((n, image) => n + image.pixels.byteLength, 0)
      while (past.length > 1 && bytes() > 512 * 1024 * 1024) past.shift()
      return { ...state, work: change.work, mask: change.mask, drawing: change.drawing, past, future: [] }
    }
    case 'margins': {
      if (!state.work) return state
      const work = { ...state.work, margins: change.margins }
      return { ...state, work, drawing: drawingFor(work, state.drawing) }
    }
    case 'crop':
      return state.work ? { ...state, work: { ...state.work, crop: change.crop } } : state
    case 'undo': {
      const work = state.past.at(-1)
      if (!work || !state.work) return state
      return {
        ...state,
        work,
        mask: change.mask,
        drawing: change.drawing,
        past: state.past.slice(0, -1),
        future: [...state.future, state.work]
      }
    }
    case 'redo': {
      const work = state.future.at(-1)
      if (!work || !state.work) return state
      return {
        ...state,
        work,
        mask: change.mask,
        drawing: change.drawing,
        past: [...state.past, state.work],
        future: state.future.slice(0, -1)
      }
    }
    case 'saved':
      return state.work?.image === change.image ? { ...state, saved: change.image } : state
    case 'restore':
      return change.document
    case 'close':
      return initial
  }
}

const maskFor = ({ image, strokes }: Work) => new Mask(image.w, image.h, strokes)

function drawingFor(work: Work, existing?: Drawing) {
  if (!work.drawing) return
  const { w, h } = work.image
  const area = expandedRect({ x: 0, y: 0, w, h }, work.margins)
  if (
    existing &&
    area.x === existing.area.x &&
    area.y === existing.area.y &&
    area.w === existing.w &&
    area.h === existing.h
  )
    return existing
  return new Drawing(area, work.drawing)
}
export function useDocument(notice: Notice, activeTool: RefObject<Tool>) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(reducer, initial)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const preferences = usePreferences()
  const { exportFormat, exportMetadata } = preferences
  const importVersion = useRef(0)
  const exportPending = useRef(false)
  const { work, original, saved, fileName, info, mask, drawing, created } = state
  const sessionState = useMemo(
    () => ({ work, original, saved, fileName, info, created }),
    [work, original, saved, fileName, info, created]
  )
  const dirty = Boolean(work && work.image !== saved && (work.image !== original || !saved))

  async function open(file: File, onOpen: (previous: boolean, importTool: Tool) => void): Promise<boolean> {
    if (dirty && !confirmDiscard(t('Übernommene Änderungen wurden noch nicht exportiert. Bearbeitung verwerfen?')))
      return false
    const version = ++importVersion.current
    setImporting(true)
    try {
      // Metadata is optional. A file it cannot read still opens.
      const [frame, metadata] = await Promise.all([importImage(file), readMetadata(file).catch(() => undefined)])
      if (version !== importVersion.current) return false
      const importTool = activeTool.current
      const next = {
        image: frame,
        start: frame,
        strokes: [],
        margins: importTool === 'outpaint' ? suggestExpansion(frame) : emptyMargins()
      }
      dispatch({ type: 'open', work: next, fileName: file.name, mask: maskFor(next), info: metadata })
      onOpen(Boolean(work), importTool)
      notice()
      return true
    } catch (error) {
      if (version === importVersion.current) notice(messageOf(error))
      return false
    } finally {
      if (version === importVersion.current) setImporting(false)
    }
  }

  async function download() {
    const frame = work?.image
    if (!frame || exportPending.current) return
    exportPending.current = true
    setExporting(true)
    try {
      const image = await exportImage(frame, exportFormat, preferences.jpgQuality / 100)
      const blob =
        exportFormat === 'png' && exportMetadata ? await withMetadata(image, exportText(frame, original, info)) : image
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download =
        exportFileName(preferences.fileName, {
          name: fileName,
          width: frame.w,
          height: frame.h,
          record: generationOf(frame)
        }) +
        '.' +
        exportFormat
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      dispatch({ type: 'saved', image: frame })
      notice('{{format}}-Export gestartet · {{size}} px', true, {
        format: exportFormat.toUpperCase(),
        size: sizeLabel(frame.w, frame.h)
      })
    } catch (error) {
      notice(messageOf(error))
    } finally {
      exportPending.current = false
      setExporting(false)
    }
  }

  // Turns a created image into the document. An open document stays in the undo history.
  // strokes: an initial mask, such as the detailer segmentation.
  function adopt(frame: Frame, strokes: Stroke[] = []) {
    const next = { image: frame, start: frame, strokes, margins: emptyMargins() }
    if (work) {
      dispatch({ type: 'commit', work: next, mask: maskFor(next) })
      return
    }
    importVersion.current++
    dispatch({ type: 'open', work: next, mask: maskFor(next), fileName: 'pixelbench.png', saved: false })
  }

  // Closes the document for a new image. Returns false when the user keeps unexported changes.
  // confirmed: the caller already asked the user.
  function close(confirmed = false) {
    if (
      !confirmed &&
      dirty &&
      !confirmDiscard(t('Übernommene Änderungen wurden noch nicht exportiert. Bearbeitung verwerfen?'))
    )
      return false
    importVersion.current++
    setImporting(false)
    dispatch({ type: 'close' })
    return true
  }

  function travel(direction: 'undo' | 'redo') {
    const next = (direction === 'undo' ? state.past : state.future).at(-1)
    if (!next) return false
    dispatch({ type: direction, mask: maskFor(next), drawing: drawingFor(next) })
    return true
  }

  return {
    sessionState,
    prepareRestore(next: SessionDocument) {
      const restored = {
        ...initial,
        ...next,
        mask: next.work && maskFor(next.work),
        drawing: next.work && drawingFor(next.work)
      }
      return () => {
        importVersion.current++
        setImporting(false)
        dispatch({ type: 'restore', document: restored })
      }
    },
    work,
    original,
    mask,
    drawing,
    fileName,
    info,
    dirty,
    created: Boolean(state.created),
    importing,
    exporting,
    exportFormat,
    importVersion,
    open,
    close,
    adopt,
    download,
    travel,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit(next: Work, painted?: Mask | Drawing) {
      const nextMask = painted instanceof Mask ? painted : next.strokes === work?.strokes ? mask : undefined
      const nextDrawing = painted instanceof Drawing ? painted : next.drawing === work?.drawing ? drawing : undefined
      dispatch({ type: 'commit', work: next, mask: nextMask ?? maskFor(next), drawing: drawingFor(next, nextDrawing) })
    },
    setMargins(margins: Margins) {
      dispatch({ type: 'margins', margins })
    },
    setCrop(crop?: Rect) {
      dispatch({ type: 'crop', crop })
    }
  }
}
