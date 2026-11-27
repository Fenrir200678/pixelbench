import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '../settings/preferences.js'

type TimeOptions = { date?: boolean; seconds?: boolean }

/** Formats dates and times in the app language with the chosen 12- or 24-hour clock. */
export function useFormatTime() {
  const { i18n } = useTranslation()
  const { timeFormat } = usePreferences()
  return useMemo(() => {
    const twelve = timeFormat === '12h'
    const create = (date: boolean, seconds: boolean) =>
      new Intl.DateTimeFormat(i18n.language, {
        ...(date ? { day: '2-digit', month: '2-digit', year: '2-digit' } : {}),
        hour: twelve ? 'numeric' : '2-digit',
        minute: '2-digit',
        ...(seconds ? { second: '2-digit' } : {}),
        hourCycle: twelve ? 'h12' : 'h23'
      })
    // Long lists such as the console reuse these instead of building a formatter per line.
    const formatters = {
      time: create(false, false),
      seconds: create(false, true),
      date: create(true, false),
      dateSeconds: create(true, true)
    }
    return (value: Date | number | string, { date = false, seconds = false }: TimeOptions = {}) =>
      formatters[date ? (seconds ? 'dateSeconds' : 'date') : seconds ? 'seconds' : 'time'].format(new Date(value))
  }, [i18n.language, timeFormat])
}
