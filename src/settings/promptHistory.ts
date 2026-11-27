import { useEffect, useSyncExternalStore } from 'react'
import { api } from '../api/client.js'
import type { Tool } from '../types/editor.js'

export type PromptEntry = { id: string; prompt: string; negative: string; tool: Tool; at: string }
export type PromptHistory = { enabled: boolean; limit: number; entries: PromptEntry[] }

export const promptHistoryLimitRange = { min: 1, max: 500 }

const endpoint = '/api/prompt-history'
let current: PromptHistory | undefined
let loading: Promise<void> | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function apply(next: PromptHistory) {
  current = next
  listeners.forEach((listener) => listener())
  return next
}

/** Reads the history from the server once; later changes come back with every write. */
export function loadPromptHistory() {
  loading ??= api<PromptHistory>(endpoint)
    .then(apply)
    .then(() => undefined)
    .catch(() => {
      loading = undefined
    })
  return loading
}

const change = async (action: string, data: unknown = {}) =>
  apply(await api<PromptHistory>(endpoint + '/' + action, data))

/** Stores a submitted prompt. A failed write never stops the generation that triggered it. */
export function recordPrompt(prompt: string, negative: string, tool: Tool) {
  if (current?.enabled === false || !prompt.trim()) return
  change('record', { prompt, negative, tool }).catch(() => {})
}

export const removePrompt = (id: string) => change('remove', { id })
export const restorePrompt = (entry: PromptEntry, index: number) => change('restore', { entry, index })
export const clearPromptHistory = () => change('clear')
export const setPromptHistorySettings = (settings: Partial<Pick<PromptHistory, 'enabled' | 'limit'>>) =>
  change('settings', settings)

/** The history, or undefined until the server answered. */
export function usePromptHistory() {
  useEffect(() => void loadPromptHistory(), [])
  return useSyncExternalStore(subscribe, () => current)
}
