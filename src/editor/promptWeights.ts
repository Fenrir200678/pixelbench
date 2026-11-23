// Prompt weights in ComfyUI syntax: (text:1.3) sets a weight, (text) means 1.1, nesting multiplies,
// \( and \) are literal brackets. Mirrors ComfyUI's token_weights in comfy/sd1_clip.py.

/** One run of the prompt. kind: plain text, a bracket, or the ":1.3" part of a group. */
export type WeightToken = { kind: 'text' | 'bracket' | 'weight'; text: string; weight: number }

/** A bracketed group. inner: the text range without brackets and weight, open/close: bracket positions. */
type Group = { open: number; close: number; inner: [number, number]; weight?: number }

const step = (value: number) => Number(value.toFixed(2))
const escaped = (text: string, i: number) => text[i] === '\\' && (text[i + 1] === '(' || text[i + 1] === ')')

function matching(text: string, open: number, end: number) {
  let depth = 0
  for (let i = open; i < end; i++) {
    if (escaped(text, i)) i++
    else if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

// ComfyUI reads the weight after the last colon of the group and falls back to 1.1 when it is not a number.
function groupAt(text: string, open: number, close: number): Group {
  const colon = text.lastIndexOf(':', close)
  const raw = colon > open + 1 ? text.slice(colon + 1, close).trim() : ''
  const weight = raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined
  return { open, close, inner: [open + 1, weight === undefined ? close : colon], weight }
}

function groups(text: string) {
  const out: Group[] = []
  const walk = (start: number, end: number) => {
    for (let i = start; i < end; i++) {
      if (escaped(text, i)) i++
      else if (text[i] === '(') {
        const close = matching(text, i, end)
        if (close < 0) continue
        const group = groupAt(text, i, close)
        out.push(group)
        walk(group.inner[0], group.inner[1])
        i = close
      }
    }
  }
  walk(0, text.length)
  return out
}

/** Splits the prompt into tokens with their effective weight, for highlighting. Unmatched brackets stay text. */
export function weightTokens(text: string): WeightToken[] {
  const tokens: WeightToken[] = []
  const push = (kind: WeightToken['kind'], value: string, weight: number) => {
    const last = tokens.at(-1)
    if (last && last.kind === kind && kind === 'text' && last.weight === weight) last.text += value
    else if (value) tokens.push({ kind, text: value, weight })
  }
  const walk = (start: number, end: number, current: number) => {
    let i = start
    while (i < end) {
      const close = text[i] === '(' ? matching(text, i, end) : -1
      if (close < 0) {
        const next = escaped(text, i) ? 2 : 1
        push('text', text.slice(i, i + next), current)
        i += next
        continue
      }
      const group = groupAt(text, i, close)
      const weight = step(current * (group.weight ?? 1.1))
      push('bracket', '(', weight)
      walk(group.inner[0], group.inner[1], weight)
      push('weight', text.slice(group.inner[1], close), weight)
      push('bracket', ')', weight)
      i = close + 1
    }
  }
  walk(0, text.length, 1)
  return tokens
}

/** True when the prompt contains at least one weighted group. */
export function hasWeights(text: string) {
  return weightTokens(text).some((token) => token.kind === 'bracket')
}

/** Removes the weight syntax and keeps the text, as the server does for encoders without weights. */
export function stripWeights(text: string) {
  return weightTokens(text)
    .filter((token) => token.kind === 'text')
    .map((token) => token.text.replace(/\\([()])/g, '$1'))
    .join('')
}

const wordChar = /[\p{L}\p{N}_'-]/u

export type WeightEdit = { text: string; start: number; end: number }

/**
 * Raises or lowers the weight like Forge's Ctrl+Up/Down. Adjusts the innermost group around the selection when the
 * selection is empty or covers the group's text, otherwise wraps the selection or the word at the cursor.
 * Weight 1 removes the brackets. Returns the new text and the new selection, or undefined when nothing applies.
 */
export function adjustWeight(
  text: string,
  start: number,
  end: number,
  delta: number,
  [min, max]: [number, number] = [0, 2]
): WeightEdit | undefined {
  const clamp = (value: number) => step(Math.min(max, Math.max(min, value)))
  const trimmed = trimRange(text, start, end)
  const group = groups(text)
    .filter((g) => g.inner[0] <= trimmed[0] && trimmed[1] <= g.inner[1])
    .at(-1)
  const covers = group && (start === end || (trimmed[0] === group.inner[0] && trimmed[1] === group.inner[1]))
  if (group && covers) {
    const weight = clamp((group.weight ?? 1.1) + delta)
    const inner = text.slice(...group.inner)
    return replace(text, group.open, group.close + 1, inner, weight)
  }
  const [from, to] = start === end ? wordAt(text, start) : trimmed
  if (from === to) return undefined
  return replace(text, from, to, text.slice(from, to), clamp(1 + delta))
}

function replace(text: string, from: number, to: number, inner: string, weight: number): WeightEdit {
  const wrapped = weight === 1 ? inner : `(${inner}:${weight})`
  const start = from + (weight === 1 ? 0 : 1)
  return { text: text.slice(0, from) + wrapped + text.slice(to), start, end: start + inner.length }
}

function trimRange(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  return [start, end]
}

function wordAt(text: string, cursor: number): [number, number] {
  let from = cursor
  let to = cursor
  while (from > 0 && wordChar.test(text[from - 1])) from--
  while (to < text.length && wordChar.test(text[to])) to++
  return [from, to]
}

/**
 * Converts Forge's de-emphasis [text] (divide by 1.1 per bracket) into ComfyUI syntax. Prompt editing like
 * [a:b:0.5] or alternation [a|b] stays as it is.
 */
export function forgeBrackets(text: string) {
  return text.replace(/(?<!\\)(\[+)([^[\]:|]+)(\]+)/g, (match, open: string, inner: string, close: string) => {
    if (open.length !== close.length) return match
    return `(${inner}:${step(1 / 1.1 ** open.length)})`
  })
}
