import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { messageOf } from '../../helpers/async.js'
import {
  clearPromptHistory,
  promptHistoryLimitRange,
  setPromptHistorySettings,
  usePromptHistory
} from '../../settings/promptHistory.js'
import { Button } from '../../ui/Button.js'
import { NumberField } from '../../ui/NumberField.js'
import { SettingGroup, SettingRow } from '../../ui/SettingRow.js'
import { Toggle } from '../../ui/Toggle.js'

/** On/off, size and clearing of the prompt history, which the server keeps in a file. */
export function PromptHistorySettings() {
  const { t } = useTranslation()
  const history = usePromptHistory()
  const [error, setError] = useState<string>()

  async function run(action: () => Promise<unknown>) {
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(messageOf(failure))
    }
  }

  return (
    <SettingGroup title={t('Prompt-Verlauf')}>
      <SettingRow
        id="config-prompt-history"
        label={t('Abgeschickte Prompts speichern')}
        note={t('Jede gestartete Generierung legt ihren Prompt im Verlauf unter dem Prompt-Feld ab.')}
      >
        <Toggle
          id="config-prompt-history"
          aria-describedby="config-prompt-history-note"
          checked={history?.enabled ?? false}
          disabled={!history}
          onChange={(enabled) => void run(() => setPromptHistorySettings({ enabled }))}
        />
      </SettingRow>
      <SettingRow
        id="config-prompt-history-limit"
        label={t('Maximale Anzahl')}
        note={t('Ist der Verlauf voll, fällt der am längsten nicht benutzte Prompt heraus.')}
      >
        <NumberField
          id="config-prompt-history-limit"
          label={t('Maximale Anzahl')}
          externalLabel
          describedBy="config-prompt-history-limit-note"
          value={history?.limit}
          {...promptHistoryLimitRange}
          disabled={!history?.enabled}
          onChange={(limit) => void run(() => setPromptHistorySettings({ limit }))}
          commitOnBlur
        />
      </SettingRow>
      <SettingRow
        id="config-clear-prompt-history"
        label={t('Gespeicherte Prompts')}
        labelFor={false}
        note={t('Prompts im Verlauf: {{count}}', { count: history?.entries.length ?? 0 })}
      >
        <Button
          id="config-clear-prompt-history"
          className="secondary danger"
          icon="trash"
          aria-describedby="config-clear-prompt-history-note"
          disabled={!history?.entries.length}
          onClick={() => {
            if (window.confirm(t('Alle Prompts aus dem Verlauf löschen? Das lässt sich nicht rückgängig machen.')))
              void run(clearPromptHistory)
          }}
        >
          {t('Verlauf löschen')}
        </Button>
      </SettingRow>
      {error && (
        <p className="setting-note danger" role="status">
          {t(error)}
        </p>
      )}
    </SettingGroup>
  )
}
