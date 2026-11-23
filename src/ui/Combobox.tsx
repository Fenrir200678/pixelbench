import { useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export type ComboboxOption = {
  value: string
  label?: string
  group?: string
  disabled?: boolean
}

type Props = {
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  id?: string
  className?: string
  disabled?: boolean
  placeholder?: string
  title?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'data-model'?: string
}

const labelOf = (option: ComboboxOption) => option.label ?? option.value

/** Text input combined with a listbox: typing narrows the list to matching options. */
export function Combobox({ value, options, onChange, className, disabled, placeholder, ...rest }: Props) {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState<string>()
  const [active, setActive] = useState(0)
  const open = query !== undefined
  const current = options.find((option) => option.value === value)
  const matches = useMemo(() => {
    const needle = (query ?? '').trim().toLowerCase()
    const words = needle.split(/\s+/).filter(Boolean)
    return options.filter((option) => {
      const text = labelOf(option).toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [options, query])
  const selected = Math.min(active, Math.max(matches.length - 1, 0))

  function show() {
    if (disabled || open) return
    setQuery('')
    const index = options.findIndex((option) => option.value === value)
    setActive(Math.max(index, 0))
  }

  function close() {
    setQuery(undefined)
  }

  function choose(option: ComboboxOption | undefined) {
    if (option && !option.disabled) {
      if (option.value !== value) onChange(option.value)
      input.current?.blur()
    }
    close()
  }

  function move(delta: number) {
    if (!matches.length) return
    let next = selected
    for (let i = 0; i < matches.length; i++) {
      next = (next + delta + matches.length) % matches.length
      if (!matches[next].disabled) break
    }
    setActive(next)
    list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        show()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(matches[selected])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') close()
  }

  return (
    <div className={'combobox' + (className ? ' ' + className : '')}>
      <input
        {...rest}
        ref={input}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length ? `${listId}-${selected}` : undefined}
        disabled={disabled}
        placeholder={placeholder}
        title={rest.title ?? (current ? labelOf(current) : undefined)}
        data-value={value}
        value={open ? query : current ? labelOf(current) : ''}
        onFocus={(event) => {
          show()
          event.currentTarget.select()
        }}
        onClick={show}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={keyDown}
        onBlur={close}
      />
      {open && (
        <div ref={list} id={listId} className="combobox-list" role="listbox">
          {matches.length === 0 && <div className="combobox-empty">—</div>}
          {matches.map((option, index) => {
            const header = option.group !== matches[index - 1]?.group ? option.group : undefined
            return (
              <div key={option.value + index}>
                {header && <div className="combobox-group">{header}</div>}
                <div
                  id={`${listId}-${index}`}
                  data-index={index}
                  data-value={option.value}
                  role="option"
                  className="combobox-option"
                  aria-selected={index === selected}
                  aria-disabled={option.disabled || undefined}
                  data-current={option.value === value || undefined}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    choose(option)
                  }}
                  onMouseEnter={() => !option.disabled && setActive(index)}
                >
                  {labelOf(option)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
