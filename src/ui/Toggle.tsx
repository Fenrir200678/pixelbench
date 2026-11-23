import type { ComponentPropsWithRef } from 'react'

type Props = Omit<ComponentPropsWithRef<'button'>, 'onChange'> & {
  checked: boolean
  onChange: (checked: boolean) => void
}

/** An on/off switch. Label it with a <label htmlFor> or aria-label. */
export function Toggle({ checked, onChange, className, ...props }: Props) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      className={'toggle' + (className ? ' ' + className : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-thumb" aria-hidden="true" />
    </button>
  )
}
