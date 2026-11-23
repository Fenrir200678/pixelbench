import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import type { Vram } from '../types/api.js'

const interval = 2000
const gigabyte = 1024 ** 3
const unavailable: Vram = { available: false }

/** Polls the GPU memory while the backend is ready and the tab is visible. */
function useVram(enabled: boolean) {
  const [vram, setVram] = useState<Vram>(unavailable)
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer = 0
    const poll = async () => {
      if (document.visibilityState !== 'hidden') {
        const next = await api<Vram>('/api/vram').catch(() => unavailable)
        if (stopped) return
        setVram(next)
      }
      timer = window.setTimeout(poll, interval)
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      setVram(unavailable)
    }
  }, [enabled])
  return enabled ? vram : unavailable
}

/** Live VRAM usage in the status bar: ComfyUI's share and the rest of the system. */
export function VramMeter({ enabled }: { enabled: boolean }) {
  const { t, i18n } = useTranslation()
  const vram = useVram(enabled)
  if (!vram.available) return null

  const used = Math.max(0, vram.total - vram.free)
  const comfy = Math.min(vram.reserved, used)
  const other = used - comfy
  const ratio = used / vram.total
  const level = ratio >= 0.95 ? 'critical' : ratio >= 0.85 ? 'high' : 'normal'
  const format = (bytes: number, digits = 1) =>
    (bytes / gigabyte).toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const percent = (bytes: number) => (bytes / vram.total) * 100 + '%'
  const title = [
    vram.name,
    t('ComfyUI: {{value}} GB', { value: format(comfy) }),
    t('Andere Programme: {{value}} GB', { value: format(other) }),
    t('Frei: {{value}} GB', { value: format(vram.free) })
  ].join('\n')

  return (
    <div
      id="vram-meter"
      className="vram-meter"
      data-level={level}
      role="meter"
      aria-label={t('VRAM-Belegung')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={t('{{used}} von {{total}} GB belegt', { used: format(used), total: format(vram.total, 0) })}
      title={title}
    >
      <span className="vram-label">VRAM</span>
      <span className="vram-bar" aria-hidden="true">
        <span className="vram-comfy" style={{ width: percent(comfy) }} />
        <span className="vram-other" style={{ width: percent(other) }} />
      </span>
      <span className="vram-value">
        {format(used)}
        <span className="vram-total"> / {format(vram.total, 0)}</span> GB
      </span>
    </div>
  )
}
