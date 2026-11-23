import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { messageOf } from '../helpers/async.js'
import { appMessage } from '../i18n/appMessages.js'
import { Button } from './Button.js'
import { Icon } from './Icon.js'

/** folder: any folder. comfy: a ComfyUI source folder with main.py. python: an executable file. */
export type PathKind = 'folder' | 'comfy' | 'python'
type Check = { state: 'ok' | 'missing' | 'invalid' | 'empty'; message?: string }

/** Opens the native picker on the machine running Pixelbench. Resolves with '' when the user cancels. */
async function pickPath(kind: PathKind, initial: string, title: string) {
  const { path } = await api<{ path: string }>('/api/paths/pick', {
    kind: kind === 'python' ? 'python' : 'folder',
    initial,
    title
  })
  return path
}

/** Checks the path on the server shortly after it stops changing. */
function usePathCheck(kind: PathKind, path: string) {
  const [check, setCheck] = useState<Check>()
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => {
      api<{ results: Check[] }>('/api/paths/check', { items: [{ kind, path }] })
        .then(({ results }) => current && setCheck(results[0]))
        .catch(() => current && setCheck(undefined))
    }, 350)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [kind, path])
  return check
}

/** A path input with a native browse button and a live existence check. */
export function PathField({
  id,
  kind,
  value,
  onChange,
  title,
  placeholder,
  onRemove,
  onError,
  labelledBy
}: {
  id?: string
  kind: PathKind
  value: string
  onChange: (value: string) => void
  // Title of the native dialog.
  title: string
  placeholder?: string
  onRemove?: () => void
  onError?: (message?: string) => void
  labelledBy?: string
}) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const check = usePathCheck(kind, value)
  const problem = check && (check.state === 'missing' || check.state === 'invalid')

  async function browse() {
    setPicking(true)
    onError?.()
    try {
      const path = await pickPath(kind, value, title)
      if (path) onChange(path)
    } catch (error) {
      onError?.(messageOf(error))
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="path-field" data-state={check?.state}>
      <div className="path-input">
        <input
          id={id}
          type="text"
          value={value}
          spellCheck={false}
          placeholder={placeholder}
          aria-labelledby={labelledBy}
          aria-invalid={problem || undefined}
          aria-describedby={problem && id ? id + '-check' : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {check?.state === 'ok' && (
          <span className="path-ok" title={t('Gefunden')}>
            <Icon name="check" />
          </span>
        )}
        <Button
          className="icon"
          icon="open"
          aria-label={kind === 'python' ? t('Datei auswählen …') : t('Ordner auswählen …')}
          title={kind === 'python' ? t('Datei auswählen …') : t('Ordner auswählen …')}
          disabled={picking}
          onClick={browse}
        />
        {onRemove && (
          <Button
            className="icon"
            icon="close"
            aria-label={t('Pfad entfernen')}
            title={t('Pfad entfernen')}
            onClick={onRemove}
          />
        )}
      </div>
      {problem && (
        <p id={id ? id + '-check' : undefined} className="path-problem">
          {appMessage(check.message ?? '')}
        </p>
      )}
    </div>
  )
}

/** Several folders, one row each. New folders come from the native picker. */
export function PathList({
  id,
  values,
  onChange,
  title,
  addLabel,
  onError
}: {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  title: string
  addLabel: string
  onError?: (message?: string) => void
}) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const set = (index: number, value: string) => onChange(values.map((item, at) => (at === index ? value : item)))

  async function add() {
    setPicking(true)
    onError?.()
    try {
      const path = await pickPath('folder', values.at(-1) ?? '', title)
      if (path && !values.includes(path)) onChange([...values, path])
    } catch (error) {
      // Without a picker the folder can still be typed into a new row.
      onChange([...values, ''])
      onError?.(messageOf(error))
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="path-list" id={id}>
      {values.map((value, index) => (
        <PathField
          key={index}
          id={id + '-' + index}
          kind="folder"
          value={value}
          title={title}
          labelledBy={id + '-label'}
          onChange={(next) => set(index, next)}
          onRemove={() => onChange(values.filter((_, at) => at !== index))}
          onError={onError}
        />
      ))}
      <div className="path-list-actions">
        <Button className="secondary" icon="plus" disabled={picking} onClick={add}>
          {addLabel}
        </Button>
        <Button className="quiet" disabled={picking} onClick={() => onChange([...values, ''])}>
          {t('Pfad eintippen')}
        </Button>
      </div>
    </div>
  )
}
