import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useRef, useState, type Ref } from 'react'
import type { Variant } from '../../editor/generation.js'
import { sizeLabel } from '../../editor/geometry.js'
import { clearVariantsKey } from '../../editor/tools.js'
import type { Status } from '../../types/api.js'
import type { Frame } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { Thumbnail } from '../../ui/Thumbnail.js'

function VariantCard({
  item,
  index,
  selected,
  baseline,
  status,
  buttonRef,
  onSelect
}: {
  item: Variant
  index: number
  selected: boolean
  baseline: boolean
  status?: Status
  buttonRef?: Ref<HTMLButtonElement>
  onSelect: (index: number) => void
}) {
  const { t } = useTranslation()
  const run = item.prepared.request
  // The plain upscaler has no seed. Its variants show the result size instead.
  const detail = run.profile === 'upscale' ? sizeLabel(...run.size) + ' px' : 'Seed ' + run.seed
  const name = t('Variante ') + (index + 1) + ' · ' + detail
  const workflow = status?.profiles.find((p) => p.id === run.profile)
  const title = [
    name,
    (workflow?.name ?? run.profile) + ' · ' + sizeLabel(...run.size) + ' px',
    ...Object.entries(run.parameters).map(([key, val]) => t(workflow?.parameters[key]?.label ?? key) + ' ' + val),
    ...Object.values(run.models ?? {})
  ].join('\n')
  // Cards follow the image shape within limits, so very wide or tall results stay readable in the strip.
  const ratio = Math.min(2, Math.max(0.6, item.frame.w / item.frame.h))
  return (
    <Button
      className="variant-card"
      data-baseline={baseline}
      title={title}
      aria-label={name}
      aria-pressed={selected}
      aria-description={baseline ? t('Aktuelles Startbild') : undefined}
      style={{ aspectRatio: ratio }}
      ref={buttonRef}
      onClick={() => onSelect(index)}
    >
      <Thumbnail frame={item.frame} />
      <span className="variant-index" aria-hidden="true">
        {index + 1}
      </span>
      <span className="variant-detail">{detail}</span>
    </Button>
  )
}

/**
 * The open image that the next job starts from, pinned before the variants. A variant only becomes the source
 * through Apply or Set as starting image, so this card shows what Img2Img, Edit and Inpaint really use.
 */
function SourceCard({
  frame,
  shown,
  unused,
  onShow
}: {
  frame: Frame
  shown: boolean
  unused: boolean
  onShow: () => void
}) {
  const { t } = useTranslation()
  const ratio = Math.min(2, Math.max(0.6, frame.w / frame.h))
  return (
    <>
      <Button
        id="variant-source"
        className="variant-card variant-source"
        data-unused={unused || undefined}
        title={
          unused
            ? t('Quellbild · Erstellen ohne Img2Img verwendet es nicht')
            : t('Quellbild · Der nächste Job startet von diesem Bild')
        }
        aria-label={t('Quellbild anzeigen')}
        aria-pressed={shown}
        style={{ aspectRatio: ratio }}
        onClick={onShow}
      >
        <Thumbnail frame={frame} />
        <span className="variant-badge variant-source-badge">{t('Quelle')}</span>
        <span className="variant-detail">{sizeLabel(frame.w, frame.h)} px</span>
      </Button>
      <span className="variant-divider" aria-hidden="true" />
    </>
  )
}

/** Stands in for the variant that is being rendered, at the end of the strip. */
function PendingCard({ progress, preview }: { progress?: number; preview?: string }) {
  const { t } = useTranslation()
  // The card takes the shape of the live preview once the first frame arrives.
  const [ratio, setRatio] = useState(1)
  const percent = progress ? Math.round(progress * 100) : undefined
  return (
    <div
      id="variant-pending"
      className="variant-card variant-pending"
      role="status"
      aria-label={t('Variante wird erstellt')}
      data-preview={Boolean(preview) || undefined}
      style={{ aspectRatio: ratio }}
    >
      {preview && (
        <img
          src={preview}
          alt=""
          onLoad={(event) => {
            const { naturalWidth: w, naturalHeight: h } = event.currentTarget
            if (w && h) setRatio(Math.min(2, Math.max(0.6, w / h)))
          }}
        />
      )}
      <span className="variant-pending-label">{percent !== undefined ? percent + ' %' : t('Startet …')}</span>
      <progress max={1} value={progress ?? undefined} aria-hidden="true" />
    </div>
  )
}

export function VariantStrip({
  items,
  selected,
  index,
  compare,
  baseline,
  status,
  canReplay,
  onSelect,
  onCompare,
  onReplay,
  onRemove,
  onClear,
  onApply,
  quickUpscale,
  pending,
  source
}: {
  items: Variant[]
  selected?: Variant
  index: number
  compare: boolean
  baseline?: Frame
  status?: Status
  canReplay: boolean
  onSelect: (index: number) => void
  onCompare: () => void
  onReplay: () => void
  onRemove: () => void
  onClear: () => void
  onApply: () => void
  quickUpscale?: { label: string; disabled: boolean; run: () => void }
  /** Progress of a running generation, shown as a placeholder card. */
  pending?: { progress?: number; preview?: string }
  /** The open image the next job starts from. */
  source?: { frame: Frame; unused: boolean; shown: boolean; onShow: () => void }
}) {
  const { t } = useTranslation()
  const activeCard = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    activeCard.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected, items])
  const strip = useRef<HTMLDivElement>(null)
  const rendering = Boolean(pending)
  useLayoutEffect(() => {
    if (rendering) strip.current?.scrollTo({ left: strip.current.scrollWidth })
  }, [rendering])

  return (
    <section id="variants" className="variants" aria-label={t('Varianten')} hidden={!items.length && !pending}>
      <div className="variant-head">
        <div>
          <h2>{t('Varianten')}</h2>{' '}
          <span id="variant-counter" className="count">
            {selected ? index + 1 + ' / ' : ''}
            {items.length}
          </span>
          <Button
            id="clear-variants"
            className="icon quiet compact"
            icon="trash"
            title={`${t('Alle Vorschauen löschen')} (${clearVariantsKey.replace('Shift', t('Umschalt'))})`}
            aria-label={t('Alle Vorschauen löschen')}
            aria-keyshortcuts={clearVariantsKey}
            onClick={onClear}
          />
        </div>
        <div className="variant-actions">
          <div className="variant-group" role="group" aria-label={t('Ansicht')}>
            <Button
              id="compare"
              className="quiet compact"
              icon="split"
              aria-pressed={compare}
              title={t('Vorher/Nachher (V)')}
              disabled={!selected?.prepared.source}
              onClick={onCompare}
            >
              {' '}
              {t('Vorher / Nachher')}
            </Button>
          </div>
          <div className="variant-group" role="group" aria-label={t('Verwerfen')}>
            <Button
              id="replay"
              className="icon"
              icon="repeat"
              title={t('Mit diesen Einstellungen erneut ausführen')}
              aria-label={t('Mit diesen Einstellungen erneut ausführen')}
              disabled={!canReplay}
              onClick={onReplay}
            />
            <Button
              id="dismiss-preview"
              className="icon"
              icon="close"
              title={t('Arbeitsbild anzeigen (Esc)')}
              aria-label={t('Vorschau schließen')}
              disabled={!selected}
              onClick={() => onSelect(-1)}
            />
            <Button
              id="delete-variant"
              className="icon"
              icon="trash"
              title={t('Variante entfernen (Entf)')}
              aria-label={t('Variante entfernen')}
              disabled={!selected}
              onClick={onRemove}
            />
          </div>
          <div className="variant-group" role="group" aria-label={t('Übernehmen')}>
            {quickUpscale && (
              <Button
                id="quick-upscale"
                className="secondary compact"
                icon="upscale"
                title={t('Mit Seed, Prompt und Profil dieser Variante hochskalieren und Details nachrendern')}
                disabled={quickUpscale.disabled}
                onClick={quickUpscale.run}
              >
                {' '}
                {quickUpscale.label}
              </Button>
            )}
            <Button id="apply" className="primary compact" icon="check" disabled={!selected} onClick={onApply}>
              {' '}
              {t('Übernehmen')}
            </Button>
          </div>
        </div>
      </div>
      <div id="variant-strip" ref={strip} className="variant-strip" aria-label={t('Vorschläge auswählen')}>
        {source && (
          <SourceCard frame={source.frame} shown={source.shown} unused={source.unused} onShow={source.onShow} />
        )}
        {items.map((item, i) => (
          <VariantCard
            key={item.id}
            item={item}
            index={i}
            selected={i === index}
            baseline={baseline === item.frame}
            status={status}
            buttonRef={i === index ? activeCard : undefined}
            onSelect={onSelect}
          />
        ))}
        {pending && <PendingCard progress={pending.progress} preview={pending.preview} />}
      </div>
    </section>
  )
}
