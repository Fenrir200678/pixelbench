import type { Tool } from '../types/editor.js'

export const brushLimits = { min: 1, max: 512 }

export const clearVariantsKey = 'Shift+D'
export const applyVariantKey = 'Enter'
// Plain V is taken by before/after.
export const toggleVariantsKey = 'Shift+V'

export const canvasKeys = {
  hand: 'G',
  frame: 'C',
  brush: 'B',
  maskBrush: 'M',
  eraser: 'E',
  smallerBrush: ',',
  largerBrush: '.',
  mask: 'H',
  clearMask: 'Shift+M',
  zoomOut: '-',
  zoomActual: '0',
  zoomIn: '+',
  fit: 'F',
  baseline: 'S',
  adjust: 'A'
} as const

export const exportKey = 'Shift+S'
export const newImageKey = 'Shift+N'
export const consoleKey = 'Shift+C'

export const tools = {
  create: {
    title: 'Bild erstellen',
    label: 'Erstellen',
    key: '1',
    glyph: 'create',
    prompt: 'Beschreibe das Bild, das entstehen soll …',
    profiles: [
      'krea2-t2i',
      'flux2-klein-9b-t2i',
      'zimage-turbo-t2i',
      'zimage-t2i',
      'moss-image-turbo-t2i',
      'moss-image-t2i',
      'qwen21-turbo-t2i',
      'qwen21-t2i',
      'sdxl-t2i'
    ]
  },
  edit: {
    title: 'Bild ändern',
    label: 'Ändern',
    key: '2',
    glyph: 'edit',
    prompt: 'Beschreibe die gewünschte Änderung …',
    profiles: ['qwen21', 'qwen21-turbo', 'flux2-klein', 'flux2-klein-9b-kv', 'krea2-edit', 'qwen21-turbo-fun']
  },
  inpaint: {
    title: 'Bereich ersetzen',
    label: 'Ersetzen',
    key: '3',
    glyph: 'mask',
    prompt: 'Was soll im markierten Bereich erscheinen?',
    profiles: [
      'sdxl-inpaint',
      'flux-fill',
      'krea2-inpaint',
      'krea2-lanpaint',
      'flux2-klein-9b-inpaint',
      'moss-image-turbo-inpaint',
      'moss-image-turbo-lanpaint',
      'qwen21-turbo-fun'
    ]
  },
  outpaint: {
    title: 'Bild erweitern',
    label: 'Erweitern',
    key: '4',
    glyph: 'expand',
    prompt:
      'Wie soll sich das Bild im neuen Bereich fortsetzen? Oder leer lassen und „Prompt verbessern“ nutzen, um eine Beschreibung erzeugen zu lassen.',
    profiles: ['sdxl-inpaint', 'flux-fill', 'flux2-klein-9b-outpaint', 'qwen21-turbo-fun']
  },
  upscale: {
    // Extras: the generation data of the opened file (PNG Info) and the plain upscaler.
    title: 'Generierungsdaten ansehen und Bild hochskalieren',
    label: 'Extras',
    key: '5',
    glyph: 'upscale',
    prompt: '',
    // Only the plain upscaler. The hires fix lives in Erstellen.
    profiles: ['upscale']
  }
} as const

export const toolNames = Object.keys(tools) as Tool[]
