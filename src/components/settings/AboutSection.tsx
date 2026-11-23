import { useTranslation } from 'react-i18next'
import { SettingGroup } from '../../ui/SettingRow.js'

export function AboutSection() {
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
        </dl>
        <p className="setting-intro">
          {t('Läuft komplett auf deinem Rechner. Bilder und Prompts verlassen ihn nicht.')}
        </p>
      </SettingGroup>
    </>
  )
}
