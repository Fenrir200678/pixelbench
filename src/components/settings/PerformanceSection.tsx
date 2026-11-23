import { useTranslation } from 'react-i18next'
import type { Config } from '../../types/api.js'
import { Segmented } from '../../ui/Segmented.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'
import type { ConfigDraft } from './useConfigDraft.js'

const memoryNotes: Record<Config['memory'], string> = {
  balanced: 'ComfyUI verwendet geladene Modelle für weitere Jobs wieder und lagert sie bei Bedarf in den RAM aus.',
  vram: 'ComfyUI hält das Diffusionsmodell bevorzugt im VRAM. Der Textencoder kann weiterhin ausgelagert werden.',
  low: 'ComfyUI führt die Loader für jeden Job neu aus. Das spart Platz im Arbeitsspeicher.'
}
const previewNotes: Record<Config['previews'], string> = {
  off: 'Die Platzhalterkarte zeigt nur den Fortschritt.',
  fast: 'Grobe Farbvorschau direkt aus dem Latent. Kostet praktisch keine Zeit.',
  taesd: 'Genauere Vorschau mit TAESD. Braucht die passenden Decoder im Ordner „vae_approx“, sonst wie „Schnell“.'
}

export function PerformanceSection({ form }: { form: ConfigDraft }) {
  const { t } = useTranslation()
  const { draft, update } = form
  const external = draft.mode === 'external'

  return (
    <>
      {external && (
        <p className="setting-callout">
          {t('Diese Einstellungen gelten nur für die private Instanz. Eine externe Instanz bestimmt sie selbst.')}
        </p>
      )}
      <SettingGroup>
        <SettingRow id="config-memory" label={t('Modellspeicher')} labelFor={false} note={t(memoryNotes[draft.memory])}>
          <Segmented
            id="config-memory"
            labelledBy="config-memory-label"
            describedBy="config-memory-note"
            disabled={external}
            value={draft.memory}
            options={[
              { value: 'balanced', label: t('Ausgewogen') },
              { value: 'vram', label: t('VRAM') },
              { value: 'low', label: t('Sparsam') }
            ]}
            onChange={(memory) => update({ memory })}
          />
        </SettingRow>
        <SettingRow
          id="config-keep-models"
          label={t('Modelle beim Bildwechsel behalten')}
          note={t(
            'Spart das erneute Laden der Modelle bei einem neuen Bild. ComfyUI behält dann Modelle und Zwischenergebnisse der vorherigen Sitzung im Speicher, bis der Prozess endet.'
          )}
        >
          <Toggle
            id="config-keep-models"
            aria-describedby="config-keep-models-note"
            disabled={external}
            checked={draft.keepModels}
            onChange={(keepModels) => update({ keepModels })}
          />
        </SettingRow>
        <SettingRow
          id="config-previews"
          label={t('Live-Vorschau beim Sampling')}
          labelFor={false}
          note={t(previewNotes[draft.previews])}
        >
          <Segmented
            id="config-previews"
            labelledBy="config-previews-label"
            describedBy="config-previews-note"
            disabled={external}
            value={draft.previews}
            options={[
              { value: 'off', label: t('Aus') },
              { value: 'fast', label: t('Schnell') },
              { value: 'taesd', label: 'TAESD' }
            ]}
            onChange={(previews) => update({ previews })}
          />
        </SettingRow>
      </SettingGroup>
    </>
  )
}
