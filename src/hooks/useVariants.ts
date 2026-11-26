import { useReducer } from 'react'
import type { Variant } from '../editor/generation.js'

const variantBudget = 1024 * 1024 * 1024
const initial = { items: [] as Variant[], index: -1, compare: false }
type Action =
  { type: 'add'; variant: Variant } | { type: 'select'; index: number } | { type: 'compare' | 'remove' | 'clear' }

function reducer(state: typeof initial, action: Action): typeof initial {
  const { items, index, compare } = state
  switch (action.type) {
    case 'add': {
      // Soft budget: drop the oldest variants once the pixel data exceeds 1 GB. The new variant always stays.
      const next = [...items, action.variant]
      const bytes = () => next.reduce((n, variant) => n + variant.frame.pixels.byteLength, 0)
      while (next.length > 1 && bytes() > variantBudget) next.shift()
      return { items: next, index: next.length - 1, compare: false }
    }
    case 'select':
      return { ...state, index: action.index, compare: action.index >= 0 && compare }
    case 'compare':
      return index >= 0 ? { ...state, compare: !compare } : state
    case 'remove': {
      if (index < 0) return state
      const remaining = items.filter((_, i) => i !== index)
      return { items: remaining, index: Math.min(index, remaining.length - 1), compare: false }
    }
    case 'clear':
      return initial
  }
}

export function useVariants() {
  const [state, dispatch] = useReducer(reducer, initial)
  return {
    ...state,
    selected: state.items[state.index],
    dispatch,
    deselect: () => dispatch({ type: 'select', index: -1 })
  }
}
