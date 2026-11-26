import { useTranslation } from 'react-i18next'
import type { Variant } from '../editor/generation.js'
import { emptyMargins } from '../editor/geometry.js'
import type { Notice } from '../types/editor.js'
import type { Frame, Stroke } from '../types/image.js'
import { maskStroke } from '../image/mask.js'
import { confirmDiscard } from '../settings/preferences.js'
import type { useDocument } from './useDocument.js'
import type { useVariants } from './useVariants.js'

type Inputs = {
  document: Pick<ReturnType<typeof useDocument>, 'work' | 'mask' | 'commit'>
  variants: Pick<ReturnType<typeof useVariants>, 'items' | 'index' | 'selected' | 'dispatch' | 'deselect'>
  adoptCreated: (frame: Frame, strokes?: Stroke[]) => void
  resetAfterReplace: () => void
  showVariantSeed: (seed: number) => void
  notice: Notice
}

export function useVariantActions({
  document,
  variants,
  adoptCreated,
  resetAfterReplace,
  showVariantSeed,
  notice
}: Inputs) {
  const { t } = useTranslation()
  const { work, mask, commit } = document
  const { items, index, selected: candidate, dispatch, deselect } = variants

  function select(index: number) {
    const variant = items[index]
    if (variant) showVariantSeed(variant.prepared.request.seed)
    dispatch({ type: 'select', index })
  }

  function movePreview(by: number) {
    if (!items.length) return
    select(index < 0 ? (by > 0 ? 0 : items.length - 1) : (index + by + items.length) % items.length)
  }

  function toggleCompare() {
    if (candidate?.prepared.source) dispatch({ type: 'compare' })
  }

  function clear() {
    if (confirmDiscard(t('Alle Vorschauen löschen?'))) dispatch({ type: 'clear' })
  }

  // Results built on a variant that was never adopted, such as text to image or a quick hires fix, replace the document.
  function standalone(variant: Variant) {
    const source = variant.prepared.source
    return !source || (source !== work?.image && variants.items.some((item) => item.frame === source))
  }

  // The detailer segmentation of the variant becomes the inpaint mask of the applied image.
  const segmentation = (variant: Variant) =>
    variant.mask && [maskStroke(variant.mask, variant.frame.w, variant.frame.h)]

  function apply() {
    if (candidate && standalone(candidate)) {
      adoptCreated(candidate.frame, segmentation(candidate))
      return
    }
    if (!candidate || !work) return
    if (
      candidate.prepared.source !== work.image &&
      !confirmDiscard(
        t('Diese Variante basiert auf einem früheren Arbeitsstand. Den aktuellen Stand durch die Vorschau ersetzen?')
      )
    )
      return
    const { x, y, w, h } = candidate.frame
    const sameBounds = x === work.image.x && y === work.image.y && w === work.image.w && h === work.image.h
    const segmented = segmentation(candidate)
    commit(
      {
        ...work,
        image: candidate.frame,
        drawing: undefined,
        strokes: segmented ?? (sameBounds ? work.strokes : []),
        margins: emptyMargins(),
        crop: sameBounds ? work.crop : undefined
      },
      sameBounds && !segmented ? mask : undefined
    )
    resetAfterReplace()
    deselect()
    if (segmented) notice('Die Segmentierungsmaske liegt unter „Ersetzen“ bereit.', true)
    else notice()
  }

  function setBaseline(image: Frame) {
    if (variants.items.some((variant) => variant.frame === image && standalone(variant))) {
      adoptCreated(image)
      return
    }
    if (!work || (image !== work.image && !variants.items.some((variant) => variant.frame === image))) return
    if (image === work.image && image === work.start && !work.strokes.length) {
      notice('Dieses Bild ist bereits das Startbild.', true)
      return
    }
    commit({ image, start: image, strokes: [], margins: emptyMargins() })
    resetAfterReplace()
    deselect()
    notice('Bild als Startbild gesetzt.', true)
  }

  return { select, movePreview, toggleCompare, clear, apply, setBaseline }
}
