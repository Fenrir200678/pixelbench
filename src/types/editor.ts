import type { Frame, Margins, Rect, Stroke } from './image.js'

export type Tool = 'create' | 'edit' | 'inpaint' | 'outpaint' | 'upscale'
export type Work = { image: Frame; start: Frame; strokes: Stroke[]; drawing?: Stroke[]; margins: Margins; crop?: Rect }
export type NoticeValues = Record<string, string | number>
export type Notice = (message?: string, good?: boolean, values?: NoticeValues) => void
