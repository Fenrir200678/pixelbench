import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { appMessage } from '../../i18n/appMessages.js'
import { Button } from '../../ui/Button.js'
import { PathField, PathList } from '../../ui/PathField.js'
import { Segmented } from '../../ui/Segmented.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { categories, type ConfigDraft } from './useConfigDraft.js'

const splitArgs = (text: string) => text.split(/\s+/).filter(Boolean)

export function ComfySection({ form, blocked }: { form: ConfigDraft; blocked: boolean }) {
  const { t } = useTranslation()
  const { draft, update, setError } = form
  const external = draft.mode === 'external'
  const [args, setArgs] = useState(draft.args.join(' '))
  const extraCount = categories.reduce((n, key) => n + (draft.extra[key]?.filter(Boolean).length ?? 0), 0)

  return (
    <>
      <SettingGroup>
        <SettingRow
          id="config-mode"
          label={t('Instanz')}
          labelFor={false}
          note={
            external
              ? t('Verbindet sich mit einem laufenden ComfyUI. Generieren geht nur mit der privaten Instanz.')
              : t('Pixelbench startet ComfyUI selbst, nur für sich, und räumt danach auf.')
          }
        >
          <Segmented
            id="config-mode"
            labelledBy="config-mode-label"
            describedBy="config-mode-note"
            value={draft.mode}
            options={[
              { value: 'managed', label: t('Privat') },
              { value: 'external', label: t('Extern') }
            ]}
            onChange={(mode) => update({ mode })}
          />
        </SettingRow>
        {external && (
          <SettingRow id="config-address" label={t('Adresse')} wide>
            <div className="setting-inline">
              <input
                id="config-address"
                type="url"
                placeholder="http://127.0.0.1:8188"
                value={draft.address}
                onChange={(event) => update({ address: event.currentTarget.value })}
              />
              <Button className="secondary" disabled={blocked} onClick={form.test}>
                {t('Verbindung prüfen')}
              </Button>
            </div>
            {form.tested && (
              <p className="setting-note good" role="status">
                {appMessage(form.tested.message)} · ComfyUI {form.tested.version}
              </p>
            )}
          </SettingRow>
        )}
      </SettingGroup>
      {!external && (
        <>
          <SettingGroup title={t('Installation')}>
            <SettingRow id="config-source" label={t('ComfyUI-Ordner')} note={t('Der Ordner mit main.py.')} wide>
              <PathField
                id="config-source"
                kind="comfy"
                title={t('ComfyUI-Ordner auswählen')}
                value={draft.source}
                onChange={(source) => update({ source })}
                onError={setError}
              />
            </SettingRow>
            <SettingRow
              id="config-python"
              label={t('Python')}
              note={t(
                'Das Python der Umgebung, in der ComfyUI installiert ist, meist in .venv\\Scripts (Windows) oder .venv/bin (macOS).'
              )}
              wide
            >
              <PathField
                id="config-python"
                kind="python"
                title={t('Python-Programm auswählen')}
                value={draft.python}
                onChange={(python) => update({ python })}
                onError={setError}
              />
            </SettingRow>
          </SettingGroup>
          <SettingGroup title={t('Modelle')}>
            <SettingRow
              id="config-roots"
              label={t('Modellordner')}
              labelFor={false}
              note={t(
                'Ordner mit Unterordnern wie checkpoints, loras oder vae. Die Modelle im ComfyUI-Ordner werden immer gefunden.'
              )}
              wide
            >
              <PathList
                id="config-roots"
                values={draft.roots}
                title={t('Modellordner auswählen')}
                addLabel={t('Ordner hinzufügen')}
                onChange={(roots) => update({ roots })}
                onError={setError}
              />
            </SettingRow>
            <details className="path-settings" open={extraCount > 0 || undefined}>
              <summary>
                {t('Weitere Ordner je Modellart')}
                {extraCount > 0 && <span className="count">{extraCount}</span>}
              </summary>
              {categories.map((category) => (
                <SettingRow key={category} id={'config-' + category} label={category} labelFor={false} wide>
                  <PathList
                    id={'config-' + category}
                    values={draft.extra[category] ?? []}
                    title={t('Ordner für {{category}} auswählen', { category })}
                    addLabel={t('Ordner hinzufügen')}
                    onChange={(paths) => update({ extra: { ...draft.extra, [category]: paths } })}
                    onError={setError}
                  />
                </SettingRow>
              ))}
            </details>
          </SettingGroup>
          <SettingGroup title={t('Start')}>
            <SettingRow
              id="config-port"
              label={t('Port')}
              note={t('Leer lassen für einen freien Port bei jedem Start.')}
            >
              <input
                id="config-port"
                className="port-input"
                type="number"
                min={1024}
                max={65535}
                placeholder={t('automatisch')}
                aria-describedby="config-port-note"
                value={draft.port || ''}
                onChange={(event) => update({ port: Number(event.currentTarget.value) || 0 })}
              />
            </SettingRow>
            <SettingRow
              id="config-args"
              label={t('Zusätzliche Startoptionen')}
              note={t(
                'ComfyUI-Optionen, durch Leerzeichen getrennt, z. B. --use-sage-attention oder --reserve-vram 2.'
              )}
              wide
            >
              <input
                id="config-args"
                type="text"
                spellCheck={false}
                placeholder="--use-sage-attention"
                aria-describedby="config-args-note"
                value={args}
                onChange={(event) => {
                  setArgs(event.currentTarget.value)
                  update({ args: splitArgs(event.currentTarget.value) })
                }}
              />
            </SettingRow>
          </SettingGroup>
        </>
      )}
    </>
  )
}
