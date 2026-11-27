import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { tools } from '../../editor/tools.js'
import { messageOf } from '../../helpers/async.js'
import { useFormatTime } from '../../helpers/time.js'
import { removePrompt, restorePrompt, usePromptHistory, type PromptEntry } from '../../settings/promptHistory.js'
import type { Notice } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'
import { Icon } from '../../ui/Icon.js'

// Above this many entries, a search field helps more than scrolling.
const searchFrom = 15
// Space between the panel and the inspector, and to the window edges.
const gap = 6

/** Docks the panel to the left edge of the inspector, level with the prompt section. */
function dock(button: HTMLElement): CSSProperties {
  const inspector = button.closest('.inspector')?.getBoundingClientRect()
  const anchor = (button.closest('#prompt-settings') ?? button).getBoundingClientRect()
  const right = window.innerWidth - (inspector?.left ?? anchor.left) + gap
  const top = Math.max(gap, Math.min(anchor.top, window.innerHeight - 240))
  return { top, right, maxHeight: window.innerHeight - top - gap * 2 }
}

/** Submitted prompts, newest first. A click puts one back into the prompt field. */
export function PromptHistory({ onApply, notice }: { onApply: (entry: PromptEntry) => void; notice: Notice }) {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const history = usePromptHistory()
  const [position, setPosition] = useState<CSSProperties>()
  const [query, setQuery] = useState('')
  // The last deleted entry, until the panel closes or the next one is deleted.
  const [removed, setRemoved] = useState<{ entry: PromptEntry; index: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const open = position !== undefined

  function close(focus = false) {
    setPosition(undefined)
    setQuery('')
    setRemoved(undefined)
    if (focus) button.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = () => button.current && setPosition(dock(button.current))
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Focus moves into the panel without marking an entry; Tab reaches the search field or the first entry.
    const start = panel.current?.querySelector<HTMLElement>('#prompt-history-search') ?? panel.current
    start?.focus()
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])

  if (!history?.enabled) return null
  const entries = history.entries

  async function remove(entry: PromptEntry) {
    const index = entries.indexOf(entry)
    try {
      await removePrompt(entry.id)
      setRemoved({ entry, index })
    } catch (error) {
      notice(messageOf(error))
    }
  }

  async function undo() {
    if (!removed) return
    try {
      await restorePrompt(removed.entry, removed.index)
      setRemoved(undefined)
    } catch (error) {
      notice(messageOf(error))
    }
  }

  const search = query.trim().toLowerCase()
  const shown = search
    ? entries.filter((entry) => (entry.prompt + '\n' + entry.negative).toLowerCase().includes(search))
    : entries
  // Without a search, the undo row stays where the entry was.
  const undoAt = removed ? (search ? 0 : Math.min(removed.index, shown.length)) : -1

  const undoRow = removed && (
    <li key="removed" className="prompt-history-removed" role="status">
      <span>{t('Prompt gelöscht.')}</span>
      <Button id="prompt-history-undo" className="quiet compact" icon="undo" onClick={() => void undo()}>
        {t('Rückgängig')}
      </Button>
    </li>
  )

  return (
    <>
      <Button
        ref={button}
        id="prompt-history-button"
        className="quiet compact"
        icon="restore-session"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('Prompt-Verlauf')}
        onClick={() => (open ? close() : button.current && setPosition(dock(button.current)))}
      >
        {t('Verlauf')}
      </Button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="prompt-history-panel"
            role="dialog"
            tabIndex={-1}
            aria-labelledby="prompt-history-title"
            style={position}
          >
            <header>
              <h2 id="prompt-history-title">{t('Prompt-Verlauf')}</h2>
              <span className="prompt-history-count">{entries.length}</span>
              <Button
                className="quiet compact icon"
                icon="close"
                aria-label={t('Schließen')}
                onClick={() => close(true)}
              />
            </header>
            {entries.length >= searchFrom && (
              <div className="prompt-history-search">
                <input
                  id="prompt-history-search"
                  type="search"
                  placeholder={t('Verlauf durchsuchen')}
                  aria-label={t('Verlauf durchsuchen')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}
            <ul>
              {shown.map((entry, index) => (
                <HistoryEntry
                  key={entry.id}
                  before={index === undoAt ? undoRow : undefined}
                  entry={entry}
                  time={formatTime(entry.at, { date: true })}
                  onApply={() => {
                    close()
                    onApply(entry)
                  }}
                  onRemove={() => void remove(entry)}
                />
              ))}
              {undoAt === shown.length && undoRow}
            </ul>
            {!shown.length && !removed && (
              <p className="prompt-history-empty">
                {t(
                  search
                    ? 'Kein passender Prompt.'
                    : 'Noch keine Prompts. Jede Generierung speichert ihren Prompt hier.'
                )}
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

function HistoryEntry({
  entry,
  time,
  before,
  onApply,
  onRemove
}: {
  entry: PromptEntry
  time: string
  before?: ReactNode
  onApply: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const tool = tools[entry.tool]
  return (
    <>
      {before}
      <li className="prompt-history-entry">
        <button type="button" className="prompt-history-apply" title={entry.prompt} onClick={onApply}>
          <span className="prompt-history-text">{entry.prompt}</span>
          {entry.negative && (
            <span className="prompt-history-negative">
              <em>{t('Negativ')}</em> {entry.negative}
            </span>
          )}
          <span className="prompt-history-meta">
            <span className="prompt-history-tool">
              <Icon name={tool.glyph} />
              {t(tool.label)}
            </span>
            <time dateTime={entry.at}>{time}</time>
          </span>
        </button>
        <Button
          className="quiet compact icon prompt-history-remove"
          icon="close"
          aria-label={t('Prompt aus dem Verlauf löschen')}
          title={t('Prompt aus dem Verlauf löschen')}
          onClick={onRemove}
        />
      </li>
    </>
  )
}
