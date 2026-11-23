import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import type { Workflow } from '../../hooks/useWorkflow.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { Icon } from '../../ui/Icon.js'
import { DialogHeading, Modal } from '../../ui/Modal.js'

/** Workflow profile and parameter presets of the current mode, shown in the top bar. */
export function WorkflowSwitch({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, options, ready, chooseProfile } = workflow
  const sortedOptions = [...options].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="workflow-switch" role="group" aria-label={t('Workflow-Profil')}>
      <Combobox
        id="profile"
        aria-label={t('Workflow-Profil')}
        aria-describedby="profile-note"
        title={profile?.name}
        value={profile?.id ?? ''}
        disabled={!profile}
        placeholder={profile ? undefined : t('Profile werden geladen …')}
        options={sortedOptions.map((option) => ({
          value: option.id,
          label: option.name + (ready(option) ? '' : t(' · nicht bereit'))
        }))}
        onChange={chooseProfile}
      />
      <PresetMenu workflow={workflow} />
    </div>
  )
}

function PresetMenu({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { profile, preset, presets, activatePreset, savePreset, saveDefault } = workflow
  const names = Object.keys(presets)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('#presets')?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="preset-menu" ref={root}>
      <Button
        id="presets"
        className="quiet compact"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('Presets')}
        disabled={!profile}
        onClick={() => setOpen(!open)}
      >
        <span>{preset || t('Presets')}</span>
        <Icon name="chevron" />
      </Button>
      {open && (
        <div className="menu" role="menu" aria-label={t('Presets')}>
          {names.length ? (
            names.map((name) => (
              <button
                key={name}
                type="button"
                role="menuitemradio"
                aria-checked={name === preset}
                onClick={() => run(() => activatePreset(name))}
              >
                {name}
              </button>
            ))
          ) : (
            <p className="menu-empty">{t('Noch keine Presets für dieses Profil.')}</p>
          )}
          <hr />
          <button id="save-preset" type="button" role="menuitem" onClick={() => run(() => setSaving(true))}>
            {t('Als Preset speichern …')}
          </button>
          <button id="make-default" type="button" role="menuitem" onClick={() => run(saveDefault)}>
            {t('Als Profilstandard speichern')}
          </button>
        </div>
      )}
      {saving && <PresetDialog onClose={() => setSaving(false)} onSave={savePreset} />}
    </div>
  )
}

function PresetDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation()
  return (
    <Modal id="preset-dialog" onClose={onClose}>
      <form
        id="preset-form"
        onSubmit={(event) => {
          event.preventDefault()
          const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
          if (!name) return
          onSave(name)
          onClose()
        }}
      >
        <DialogHeading
          dialog="preset-dialog"
          closeId="preset-close"
          title={t('Parameter-Preset speichern')}
          onClose={onClose}
        />
        <label className="stack">
          <span>{t('Name')}</span>
          <input id="preset-name" name="name" type="text" maxLength={60} required autoFocus />
        </label>
        <footer className="dialog-actions">
          <Button type="submit" className="primary">
            {t('Speichern')}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
