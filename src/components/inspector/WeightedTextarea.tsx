import { useMemo, useRef, type CSSProperties, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from 'react'
import { adjustWeight, weightTokens, type WeightEdit } from '../../editor/promptWeights.js'

export type WeightMode = 'on' | 'off'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  ref?: Ref<HTMLTextAreaElement>
  value: string
  onChange: (value: string, input: HTMLTextAreaElement) => void
  /** off: the model ignores weights, the syntax is shown dimmed. */
  mode: WeightMode
  /** Allowed weight range for Ctrl+Up/Down. */
  range: [number, number]
}

// Highlight strength: 0 at weight 1, full at a distance of 1 or more.
const strengthOf = (weight: number) => Math.min(1, Math.abs(weight - 1)).toFixed(2)

/** A textarea with highlighted prompt weights behind the text and Forge's Ctrl+Up/Down to change them. */
export function WeightedTextarea({ ref, value, onChange, mode, range, onKeyDown, onScroll, ...props }: Props) {
  const mirror = useRef<HTMLDivElement>(null)
  const tokens = useMemo(() => weightTokens(value), [value])

  function apply(input: HTMLTextAreaElement, edit: WeightEdit) {
    // insertText keeps the browser's own undo history. It fires an input event, so onChange runs as for typing.
    let prefix = 0
    while (prefix < value.length && value[prefix] === edit.text[prefix]) prefix++
    let suffix = 0
    while (
      suffix < value.length - prefix &&
      suffix < edit.text.length - prefix &&
      value.at(-1 - suffix) === edit.text.at(-1 - suffix)
    )
      suffix++
    input.setSelectionRange(prefix, value.length - suffix)
    const inserted = edit.text.slice(prefix, edit.text.length - suffix)
    if (!document.execCommand('insertText', false, inserted) || input.value !== edit.text) onChange(edit.text, input)
    input.setSelectionRange(edit.start, edit.end)
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event)
    const arrow = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    if (event.defaultPrevented || !arrow || !(event.ctrlKey || event.metaKey) || event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    const input = event.currentTarget
    // Shift for fine steps.
    const step = event.shiftKey ? 0.05 : 0.1
    const edit = adjustWeight(value, input.selectionStart, input.selectionEnd, arrow * step, range)
    if (edit && edit.text !== value) apply(input, edit)
  }

  return (
    <div className="weighted-field" data-weights={mode}>
      <div ref={mirror} className="weight-mirror" aria-hidden="true">
        {tokens.map((token, i) => {
          if (token.kind === 'text' && token.weight === 1) return token.text
          const style = { '--weight-strength': strengthOf(token.weight) } as CSSProperties
          return (
            <span
              key={i}
              className={token.kind === 'text' ? 'weight-text' : 'weight-syntax'}
              data-direction={token.weight > 1 ? 'up' : 'down'}
              style={style}
            >
              {token.text}
            </span>
          )
        })}
        {/* Keeps the height of a trailing empty line. */}
        {value.endsWith('\n') && ' '}
      </div>
      <textarea
        {...props}
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value, event.currentTarget)}
        onKeyDown={keyDown}
        onScroll={(event) => {
          if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop
          onScroll?.(event)
        }}
      />
    </div>
  )
}
