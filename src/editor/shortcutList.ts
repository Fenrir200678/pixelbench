import {
  applyVariantKey,
  canvasKeys,
  clearVariantsKey,
  consoleKey,
  exportKey,
  newImageKey,
  toggleVariantsKey,
  toolNames,
  tools
} from './tools.js'

/** One row of the shortcut overview. keys: alternatives, each written like "Ctrl+Z". */
export type ShortcutEntry = { label: string; keys: string[] }
export type ShortcutGroup = { title: string; items: ShortcutEntry[] }

// Labels are German message keys, translated where they are shown. useShortcuts.ts handles the keys.
export const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Modi',
    items: toolNames.map((tool) => ({ label: tools[tool].title, keys: [tools[tool].key] }))
  },
  {
    title: 'Datei und Verlauf',
    items: [
      { label: 'Generieren', keys: ['Ctrl+Enter'] },
      { label: 'Bild öffnen', keys: ['Ctrl+O'] },
      { label: 'Exportieren', keys: ['Ctrl+S', exportKey] },
      { label: 'Neues Bild', keys: [newImageKey] },
      { label: 'Rückgängig', keys: ['Ctrl+Z'] },
      { label: 'Wiederholen', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'] }
    ]
  },
  {
    title: 'Prompt',
    items: [{ label: 'Gewichtung erhöhen oder senken', keys: ['Ctrl+ArrowUp', 'Ctrl+ArrowDown'] }]
  },
  {
    title: 'Leinwand',
    items: [
      { label: 'Hand', keys: [canvasKeys.hand, 'Space'] },
      { label: 'Generierungsrahmen verschieben und skalieren', keys: [canvasKeys.frame] },
      { label: 'Pinsel', keys: [canvasKeys.brush] },
      { label: 'Maskenpinsel', keys: [canvasKeys.maskBrush] },
      { label: 'Radierer', keys: [canvasKeys.eraser] },
      { label: 'Pinselgröße', keys: [canvasKeys.smallerBrush, canvasKeys.largerBrush] },
      { label: 'Maske ein- oder ausblenden', keys: [canvasKeys.mask] },
      { label: 'Maske leeren', keys: [canvasKeys.clearMask] },
      { label: 'Als Startbild setzen', keys: [canvasKeys.baseline] },
      { label: 'Bildanpassungen ein- oder ausblenden', keys: [canvasKeys.adjust] },
      { label: 'Vorschau der Bildanpassungen ein- oder ausblenden', keys: ['V'] },
      { label: 'Vergrößern', keys: [canvasKeys.zoomIn] },
      { label: 'Verkleinern', keys: [canvasKeys.zoomOut] },
      { label: 'Auf 100 % zoomen', keys: [canvasKeys.zoomActual] },
      { label: 'Ansicht einpassen', keys: [canvasKeys.fit] }
    ]
  },
  {
    title: 'Varianten',
    items: [
      { label: 'Vorherige oder nächste Variante', keys: ['ArrowLeft', 'ArrowRight'] },
      { label: 'Vorher und nachher vergleichen', keys: ['V'] },
      { label: 'Variante als Arbeitsbild übernehmen', keys: [applyVariantKey] },
      { label: 'Variante entfernen', keys: ['Delete'] },
      { label: 'Alle Vorschauen löschen', keys: [clearVariantsKey] },
      { label: 'Variantenleiste ein- oder ausblenden', keys: [toggleVariantsKey] },
      { label: 'Auswahl aufheben', keys: ['Escape'] }
    ]
  },
  {
    title: 'Ansicht',
    items: [{ label: 'Backend-Konsole', keys: [consoleKey] }]
  }
]
