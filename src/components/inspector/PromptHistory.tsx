import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { tools } from '../../editor/tools.js'
import { messageOf } from '../../helpers/async.js'
import { readStorage, writeStorage } from '../../helpers/storage.js'
import { useFormatTime } from '../../helpers/time.js'
import { removePrompt, restorePrompt, usePromptHistory, type PromptEntry } from '../../settings/promptHistory.js'
import type { Notice } from '../../types/editor.js'
import { Button } from '../../ui/Button.js'
import { Icon } from '../../ui/Icon.js'

// Filtering starts with the second character, so a single letter does not empty the list.
const minQuery = 2
const sortKey = 'pixelbench-prompt-history-sort'
type Sort = 'newest' | 'oldest'
// Space between the panel and the inspector, and to the window edges.
const gap = 6
const panelWidth = 400
const minWidth = 300

/** Docks the panel to the left edge of the inspector, level with the prompt section. */
function dock(button: HTMLElement): CSSProperties {
  const inspector = button.closest('.inspector')?.getBoundingClientRect()
  const anchor = (button.closest('#prompt-settings') ?? button).getBoundingClientRect()
  const edge = inspector?.left ?? anchor.left
  // As wide as the space next to the inspector allows; in a narrow window it overlaps the inspector instead.
  const width = Math.min(panelWidth, Math.max(minWidth, edge - gap * 2), window.innerWidth - gap * 2)
  const right = Math.min(window.innerWidth - edge + gap, window.innerWidth - width - gap)
  const top = Math.max(gap, Math.min(anchor.top, window.innerHeight - 240))
  return { top, right, width, maxHeight: window.innerHeight - top - gap * 2 }
}

/** Submitted prompts, newest first. A click puts one back into the prompt field. */
export function PromptHistory({ onApply, notice }: { onApply: (entry: PromptEntry) => void; notice: Notice }) {
  const { t } = useTranslation()
  const formatTime = useFormatTime()
  const history = usePromptHistory()
  const [position, setPosition] = useState<CSSProperties>()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>(() =>
    readStorage<unknown>(sortKey, 'newest') === 'oldest' ? 'oldest' : 'newest'
  )
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

  function toggleSort() {
    const next = sort === 'newest' ? 'oldest' : 'newest'
    setSort(next)
    writeStorage(sortKey, next)
  }

  const trimmed = query.trim()
  const search = trimmed.length >= minQuery ? trimmed.toLowerCase() : ''
  const ordered = sort === 'newest' ? entries : [...entries].reverse()
  const shown = search
    ? ordered.filter((entry) => (entry.prompt + '\n' + entry.negative).toLowerCase().includes(search))
    : ordered
  // Without a search, the undo row stays where the entry was, in either order.
  const undoAt = !removed
    ? -1
    : search
      ? 0
      : sort === 'newest'
        ? Math.min(removed.index, shown.length)
        : Math.max(0, shown.length - removed.index)

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
              <span className="prompt-history-count">
                {search ? t('{{shown}} von {{total}}', { shown: shown.length, total: entries.length }) : entries.length}
              </span>
              <Button
                id="prompt-history-sort"
                className="quiet compact icon"
                icon={sort === 'newest' ? 'sort-newest' : 'sort-oldest'}
                aria-label={t('Sortierung umkehren')}
                title={t(sort === 'newest' ? 'Neueste zuerst' : 'Älteste zuerst')}
                onClick={toggleSort}
              />
              <Button
                className="quiet compact icon"
                icon="close"
                aria-label={t('Schließen')}
                onClick={() => close(true)}
              />
            </header>
            {entries.length > 0 && (
              <div className="prompt-history-search">
                <Icon name="search" />
                <input
                  id="prompt-history-search"
                  type="search"
                  placeholder={t('Prompts durchsuchen')}
                  aria-label={t('Prompts durchsuchen')}
                  aria-controls="prompt-history-list"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}
            <ul id="prompt-history-list" data-searching={Boolean(search) || undefined}>
              {shown.map((entry, index) => (
                <HistoryEntry
                  key={entry.id}
                  before={index === undoAt ? undoRow : undefined}
                  entry={entry}
                  search={search}
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

/** Wraps every case-insensitive occurrence of the search term in <mark>. */
function Highlight({ text, search }: { text: string; search: string }) {
  if (!search) return text
  const parts: ReactNode[] = []
  const lower = text.toLowerCase()
  let from = 0
  for (let at = lower.indexOf(search); at !== -1; at = lower.indexOf(search, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at}>{text.slice(at, at + search.length)}</mark>)
    from = at + search.length
  }
  parts.push(text.slice(from))
  return parts
}

function HistoryEntry({
  entry,
  search,
  time,
  before,
  onApply,
  onRemove
}: {
  entry: PromptEntry
  search: string
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
          <span className="prompt-history-text">
            <Highlight text={entry.prompt} search={search} />
          </span>
          {entry.negative && (
            <span className="prompt-history-negative">
              <em>{t('Negativ')}</em> <Highlight text={entry.negative} search={search} />
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
