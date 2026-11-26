import { useTranslation } from 'react-i18next'
import type { Updates } from '../../hooks/useUpdates.js'
import { SettingGroup } from '../../ui/SettingRow.js'
import { UpdateSection } from './UpdateSection.js'

// The release workflow puts the version's CHANGELOG.md section at the top of its GitHub release.
const releases = 'https://github.com/Fenrir200678/pixelbench/releases'

export function AboutSection({ updates, busy }: { updates: Updates; busy: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="about-hero">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div>
          <div className="about-title">
            <h4>Pixelbench</h4>
            <span className="about-version">v{__APP_VERSION__}</span>
          </div>
          <p className="about-tagline">
            {t('Lokaler Bildeditor für ComfyUI: Erstellen, Ändern, Hochskalieren und Maskieren an einem Ort.')}
          </p>
        </div>
      </div>
      <SettingGroup title={t('Version')}>
        <dl className="server-facts">
          <dt>Pixelbench</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt>{t('Autor')}</dt>
          <dd>{__APP_AUTHOR__}</dd>
          <dt>{t('Lizenz')}</dt>
          <dd>{__APP_LICENSE__}</dd>
          <dt>{t('Technik')}</dt>
          <dd>React, Vite, ComfyUI</dd>
          <dt>{t('Neuigkeiten')}</dt>
          <dd className="about-links">
            <a href={releases + '/tag/v' + __APP_VERSION__} target="_blank" rel="noopener noreferrer">
              {t('Was ist neu in v{{version}}', { version: __APP_VERSION__ })}
            </a>
            <a href={releases} target="_blank" rel="noopener noreferrer">
              {t('Alle Versionen')}
            </a>
          </dd>
        </dl>
        <p className="setting-intro">
          {t('Läuft komplett auf deinem Rechner. Bilder und Prompts verlassen ihn nicht.')}
        </p>
      </SettingGroup>
      <UpdateSection updates={updates} busy={busy} />
    </>
  )
}
