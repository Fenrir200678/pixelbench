/** True on macOS, where ⌘ takes the place of Ctrl in shortcuts. The shortcut handlers accept both keys. */
export const isMac = /mac/i.test(navigator.platform || navigator.userAgent)

/** The label of the shortcut modifier: ⌘ on macOS, otherwise Strg (Ctrl in English). */
export const modKey = (t: (key: string) => string) => (isMac ? '⌘' : t('Strg'))
