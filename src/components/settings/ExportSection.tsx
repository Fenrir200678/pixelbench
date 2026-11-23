import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { exportFileName, fileNameTokens } from '../../settings/fileName.js'
import { defaultFileName, jpgQualityRange, setPreference, usePreferences } from '../../settings/preferences.js'
import { Button } from '../../ui/Button.js'
import { Segmented } from '../../ui/Segmented.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'

const example = {
  name: 'portrait.png',
  width: 1024,
  height: 1536,
  record: {
    tool: 'create',
    profile: 'krea2-t2i',
    prompt: '',
    seed: 421337,
    size: [1024, 1536] as [number, number],
    parameters: {},
    models: { unet: 'krea2-turbo-fp8.safetensors' }
  }
}

const tokenTitles: Record<(typeof fileNameTokens)[number], string> = {
  name: 'Name der geöffneten Datei',
  date: 'Datum (JJJJ-MM-TT)',
  time: 'Uhrzeit (hhmmss)',
  seed: 'Seed der Generierung',
  model: 'Modelldatei der Generierung',
  profile: 'Workflow der Generierung',
  width: 'Breite in Pixeln',
  height: 'Höhe in Pixeln'
}

export function ExportSection() {
  const { t } = useTranslation()
  const preferences = usePreferences()
  const input = useRef<HTMLInputElement>(null)
  const [pattern, setPattern] = useState(preferences.fileName)
  const jpg = preferences.exportFormat === 'jpg'

  function changePattern(value: string) {
    setPattern(value)
    if (value.trim()) setPreference('fileName', value)
  }

  // Inserts a token at the cursor, so the pattern can be built by clicking.
  function insert(token: string) {
    const field = input.current
    const start = field?.selectionStart ?? pattern.length
    const end = field?.selectionEnd ?? pattern.length
    const text = '{' + token + '}'
    changePattern(pattern.slice(0, start) + text + pattern.slice(end))
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  return (
    <>
      <SettingGroup>
        <SettingRow id="config-export-format" label={t('Dateiformat')} labelFor={false}>
          <Segmented
            id="config-export-format"
            labelledBy="config-export-format-label"
            value={preferences.exportFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPG' }
            ]}
            onChange={(format) => setPreference('exportFormat', format)}
          />
        </SettingRow>
        {jpg && (
          <SettingRow
            id="config-jpg-quality"
            label={t('JPG-Qualität')}
            note={t('Höher heißt größere Dateien mit weniger Kompressionsspuren.')}
          >
            <div className="setting-inline">
              <input
                id="config-jpg-quality"
                type="range"
                min={jpgQualityRange.min}
                max={jpgQualityRange.max}
                value={preferences.jpgQuality}
                aria-describedby="config-jpg-quality-note"
                onChange={(event) => setPreference('jpgQuality', Number(event.currentTarget.value))}
              />
              <output htmlFor="config-jpg-quality" className="setting-value">
                {preferences.jpgQuality}
              </output>
            </div>
          </SettingRow>
        )}
        <SettingRow
          id="config-export-metadata"
          label={t('Generierungsdaten speichern')}
          note={
            jpg
              ? t('Nur bei PNG möglich.')
              : t('Prompt, Seed und Einstellungen im PNG, lesbar für Forge, ComfyUI-Tools und Pixelbench.')
          }
        >
          <Toggle
            id="config-export-metadata"
            aria-describedby="config-export-metadata-note"
            checked={preferences.exportMetadata && !jpg}
            disabled={jpg}
            onChange={(value) => setPreference('exportMetadata', value)}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title={t('Dateiname')}>
        <SettingRow
          id="config-file-name"
          label={t('Muster')}
          wide
          note={
            <>
              {t('Beispiel')}:{' '}
              <span className="file-name-example">
                {exportFileName(pattern || defaultFileName, example)}.{preferences.exportFormat}
              </span>
            </>
          }
        >
          <div className="setting-inline">
            <input
              ref={input}
              id="config-file-name"
              type="text"
              spellCheck={false}
              value={pattern}
              placeholder={defaultFileName}
              aria-describedby="config-file-name-note"
              onChange={(event) => changePattern(event.currentTarget.value)}
              onBlur={() => !pattern.trim() && setPattern(preferences.fileName)}
            />
            <Button
              className="quiet compact"
              disabled={pattern === defaultFileName}
              onClick={() => changePattern(defaultFileName)}
            >
              {t('Standard')}
            </Button>
          </div>
          <div className="token-list" aria-label={t('Platzhalter einfügen')} role="group">
            {fileNameTokens.map((token) => (
              <button
                key={token}
                type="button"
                className="token"
                title={t(tokenTitles[token])}
                onClick={() => insert(token)}
              >
                {'{' + token + '}'}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>
    </>
  )
}
