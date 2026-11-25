import { useTranslation } from 'react-i18next'
import type { BackgroundRemoval } from '../../hooks/useBackgroundRemoval.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'

const modelPage = 'https://huggingface.co/Comfy-Org/BiRefNet/tree/main/background_removal'

// Extras: BiRefNet cuts out the subject. The variant keeps the colors and gets a transparent background.
export function BackgroundFields({ background }: { background: BackgroundRemoval }) {
  const { t } = useTranslation()
  const { files, model, blocked } = background
  return (
    <CollapsibleSection id="background-settings" title={t('Hintergrund entfernen')}>
      {files.length > 1 && (
        <label className="stack">
          <span>{t('BiRefNet-Modell')}</span>
          <Combobox
            id="background-model"
            value={model ?? ''}
            options={files.map((file) => ({ value: file }))}
            onChange={background.setModel}
          />
        </label>
      )}
      <label className="check background-mask">
        <input
          id="background-keep-mask"
          type="checkbox"
          checked={background.keepMask}
          onChange={(event) => background.setKeepMask(event.currentTarget.checked)}
        />{' '}
        {t('Hintergrund als Maske für „Ersetzen“ behalten')}
      </label>
      <Button
        id="remove-background"
        className="secondary compact background-apply"
        icon="eraser"
        disabled={!background.canRun}
        title={t('Die gewählte Variante oder das geöffnete Bild freistellen')}
        onClick={background.run}
      >
        {' '}
        {t('Auf aktuelles Bild anwenden')}
      </Button>
      {blocked ? (
        <p className="field-note warn">{t('Braucht ComfyUI 0.43 oder neuer mit den Nodes „Remove Background“.')}</p>
      ) : !model ? (
        <p className="field-note">
          {t(
            'Kein BiRefNet-Modell gefunden. „birefnet.safetensors“ gehört unter „background_removal“ in einen Modell-Stammordner.'
          )}{' '}
          <a className="doc-link" href={modelPage} target="_blank" rel="noopener noreferrer">
            {t('Download')}
          </a>
        </p>
      ) : (
        <p className="field-note">
          {t('Erzeugt eine Variante mit transparentem Hintergrund. Für die Transparenz als PNG exportieren.')}
        </p>
      )}
    </CollapsibleSection>
  )
}
