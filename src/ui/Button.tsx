import type { ComponentPropsWithRef } from 'react'
import { Icon, type IconName } from './Icon.js'

type Props = ComponentPropsWithRef<'button'> & { icon?: IconName }

export function Button({ icon, children, type = 'button', ...props }: Props) {
  return (
    <button {...props} type={type}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}
