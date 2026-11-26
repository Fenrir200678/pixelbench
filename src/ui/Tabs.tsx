import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon.js'

// marked: a dot on the tab, for settings on a hidden tab that change the result. The text explains it.
type Tab<T extends string> = { value: T; label: string; title?: string; icon?: IconName; marked?: string }

/** Tabs inside a section. Arrow keys move between tabs. Only the active panel is rendered. */
export function Tabs<T extends string>({
  id,
  value,
  tabs,
  label,
  onChange,
  children
}: {
  id: string
  value: T
  tabs: Tab<T>[]
  label: string
  onChange: (value: T) => void
  children: ReactNode
}) {
  const list = useRef<HTMLDivElement>(null)

  function move(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = (index + step + tabs.length) % tabs.length
    onChange(tabs[next].value)
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div className="tabs">
      <div ref={list} className="tab-list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.value}
            id={id + '-tab-' + tab.value}
            type="button"
            role="tab"
            aria-selected={tab.value === value}
            aria-controls={id + '-panel'}
            tabIndex={tab.value === value ? 0 : -1}
            title={tab.marked ?? tab.title}
            aria-description={tab.marked}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {tab.icon && <Icon name={tab.icon} />}
            {tab.label}
            {tab.marked && <span className="tab-mark" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div id={id + '-panel'} className="tab-panel" role="tabpanel" aria-labelledby={id + '-tab-' + value}>
        {children}
      </div>
    </div>
  )
}
