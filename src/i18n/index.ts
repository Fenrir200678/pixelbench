import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readStoredValue } from '../helpers/storage.js'
import { bridgeGerman } from './bridgeGerman.js'
import { english } from './messages.js'
import { settingsEnglish } from './settingsMessages.js'

const storageKey = 'pixelbench-language'
const documentTitle = document.title
// English by default. German stays available and is remembered once chosen.
let initialLanguage = 'en'
try {
  if (readStoredValue(storageKey) === 'de') initialLanguage = 'de'
} catch {
  // The default language remains available when storage is blocked.
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: bridgeGerman }, en: { translation: { ...english, ...settingsEnglish } } },
  lng: initialLanguage,
  // Keys are source text in either language, so a missing key is shown as written, never in the other language.
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }
})

function updateDocumentLanguage(language: string) {
  document.documentElement.lang = language
  document.title = i18n.t(documentTitle)
}

i18n.on('languageChanged', (language) => {
  updateDocumentLanguage(language)
  try {
    localStorage.setItem(storageKey, language)
  } catch {
    // Language switching still works for the current session.
  }
})
updateDocumentLanguage(i18n.language)

export default i18n
