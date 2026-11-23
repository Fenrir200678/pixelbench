import type { ReactNode } from 'react'

/**
 * One setting: label and explanation on the left, the control on the right.
 * wide puts the control below the text, for paths and other long values.
 */
export function SettingRow({
  id,
  label,
  note,
  wide,
  labelFor = true,
  children
}: {
  id: string
  label: string
  note?: ReactNode
  wide?: boolean
  // False for controls that are not labelable, such as a radio group. They use aria-labelledby={id + '-label'}.
  labelFor?: boolean
  children: ReactNode
}) {
  const Label = labelFor ? 'label' : 'span'
  return (
    <div className={'setting-row' + (wide ? ' wide' : '')}>
      <div className="setting-text">
        <Label id={id + '-label'} htmlFor={labelFor ? id : undefined} className="setting-label">
          {label}
        </Label>
        {note && (
          <p id={id + '-note'} className="setting-note">
            {note}
          </p>
        )}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

/** A titled block of setting rows inside one settings page. */
export function SettingGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="setting-group">
      {title && <h4>{title}</h4>}
      {children}
    </section>
  )
}
