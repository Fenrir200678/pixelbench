import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import type { Bridge } from '../../hooks/useBridge.js'
import { appMessage } from '../../i18n/appMessages.js'
import { confirmDiscard } from '../../settings/preferences.js'
import type { Config } from '../../types/api.js'
import { Button } from '../../ui/Button.js'
import { Icon, type IconName } from '../../ui/Icon.js'
import { Modal } from '../../ui/Modal.js'
import { AboutSection } from './AboutSection.js'
import { ComfySection } from './ComfySection.js'
import { ExportSection } from './ExportSection.js'
import { GeneralSection } from './GeneralSection.js'
import { PerformanceSection } from './PerformanceSection.js'
import { ServerSection } from './ServerSection.js'
import { ShortcutsSection } from './ShortcutsSection.js'
import { useConfigDraft } from './useConfigDraft.js'

type Page = 'general' | 'export' | 'comfy' | 'performance' | 'shortcuts' | 'server' | 'about'
const pages: { id: Page; label: string; icon: IconName }[] = [
  { id: 'general', label: 'Allgemein', icon: 'settings' },
  { id: 'export', label: 'Export', icon: 'export' },
  { id: 'comfy', label: 'ComfyUI', icon: 'plug' },
  { id: 'performance', label: 'Leistung', icon: 'gauge' },
  { id: 'shortcuts', label: 'Tastenkürzel', icon: 'keyboard' },
  { id: 'server', label: 'Server', icon: 'power' },
  { id: 'about', label: 'Über Pixelbench', icon: 'info' }
]
// The last page stays open while the app runs, so reopening the dialog continues where it was.
let lastPage: Page = 'general'

// "cuda:0 NVIDIA GeForce RTX 4090 : native" → "NVIDIA GeForce RTX 4090"
const deviceName = (device?: string) => device?.replace(/^\w+:\d+\s+/, '').replace(/\s*:\s*\w+$/, '')

function Connection({ bridge }: { bridge: Bridge }) {
  const { t } = useTranslation()
  const status = bridge.status
  const state = bridge.serverAction ? 'starting' : (status?.state ?? 'starting')
  const label = { ready: t('Verbunden'), starting: t('Startet …'), error: t('Nicht verbunden') }[state]
  return (
    <div className="settings-connection" data-state={state} title={status?.message && appMessage(status.message)}>
      <span className="connection-dot" aria-hidden="true" />
      <span className="connection-text">
        <strong>{label}</strong>
        {state === 'ready' ? (
          <>
            {status?.device && <span title={status.device}>{deviceName(status.device)}</span>}
            {status?.version && <span>ComfyUI {status.version}</span>}
          </>
        ) : (
          <span>{status?.mode === 'external' ? t('Externe Instanz') : t('Private Instanz')}</span>
        )}
      </span>
    </div>
  )
}

export function SettingsDialog({
  config,
  bridge,
  busy,
  onClose
}: {
  config: Config
  bridge: Bridge
  busy: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>(lastPage)
  const form = useConfigDraft(config, bridge, onClose)
  const blocked = Boolean(form.pending || bridge.serverAction)
  const current = pages.find((item) => item.id === page)!

  useEffect(() => {
    lastPage = page
  }, [page])

  function close() {
    if (form.dirty && !confirmDiscard(t('Ungespeicherte ComfyUI-Einstellungen verwerfen?'))) return
    onClose()
  }

  return (
    <Modal id="config-dialog" className="settings-dialog" onClose={close}>
      <form
        id="config-form"
        className="settings-shell"
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked && form.dirty) void form.save()
        }}
      >
        <nav className="settings-nav" aria-label={t('Einstellungsbereiche')}>
          <h2 id="config-dialog-title">{t('Einstellungen')}</h2>
          <Connection bridge={bridge} />
          <ul>
            {pages.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  id={'settings-page-' + item.id}
                  aria-current={item.id === page ? 'page' : undefined}
                  onClick={() => setPage(item.id)}
                >
                  <Icon name={item.icon} />
                  {t(item.label)}
                  {form.dirty && (item.id === 'comfy' || item.id === 'performance') && (
                    <span className="unsaved-dot" title={t('Ungespeicherte Änderungen')} />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="settings-version">v{__APP_VERSION__}</p>
        </nav>
        <div className="settings-page">
          <header className="settings-page-head">
            <h3>{t(current.label)}</h3>
            {page === 'comfy' && form.draft.mode === 'managed' && (
              <Button className="secondary compact" icon="reload" disabled={blocked} onClick={form.test}>
                {form.pending === 'test' ? t('Prüft …') : t('Verbindung prüfen')}
              </Button>
            )}
            <Button id="config-close" className="icon" aria-label={t('Schließen')} icon="close" onClick={close} />
          </header>
          <div className="settings-body" key={page}>
            {page === 'general' && <GeneralSection />}
            {page === 'export' && <ExportSection />}
            {page === 'comfy' && <ComfySection form={form} blocked={blocked} />}
            {page === 'performance' && <PerformanceSection form={form} />}
            {page === 'shortcuts' && <ShortcutsSection />}
            {page === 'about' && <AboutSection />}
            {page === 'server' && <ServerSection bridge={bridge} busy={busy} disabled={blocked} onClose={onClose} />}
          </div>
          {(form.dirty || form.error) && (
            <footer className="settings-footer">
              {form.error ? (
                <p id="config-error" className="notice" role="alert">
                  {appMessage(form.error)}
                </p>
              ) : (
                <p className="settings-footer-note">
                  {form.restarts
                    ? t('Ungespeicherte Änderungen. Speichern startet ComfyUI neu.')
                    : t('Ungespeicherte Änderungen.')}
                </p>
              )}
              {form.dirty && (
                <>
                  <Button className="quiet" disabled={blocked} onClick={form.reset}>
                    {t('Verwerfen')}
                  </Button>
                  <Button type="submit" className="primary" disabled={blocked}>
                    {form.pending === 'save'
                      ? t('Speichert …')
                      : form.restarts
                        ? t('Speichern und neu starten')
                        : t('Speichern')}
                  </Button>
                </>
              )}
            </footer>
          )}
        </div>
      </form>
    </Modal>
  )
}
