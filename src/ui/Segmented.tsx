import { useRef, type KeyboardEvent } from 'react'

type Option<T extends string> = { value: T; label: string; title?: string }

/** A radio group drawn as one row of buttons, for two to four short choices. Arrow keys move the choice. */
export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  labelledBy,
  describedBy
}: {
  id?: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  labelledBy?: string
  describedBy?: string
}) {
  const group = useRef<HTMLDivElement>(null)

  function move(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div
      ref={group}
      id={id}
      className="segmented"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
