import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { clamp } from '../image/pixels.js'

type Range = { min?: number; max?: number; step?: number }
type Props = {
  id: string
  label: string
  sliderLabel?: string
  value?: number
  min: number
  max: number
  onChange: (value: number) => void
  step?: number
  disabled?: boolean
  placeholder?: string
  row?: boolean
  suffix?: string
  title?: string
  slider?: boolean | Range
  commitOnBlur?: boolean
}

export function NumberField({
  id,
  label,
  sliderLabel = label,
  value,
  min,
  max,
  onChange,
  step = 1,
  disabled,
  placeholder,
  row,
  suffix,
  title,
  slider,
  commitOnBlur
}: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string>()
  const range = typeof slider === 'object' ? slider : {}
  const normalize = (number: number) => clamp(step === 1 ? Math.round(number) : number, min, max)
  const input = (
    <input
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      value={draft ?? value ?? ''}
      onChange={(event) => {
        const { value, valueAsNumber } = event.currentTarget
        setDraft(value)
        if (!commitOnBlur && Number.isFinite(valueAsNumber)) onChange(normalize(valueAsNumber))
      }}
      onBlur={(event) => {
        const { valueAsNumber } = event.currentTarget
        if (commitOnBlur && draft !== undefined && Number.isFinite(valueAsNumber)) onChange(normalize(valueAsNumber))
        setDraft(undefined)
      }}
      onKeyDown={(event) => {
        if (commitOnBlur && event.key === 'Enter' && !event.ctrlKey && !event.metaKey) event.currentTarget.blur()
      }}
    />
  )
  const field = (
    <label className={row ? 'field-row' : undefined} title={title}>
      <span>{label}</span>
      {suffix ? (
        <span className="suffix">
          {input} {suffix}
        </span>
      ) : (
        input
      )}
    </label>
  )
  if (!slider) return field
  return (
    <div className="slider-field">
      {field}
      <input
        id={'slider-' + id}
        type="range"
        data-number={id}
        aria-label={sliderLabel + t(' (Schieberegler)')}
        min={range.min ?? min}
        max={range.max ?? max}
        step={range.step ?? step}
        value={value ?? min}
        disabled={disabled || (range.max ?? max) <= (range.min ?? min)}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  )
}
