import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { Generation, RunHistory } from '../hooks/useGeneration.js'
import { readStorage, writeStorage } from '../helpers/storage.js'
import { appMessage } from '../i18n/appMessages.js'
import type { Job } from '../types/api.js'
import type { NoticeValues } from '../types/editor.js'
import { Button } from '../ui/Button.js'
import { Icon } from '../ui/Icon.js'

// "1.2 it/s · ~3 s left" while a sampler reports steps. Slow samplers read better as seconds per step.
function useStepDetail(step?: Job['step']) {
  const { t, i18n } = useTranslation()
  if (!step?.rate) return ''
  const number = (value: number, digits = 1) =>
    value.toLocaleString(i18n.language, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  const speed = step.rate >= 1 ? number(step.rate) + ' it/s' : number(1 / step.rate) + ' s/it'
  const left = Math.max(0, Math.ceil((step.max - step.value) / step.rate))
  return speed + ' · ' + t('noch ~{{seconds}} s', { seconds: left })
}

const historyKey = 'pixelbench-run-history-open-v1'
const stateLabels: Record<RunHistory['state'], string> = {
  running: 'Läuft',
  complete: 'Fertig',
  cancelled: 'Abgebrochen',
  error: 'Fehler'
}

/** Phases of the latest run. Opens upwards above the Generate button and stays available after the run. */
function RunTimeline({ history }: { history: RunHistory }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(() => readStorage(historyKey, false))
  const seconds = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s'
  const total = history.phases.reduce((sum, phase) => sum + phase.seconds, 0)
  const longest = Math.max(...history.phases.map((phase) => phase.seconds), 0.001)
  function toggle() {
    setOpen(!open)
    writeStorage(historyKey, !open)
  }
  return (
    <div className="run-history" data-open={open || undefined}>
      {open && (
        <ol id="run-history-list" className="run-history-list">
          {history.phases.map((phase, index) => (
            <li key={index} data-note={phase.seconds === 0 || undefined}>
              <span className="run-phase-label">
                {appMessage(phase.label)}
                {phase.note && <small>{phase.note}</small>}
              </span>
              {phase.seconds > 0 && <span className="run-phase-time">{seconds(phase.seconds)}</span>}
              {phase.seconds > 0 && (
                <span className="run-phase-bar" style={{ width: (phase.seconds / longest) * 100 + '%' }} />
              )}
            </li>
          ))}
          {!history.phases.length && <li className="run-history-empty">{t('Noch keine Schritte.')}</li>}
        </ol>
      )}
      <button
        id="run-history-toggle"
        type="button"
        className="run-history-toggle"
        aria-expanded={open}
        aria-controls={open ? 'run-history-list' : undefined}
        onClick={toggle}
      >
        <Icon name="chevron" />
        <span>{t('Ablauf des letzten Jobs')}</span>
        <span className="run-history-summary" data-state={history.state}>
          {t(stateLabels[history.state])}
          {total > 0 && ' · ' + seconds(total)}
        </span>
      </button>
    </div>
  )
}

export function RunPanel({
  generation,
  notice,
  disabled,
  title,
  onRun
}: {
  generation: Generation
  notice?: { message: string; good: boolean; values?: NoticeValues }
  disabled: boolean
  title: string
  onRun: () => void
}) {
  const { t } = useTranslation()
  const { running, progress, history, refining, cancelling, cancel } = generation
  const detail = useStepDetail(progress?.step)
  return (
    <div className="run-panel">
      <div id="notice" className={'notice' + (notice?.good ? ' good' : '')} role="status" hidden={!notice}>
        {notice && appMessage(notice.message, notice.values)}
      </div>
      {history && <RunTimeline history={history} />}
      <div id="progress" className="progress" role="status" hidden={!running}>
        <div>
          <span id="job-state">{appMessage(progress?.message ?? 'Bereite vor …')}</span>
          <span id="job-percent">
            {!refining && progress?.progress ? Math.round(progress.progress * 100) + ' %' : ''}
          </span>
        </div>
        {detail && (
          <small id="job-detail" className="job-detail">
            {detail}
          </small>
        )}
        <progress
          id="job-progress"
          aria-labelledby="job-state"
          max={1}
          value={refining ? undefined : (progress?.progress ?? 0)}
        />
      </div>
      <Button
        id="generate"
        className="primary generate"
        icon="edit"
        title={title}
        disabled={disabled}
        hidden={running}
        onClick={onRun}
      >
        <span>{t('Generieren')}</span>
        <kbd>{t('Strg ↵')}</kbd>
      </Button>
      <Button
        id="cancel"
        className="secondary generate"
        icon="close"
        hidden={!running}
        disabled={cancelling}
        onClick={cancel}
      >
        {t('Abbrechen')}
      </Button>
    </div>
  )
}
