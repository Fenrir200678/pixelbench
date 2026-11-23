import { useTranslation } from 'react-i18next'
import type { SendTarget } from '../../hooks/useSendSettings.js'
import { Button } from '../../ui/Button.js'

const targets: { tool: SendTarget; label: string; icon: 'create' | 'edit' | 'mask' }[] = [
  { tool: 'create', label: 'In Erstellen', icon: 'create' },
  { tool: 'edit', label: 'In Ändern', icon: 'edit' },
  { tool: 'inpaint', label: 'In Ersetzen', icon: 'mask' }
]

// "Übernehmen in …" as in Forge's PNG Info. Edit and Inpaint also open the image when it is only inspected.
export function MetadataActions({
  onSend,
  onOpen,
  busy,
  empty
}: {
  onSend: (tool: SendTarget) => void
  onOpen?: () => void
  busy: boolean
  // Nothing to take over, such as a file with only unknown text.
  empty: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="metadata-actions">
      <span>{t('Einstellungen übernehmen')}</span>
      <div className="metadata-send">
        {targets.map(({ tool, label, icon }) => (
          <Button
            key={tool}
            className="secondary compact"
            icon={icon}
            disabled={busy || empty}
            title={t('Prompt, Seed und Einstellungen außer dem Modell übernehmen')}
            onClick={() => onSend(tool)}
          >
            {t(label)}
          </Button>
        ))}
      </div>
      {onOpen && (
        <Button className="secondary compact metadata-open" icon="open" disabled={busy} onClick={onOpen}>
          {t('An Arbeitsfläche senden')}
        </Button>
      )}
    </div>
  )
}
