import { Button } from '../../ui/Button.js'

export function RatioLock({
  id,
  label,
  locked,
  disabled,
  onClick
}: {
  id: string
  label: string
  locked: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      id={id}
      className="icon ratio-lock"
      icon={locked ? 'lock' : 'lock-open'}
      aria-label={label}
      title={label}
      aria-pressed={locked}
      disabled={disabled}
      onClick={onClick}
    />
  )
}
