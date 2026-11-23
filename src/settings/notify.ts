import i18n from '../i18n/index.js'
import { getPreferences } from './preferences.js'

export type RunOutcome = 'complete' | 'cancelled' | 'error'

export const notificationsSupported = () => typeof Notification !== 'undefined'

/** Asks the browser for permission. Resolves with whether notifications may be shown. */
export async function requestNotifications() {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

let audio: AudioContext | undefined

/** A short two-note chime: rising when done, falling after an error. */
export function playChime(outcome: 'complete' | 'error') {
  try {
    audio ??= new AudioContext()
    const notes = outcome === 'complete' ? [660, 990] : [440, 330]
    const start = audio.currentTime + 0.02
    notes.forEach((frequency, index) => {
      const at = start + index * 0.14
      const oscillator = audio!.createOscillator()
      const gain = audio!.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.12, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
      oscillator.connect(gain).connect(audio!.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.32)
    })
  } catch {
    // Without audio output the run still ends normally.
  }
}

/** Tells the user that a run ended, as chosen in the settings. Cancelled runs stay silent. */
export function announceRunEnd(outcome: RunOutcome) {
  if (outcome === 'cancelled') return
  const { soundDone, notifyDone } = getPreferences()
  if (soundDone) playChime(outcome)
  // A visible tab already shows the result.
  if (!notifyDone || !document.hidden || !notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification(
      outcome === 'complete' ? i18n.t('Generierung abgeschlossen') : i18n.t('Generierung fehlgeschlagen'),
      {
        body:
          outcome === 'complete' ? i18n.t('Die neue Variante ist bereit.') : i18n.t('Details stehen in der Konsole.'),
        tag: 'pixelbench-run'
      }
    )
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}
