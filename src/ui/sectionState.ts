import { useSyncExternalStore } from 'react'
import { readStorage, writeStorage } from '../helpers/storage.js'

// Open/closed state of every collapsible section. Shared so one button can collapse or expand them all.
const storageKey = (id: string) => 'pixelbench-section-' + id
const state = new Map<string, boolean>()
const mounted = new Map<string, boolean>()
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function isOpen(id: string, fallback: boolean) {
  if (!state.has(id)) state.set(id, readStorage(storageKey(id), fallback))
  return state.get(id) as boolean
}

export function setSectionOpen(id: string, open: boolean, fallback = true) {
  if (isOpen(id, fallback) === open) return
  state.set(id, open)
  writeStorage(storageKey(id), open)
  emit()
}

export function useSectionOpen(id: string, fallback: boolean) {
  return useSyncExternalStore(subscribe, () => isOpen(id, fallback))
}

/** Registers a mounted section so the collapse-all control knows about it. */
export function registerSection(id: string, fallback: boolean) {
  mounted.set(id, fallback)
  emit()
  return () => {
    mounted.delete(id)
    emit()
  }
}

/** True while at least one mounted section is open. */
export function useAnySectionOpen() {
  return useSyncExternalStore(subscribe, () => [...mounted].some(([id, fallback]) => isOpen(id, fallback)))
}

export function setAllSections(open: boolean) {
  for (const [id, fallback] of mounted) setSectionOpen(id, open, fallback)
}
