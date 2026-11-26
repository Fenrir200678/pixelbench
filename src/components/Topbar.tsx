import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { exportKey, newImageKey, toolNames, tools } from '../editor/tools.js'
import { appMessage } from '../i18n/appMessages.js'
import { Button } from '../ui/Button.js'
import { SessionControls } from './SessionControls.js'
import type { Bridge } from '../hooks/useBridge.js'
import type { EditorSession } from '../hooks/useEditorSession.js'
import type { Tool } from '../types/editor.js'
import { modKey } from '../helpers/platform.js'

type Props = {
  tool: Tool
  session: EditorSession
  canUndo: boolean
  canRedo: boolean
  canExport: boolean
  exportLabel: string
  openDisabled: boolean
  newDisabled: boolean
  onNew: () => void
  onOpen: () => void
  onExport: () => void
  onUndo: () => void
  onRedo: () => void
  onSettings: () => void
  onTool: (tool: Tool) => void
  /** Shows a dot on the settings button while a newer release is offered. */
  updateAvailable?: boolean
  /** Workflow profile and presets of the current mode, shown next to the mode switcher. */
  workflowSwitch?: ReactNode
}

export function Topbar({
  tool,
  session,
  canUndo,
  canRedo,
  canExport,
  exportLabel,
  openDisabled,
  newDisabled,
  onNew,
  onOpen,
  onExport,
  onUndo,
  onRedo,
  onSettings,
  onTool,
  updateAvailable,
  workflowSwitch
}: Props) {
  const { t } = useTranslation()
  return (
    <header className="topbar">
      <div className="topbar-actions">
        <a className="brand" href="/" aria-label="Pixelbench Editor" title={`Pixelbench v${__APP_VERSION__}`}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <strong>Pixelbench</strong>
        </a>
        <div className="top-divider" />
        <div className="topbar-group" role="group" aria-label={t('Datei')}>
          <Button
            id="new-image"
            className="quiet icon"
            icon="new"
            aria-label={t('Neu')}
            aria-keyshortcuts={newImageKey}
            title={`${t('Neues Bild: Dokument schließen und in „Erstellen“ beginnen')} (${newImageKey.replace('Shift+', t('Umschalt') + '+')})`}
            disabled={newDisabled}
            onClick={onNew}
          />
          <Button
            id="open"
            className="quiet icon"
            icon="open"
            aria-label={t('Öffnen')}
            title={t('Bild öffnen ({{mod}}+O)', { mod: modKey(t) })}
            disabled={openDisabled}
            onClick={onOpen}
          />
          <Button
            id="export"
            className="quiet icon"
            icon="save"
            aria-label={exportLabel}
            aria-keyshortcuts={exportKey}
            title={`${exportLabel} (${exportKey.replace('Shift+', t('Umschalt') + '+')})`}
            disabled={!canExport}
            onClick={onExport}
          />
        </div>
        <div className="topbar-group history" role="group" aria-label={t('Verlauf')}>
          <Button
            id="undo"
            className="quiet icon"
            icon="undo"
            aria-label={t('Rückgängig')}
            title={t('Rückgängig ({{mod}}+Z)', { mod: modKey(t) })}
            disabled={!canUndo}
            onClick={onUndo}
          />
          <Button
            id="redo"
            className="quiet icon"
            icon="redo"
            aria-label={t('Wiederholen')}
            title={t('Wiederholen ({{mod}}+Umschalt+Z)', { mod: modKey(t) })}
            disabled={!canRedo}
            onClick={onRedo}
          />
        </div>
        <SessionControls session={session} />
      </div>
      <div className="mode-switcher" role="group" aria-label={t('Bearbeitungsmodi')}>
        {toolNames.map((mode) => {
          const { title, label, glyph, key } = tools[mode]
          return (
            <Button
              key={mode}
              data-tool={mode}
              icon={glyph}
              aria-label={t(title)}
              aria-keyshortcuts={key}
              aria-pressed={tool === mode}
              title={t(title) + ' (' + key + ')'}
              onClick={() => onTool(mode)}
            >
              <span>{t(label)}</span>
            </Button>
          )
        })}
      </div>
      <div className="topbar-actions topbar-end">
        {workflowSwitch}
        <Button
          id="settings"
          className="icon settings-icon"
          icon="settings"
          aria-label={updateAvailable ? t('Einstellungen · Update verfügbar') : t('Einstellungen')}
          title={updateAvailable ? t('Einstellungen · Update verfügbar') : t('Einstellungen')}
          onClick={onSettings}
        >
          {updateAvailable && <span className="topbar-update-dot" aria-hidden="true" />}
        </Button>
      </div>
    </header>
  )
}

/** Connection state of the backend, shown in the status bar. Opens the settings. */
export function BackendStatus({ bridge, onSettings }: { bridge: Bridge; onSettings: () => void }) {
  return (
    <Button
      id="backend"
      className="quiet compact status"
      aria-label={bridge.label}
      title={bridge.status && [appMessage(bridge.status.message), bridge.status.device].filter(Boolean).join(' · ')}
      data-state={bridge.status?.state}
      onClick={onSettings}
    >
      <span className="signal" />
      <span id="backend-label">{bridge.label}</span>
    </Button>
  )
}
