import { useTranslation } from 'react-i18next'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Panel } from 'react-resizable-panels'
import { api } from '../api/client.js'
import { consoleKey, toggleVariantsKey } from '../editor/tools.js'
import { bridgeLogMessage } from '../i18n/appMessages.js'
import { Button } from '../ui/Button.js'
import { ResizableLayout, ResizeHandle } from '../ui/ResizableLayout.js'

type Entry = { id: number; at: number; source: 'ComfyUI' | 'Brücke'; line: string }
type Log = { cursor: number; stream: string; entries: Entry[] }
const formatTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function Workspace({
  fileName,
  dirty,
  meta,
  loaded,
  hasVariants,
  variantsCollapsed,
  onToggleVariants,
  consoleOpen: open,
  onToggleConsole,
  variants,
  backendStatus,
  zoomControls,
  variantCount,
  children
}: {
  fileName: string
  dirty: boolean
  meta: string
  loaded: boolean
  hasVariants: boolean
  variantsCollapsed: boolean
  onToggleVariants: () => void
  consoleOpen: boolean
  onToggleConsole: () => void
  variants: ReactNode
  backendStatus?: ReactNode
  /** Zoom and fit for the open image, shown in the status bar. */
  zoomControls?: ReactNode
  variantCount: number
  children: ReactNode
}) {
  const { t } = useTranslation()
  const showVariants = hasVariants && !variantsCollapsed
  return (
    <section className="workspace" aria-label={t('Arbeitsfläche')}>
      <ResizableLayout
        id="workspace-layout"
        orientation="vertical"
        panelIds={['canvas-panel', ...(showVariants ? ['variants-panel'] : []), ...(open ? ['backend-panel'] : [])]}
      >
        <Panel id="canvas-panel" className="layout-panel" minSize="25%">
          {children}
        </Panel>
        {showVariants && (
          <>
            <ResizeHandle label={t('Höhe der Variantenleiste ändern')} />
            <Panel id="variants-panel" className="layout-panel" defaultSize="120px" minSize="120px" maxSize="45%">
              {variants}
            </Panel>
          </>
        )}
        {open && (
          <>
            <ResizeHandle label={t('Höhe der Konsole ändern')} />
            <Panel id="backend-panel" className="layout-panel" defaultSize="200px" minSize="84px" maxSize="50%">
              <ConsolePanel open={open} />
            </Panel>
          </>
        )}
      </ResizableLayout>
      <footer className="workspace-footer">
        <div className="document-meta">
          {fileName && (
            <span id="document-status" title={fileName}>
              <span className="document-name">{fileName}</span>
              {dirty && <span>•</span>}
            </span>
          )}
          <span id="image-meta" title={meta}>
            {meta}
          </span>
        </div>
        {loaded && zoomControls}
        <Button
          id="variants-toggle"
          className="quiet compact workspace-panel-toggle"
          icon="image"
          aria-label={t('Varianten')}
          aria-expanded={showVariants}
          aria-controls={showVariants ? 'variants-panel' : undefined}
          title={`${t('Varianten')} (${toggleVariantsKey.replace('Shift', t('Umschalt'))})`}
          aria-keyshortcuts={toggleVariantsKey}
          disabled={!hasVariants}
          onClick={onToggleVariants}
        >
          <span>{t('Varianten')}</span>
          {variantCount > 0 && <span className="toggle-count">{variantCount}</span>}
        </Button>
        <Button
          id="console-toggle"
          className="quiet compact workspace-panel-toggle"
          icon="terminal"
          aria-label={t('Konsole')}
          aria-expanded={open}
          aria-controls="console-panel"
          title={`${t('Backend-Konsole')} (${consoleKey.replace('Shift', t('Umschalt'))})`}
          aria-keyshortcuts={consoleKey}
          onClick={onToggleConsole}
        >
          <span>{t('Konsole')}</span>
        </Button>
        {backendStatus}
      </footer>
    </section>
  )
}

function ConsolePanel({ open }: { open: boolean }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<Entry[]>([])
  const [offline, setOffline] = useState(false)
  const log = useRef({ cursor: 0, stream: '' })
  const list = useRef<HTMLDivElement>(null)
  const follow = useRef(true)

  useEffect(() => {
    if (!open) return
    let active = true
    let timer: number | undefined
    async function refresh() {
      try {
        const { cursor, stream } = log.current
        const next = await api<Log>('/api/logs?after=' + cursor + '&stream=' + encodeURIComponent(stream))
        if (!active) return
        log.current = { cursor: next.cursor, stream: next.stream }
        const element = list.current
        if (!element) return
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 28
        setOffline(false)
        if (stream !== next.stream || next.entries.length) {
          setEntries((previous) => [...(stream === next.stream ? previous : []), ...next.entries].slice(-480))
        }
      } catch {
        if (active) setOffline(true)
      } finally {
        if (active) timer = window.setTimeout(refresh, 600)
      }
    }
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && list.current) {
      follow.current = true
      list.current.scrollTop = list.current.scrollHeight
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && follow.current && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [entries, open])

  return (
    <section id="console-panel" className="console-panel" aria-label={t('Backend-Konsole')} hidden={!open}>
      <div className="console-heading">
        <h2>{t('Konsole')}</h2>
        <span id="console-status">
          {offline ? t('Brücke nicht erreichbar') : entries.length ? '' : t('Warte auf Meldungen …')}
        </span>
      </div>
      <div
        id="console-log"
        className="console-log"
        tabIndex={0}
        ref={list}
        aria-label={t('Protokoll von ComfyUI und Brücke')}
      >
        {entries.map((entry) => (
          <div key={entry.id}>
            <time>{formatTime.format(entry.at)}</time>
            <span className="log-source" data-source={entry.source}>
              {t(entry.source)}
            </span>
            <span>{entry.source === 'Brücke' ? bridgeLogMessage(entry.line) : entry.line}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
