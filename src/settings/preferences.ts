import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from '../helpers/storage.js'
import type { ExportFormat } from '../image/files.js'

/** Browser-side preferences. The ComfyUI setup lives on the server instead (see /api/config). */
export type Preferences = {
  exportFormat: ExportFormat
  // Prompt and settings in exported PNGs, as Forge and ComfyUI write them. Off keeps shared images clean.
  exportMetadata: boolean
  jpgQuality: number
  // Export file name with tokens such as {name} or {seed}, see fileName.ts.
  fileName: string
  continueInEdit: boolean
  // Prompts of every mode stay when another image is opened, for a series with the same edit.
  keepPrompts: boolean
  confirmDiscard: boolean
  notifyDone: boolean
  soundDone: boolean
  consoleOnError: boolean
}

export const defaultFileName = '{name}-edit'
export const jpgQualityRange = { min: 60, max: 100 }

const defaults: Preferences = {
  exportFormat: 'png',
  exportMetadata: true,
  jpgQuality: 95,
  fileName: defaultFileName,
  continueInEdit: true,
  keepPrompts: true,
  confirmDiscard: true,
  notifyDone: false,
  soundDone: false,
  consoleOnError: false
}

// Earlier releases stored some of these under their own keys. They stay, so existing choices carry over.
const keys: Record<keyof Preferences, string> = {
  exportFormat: 'pixelbench-export-format',
  exportMetadata: 'pixelbench-export-metadata',
  jpgQuality: 'pixelbench-jpg-quality',
  fileName: 'pixelbench-file-name',
  continueInEdit: 'pixelbench-continue-in-edit',
  keepPrompts: 'pixelbench-keep-prompts',
  confirmDiscard: 'pixelbench-confirm-discard',
  notifyDone: 'pixelbench-notify-done',
  soundDone: 'pixelbench-sound-done',
  consoleOnError: 'pixelbench-console-on-error'
}

function sanitize<K extends keyof Preferences>(key: K, value: unknown): Preferences[K] {
  const fallback = defaults[key]
  if (key === 'exportFormat') return (value === 'jpg' ? 'jpg' : 'png') as Preferences[K]
  if (key === 'jpgQuality') {
    const number = Math.round(Number(value))
    return (
      Number.isFinite(number) ? Math.min(jpgQualityRange.max, Math.max(jpgQualityRange.min, number)) : fallback
    ) as Preferences[K]
  }
  if (key === 'fileName')
    return (typeof value === 'string' && value.trim() ? value.slice(0, 200) : fallback) as Preferences[K]
  return (typeof value === typeof fallback ? value : fallback) as Preferences[K]
}

function load(): Preferences {
  const entries = (Object.keys(defaults) as (keyof Preferences)[]).map((key) => [
    key,
    sanitize(key, readStorage(keys[key], defaults[key]))
  ])
  return Object.fromEntries(entries) as Preferences
}

let current = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const getPreferences = () => current

/** Stores one preference. False when the browser refused to save it; it still applies for this session. */
export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  current = { ...current, [key]: sanitize(key, value) }
  listeners.forEach((listener) => listener())
  return writeStorage(keys[key], current[key])
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, getPreferences)
}

/** Asks before something is discarded, unless the user turned these questions off. */
export function confirmDiscard(message: string) {
  return !current.confirmDiscard || window.confirm(message)
}

const layoutKey = (key: string) => key.startsWith('react-resizable-panels') || /^pixelbench-section-/.test(key)
const localKey = (key: string) => layoutKey(key) || (/^pixelbench-/.test(key) && !/-language$/.test(key))

function removeKeys(match: (key: string) => boolean) {
  try {
    const found = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '')
    found.filter(match).forEach((key) => localStorage.removeItem(key))
  } catch {
    // Nothing is stored when the browser blocks storage.
  }
}

/** Panel sizes and open sections. The page reloads so every panel picks up its default. */
export function resetLayout() {
  removeKeys(layoutKey)
  window.location.reload()
}

/** Everything this app keeps in the browser except the language: preferences, model choices, layout. */
export function resetAllPreferences() {
  removeKeys(localKey)
  window.location.reload()
}
