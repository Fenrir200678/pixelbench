import { useTranslation } from 'react-i18next'
import { Fragment } from 'react'
import { shortcutGroups } from '../../editor/shortcutList.js'

const keyNames: Record<string, string> = {
  Ctrl: 'Strg',
  Shift: 'Umschalt',
  Space: 'Leertaste',
  Enter: 'Eingabe',
  Delete: 'Entf',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→'
}

function Keys({ combo }: { combo: string }) {
  const { t } = useTranslation()
  // "+" itself is a key, as in zooming. Split only on a "+" between two names.
  const parts = combo === '+' ? ['+'] : combo.split(/(?<=\w)\+(?=\S)/)
  return (
    <span className="key-combo">
      {parts.map((part, index) => (
        <kbd key={index}>{keyNames[part] ? t(keyNames[part]) : part}</kbd>
      ))}
    </span>
  )
}

export function ShortcutsSection() {
  const { t } = useTranslation()
  return (
    <>
      <p className="setting-intro">{t('Kürzel wirken, solange kein Textfeld den Fokus hat.')}</p>
      {shortcutGroups.map((group) => (
        <section key={group.title} className="setting-group">
          <h4>{t(group.title)}</h4>
          <dl className="shortcut-list">
            {group.items.map((item) => (
              <Fragment key={item.label}>
                <dt>{t(item.label)}</dt>
                <dd>
                  {item.keys.map((combo, index) => (
                    <Fragment key={combo}>
                      {index > 0 && <span className="key-or">{t('oder')}</span>}
                      <Keys combo={combo} />
                    </Fragment>
                  ))}
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </>
  )
}
