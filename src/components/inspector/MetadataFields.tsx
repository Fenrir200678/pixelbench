import { useTranslation } from 'react-i18next'
import type { GenerationInfo, MetadataSource } from '../../metadata/index.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { Button } from '../../ui/Button.js'
import { CopyButton } from '../../ui/CopyButton.js'
import type { SendTarget } from '../../hooks/useSendSettings.js'
import { MetadataActions } from './MetadataActions.js'
import { MetadataDropzone } from './MetadataDropzone.js'

const sourceNames: Record<MetadataSource, string> = {
  pixelbench: 'Pixelbench',
  forge: 'Forge / A1111',
  comfyui: 'ComfyUI',
  other: 'Text'
}

// JSON such as a ComfyUI graph is shown indented. The copy button keeps the stored text.
function readable(text: string) {
  if (!text.trimStart().startsWith('{')) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function TextBlock({ label, text, copyLabel }: { label: string; text: string; copyLabel: string }) {
  return (
    <div className="metadata-text">
      <div className="metadata-text-head">
        <span>{label}</span>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <p>{text}</p>
    </div>
  )
}

export type MetadataView = {
  info?: GenerationInfo
  fileName: string
  loaded: boolean
  busy: boolean
  onSend: (tool: SendTarget) => void
  // Thumbnail of the file dropped on the generation data. Only that file's data is shown.
  thumbnail?: string
  onInspect: (file: File) => void
  onClearInspection: () => void
  // Set while a dropped file is only inspected, not opened.
  onOpen?: () => void
}

// PNG Info in Extras: the generation data of a dropped file or of the opened image.
export function MetadataFields({
  info,
  fileName,
  loaded,
  busy,
  onSend,
  thumbnail,
  onInspect,
  onClearInspection,
  onOpen
}: MetadataView) {
  const { t } = useTranslation()
  return (
    <CollapsibleSection
      id="image-metadata"
      title={t('Generierungsdaten')}
      summary={info ? sourceNames[info.source] : loaded ? t('Keine') : undefined}
    >
      <MetadataDropzone
        thumbnail={thumbnail}
        fileName={thumbnail ? fileName : undefined}
        onFile={onInspect}
        onClear={onClearInspection}
      />
      {!info ? (
        loaded && (
          <p className="field-note">
            {t('In {{file}} sind keine Generierungsdaten gespeichert.', { file: fileName })}
            {onOpen && (
              <Button className="secondary compact metadata-open" icon="open" disabled={busy} onClick={onOpen}>
                {t('An Arbeitsfläche senden')}
              </Button>
            )}
          </p>
        )
      ) : (
        <div className="metadata">
          <p className="metadata-source">
            {sourceNames[info.source]} · {fileName}
          </p>
          {info.prompt && <TextBlock label={t('Prompt')} text={info.prompt} copyLabel={t('Prompt kopieren')} />}
          {info.negative && (
            <TextBlock label={t('Negativer Prompt')} text={info.negative} copyLabel={t('Negativen Prompt kopieren')} />
          )}
          {info.fields.length > 0 && (
            <dl className="metadata-fields">
              {info.fields.map(({ key, value }) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <MetadataActions onSend={onSend} onOpen={onOpen} busy={busy} empty={!info.prompt && !info.fields.length} />
          <details className="metadata-raw">
            <summary>{t('Rohdaten')}</summary>
            {info.raw.map(({ key, value }) => (
              <div key={key} className="metadata-text">
                <div className="metadata-text-head">
                  <span>{key}</span>
                  <CopyButton text={value} label={t('{{key}} kopieren', { key })} />
                </div>
                <pre>{readable(value)}</pre>
              </div>
            ))}
          </details>
        </div>
      )}
    </CollapsibleSection>
  )
}
