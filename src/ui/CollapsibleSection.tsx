import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon.js'
import { registerSection, setSectionOpen, useSectionOpen } from './sectionState.js'

export function CollapsibleSection({
  id,
  title,
  summary,
  hidden,
  defaultOpen = true,
  children
}: {
  id: string
  title: string
  /** Short state shown next to the title while the section is collapsed. */
  summary?: ReactNode
  hidden?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const open = useSectionOpen(id, defaultOpen)
  useEffect(() => registerSection(id, defaultOpen), [id, defaultOpen])
  return (
    <details
      id={id}
      className="section collapsible-section"
      hidden={hidden}
      open={open}
      onToggle={(event) => setSectionOpen(id, event.currentTarget.open, defaultOpen)}
    >
      <summary>
        <h2>{title}</h2>
        {summary && !open && (
          <span className="section-summary" title={typeof summary === 'string' ? summary : undefined}>
            {summary}
          </span>
        )}
        <Icon name="chevron" />
      </summary>
      <div className="section-content">{children}</div>
    </details>
  )
}
