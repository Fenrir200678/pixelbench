import { useTranslation } from 'react-i18next'
import type { Workflow } from '../../hooks/useWorkflow.js'
import type { Profile, Value } from '../../types/api.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { NumberField } from '../../ui/NumberField.js'

const renderLabels = { steps: 'Steps', cfg: 'CFG', denoise: 'Denoising Strength' }
const samplingLabels = { sampler: 'Sampler', scheduler: 'Scheduler' }
const knownKeys = [...Object.keys(renderLabels), ...Object.keys(samplingLabels)]
const knownLabels = [...Object.values(renderLabels), ...Object.values(samplingLabels)]

function FixedRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  return (
    <div className="field-row">
      <span>{t(label)}</span>
      <span className="fixed">{t(value)}</span>
    </div>
  )
}

export function ParameterRow({ workflow, name, label }: { workflow: Workflow; name: string; label: string }) {
  const { profile, parameters, updateParameter } = workflow
  const field = profile?.parameters[name]
  const fixed = profile?.fixed ?? {}
  if (!profile || !field) return fixed[label] ? <FixedRow label={label} value={fixed[label]} /> : null
  return (
    <ParameterInput
      id={'parameter-' + name}
      profile={profile}
      name={name}
      value={parameters[name] ?? field.default}
      onChange={(next) => updateParameter(name, next)}
    />
  )
}

/** One profile parameter as a slider or a list, for values that do not live in the workflow such as detailer overrides. */
export function ParameterInput({
  id,
  profile,
  name,
  value,
  onChange
}: {
  id: string
  profile: Profile
  name: string
  value: Value
  onChange: (value: Value) => void
}) {
  const { t } = useTranslation()
  const field = profile.parameters[name]
  if (!field) return null
  if (typeof field.default === 'number') {
    return (
      <NumberField
        id={id}
        label={t(field.label)}
        title={field.hint ? t(field.hint) : undefined}
        value={Number(value)}
        min={field.min ?? 0}
        max={field.max ?? Number.MAX_SAFE_INTEGER}
        step={field.step}
        row
        slider
        onChange={onChange}
      />
    )
  }
  const choices = profile.choices[name]
  const options = choices?.length ? choices : [field.default]
  return (
    <label className="field-row">
      <span>{t(field.label)}</span>
      <Combobox
        id={id}
        value={String(value)}
        options={(name === 'sampler' ? [...options].sort((a, b) => a.localeCompare(b)) : options).map((option) => ({
          value: option
        }))}
        onChange={onChange}
      />
    </label>
  )
}

/** Sampler and scheduler in their own section, since they change often between runs. */
export function SamplingFields({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, parameters } = workflow
  const entries = Object.entries(samplingLabels).filter(
    ([key, label]) => profile?.parameters[key] || profile?.fixed?.[label]
  )
  if (!entries.length) return null
  const summary = entries
    // A fixed value comes with a long explanation, which stays in the expanded row.
    .map(([key]) => (profile?.parameters[key] ? (parameters[key] ?? profile.parameters[key].default) : t('fest')))
    .filter(Boolean)
    .join(' · ')
  return (
    <CollapsibleSection id="sampling-settings" title={t('Sampling')} summary={summary}>
      <div className="sampling-fields" key={profile?.id}>
        {entries.map(([key, label]) => (
          <ParameterRow key={key} workflow={workflow} name={key} label={label} />
        ))}
      </div>
    </CollapsibleSection>
  )
}

export function RenderFields({ workflow }: { workflow: Workflow }) {
  const { t } = useTranslation()
  const { profile, parameters, prefs, seedValue, toggleSeed, updatePrefs } = workflow
  const fields = profile?.parameters ?? {}
  const fixed = profile?.fixed ?? {}
  const locked = prefs.seedMode === 'fixed'
  const seedTitle = locked ? t('Seed freigeben') : t('Seed fixieren')
  // Fixed steps read like "8 · aus der Sigma-Kurve", so the leading number is the count.
  const fixedSteps = parseInt(fixed.Steps ?? '')
  const steps = fields.steps
    ? Number(parameters.steps ?? fields.steps.default)
    : Number.isFinite(fixedSteps)
      ? fixedSteps
      : undefined
  const summary = [
    steps !== undefined && t('{{count}} Steps', { count: steps }),
    locked && seedValue !== undefined ? t('Seed {{seed}}', { seed: seedValue }) : t('Seed zufällig')
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <CollapsibleSection id="render-settings" title={t('Render')} summary={summary}>
      <div id="parameters" key={profile?.id}>
        {Object.entries(renderLabels).map(([key, label]) => (
          <ParameterRow key={key} workflow={workflow} name={key} label={label} />
        ))}
        {Object.keys(fields)
          .filter((key) => !knownKeys.includes(key) && !fields[key].section)
          .map((key) => (
            <ParameterRow key={key} workflow={workflow} name={key} label={fields[key].label} />
          ))}
        {Object.keys(fixed)
          .filter((label) => !knownLabels.includes(label))
          .map((label) => (
            <FixedRow key={label} label={label} value={fixed[label]} />
          ))}
        <div id="seed-row" className="locked-field">
          <NumberField
            id="seed"
            label="Seed"
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            value={seedValue}
            placeholder={t('Zufällig')}
            disabled={!locked}
            row
            onChange={(seed) => updatePrefs({ seed })}
          />
          <Button
            id="seed-lock"
            className="icon"
            icon={locked ? 'lock' : 'lock-open'}
            aria-label={t('Seed fixieren')}
            aria-pressed={locked}
            title={seedTitle}
            onClick={toggleSeed}
          />
        </div>
        {workflow.varianceAvailable && (
          <NumberField
            id="seed-variance"
            label={t('Variation')}
            title={t(
              'Verrauscht den Prompt in den ersten Schritten abhängig vom Seed. 0 aus, 1 empfohlen, höher variiert stärker und folgt dem Prompt weniger. Gleicher Seed, gleiches Bild.'
            )}
            value={Number(prefs.variance) || 0}
            min={0}
            max={5}
            step={0.25}
            row
            slider
            onChange={(variance) => updatePrefs({ variance })}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}
