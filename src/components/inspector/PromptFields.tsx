import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasWeights } from '../../editor/promptWeights.js'
import { messageOf } from '../../helpers/async.js'
import type { Notice } from '../../types/editor.js'
import type { Frame, ReferenceImage } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { Icon } from '../../ui/Icon.js'
import { Thumbnail } from '../../ui/Thumbnail.js'
import { WeightedTextarea } from './WeightedTextarea.js'

export function PromptFields({
  value,
  onChange,
  canRefine,
  refining,
  onRefine,
  notice,
  placeholder,
  negative,
  onNegative,
  negativeInactive,
  image,
  imageName,
  references,
  limit,
  onAdd,
  onDrop,
  onRemove,
  weights,
  weightRange
}: {
  /** on: the model reads prompt weights. off: it ignores them. missing: it needs the KJNodes node. */
  weights: 'on' | 'off' | 'missing'
  weightRange: [number, number]
  value: string
  onChange: (value: string) => void
  canRefine: boolean
  refining: boolean
  onRefine?: (value: string) => Promise<string | undefined>
  notice: Notice
  placeholder: string
  negative?: string
  onNegative: (value: string) => void
  negativeInactive: boolean
  image?: Frame
  imageName: string
  references: ReferenceImage[]
  limit: number
  onAdd: () => void
  onDrop: (files: File[]) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const suggestions = useRef<HTMLDivElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const [query, setQuery] = useState<{ start: number; end: number; text: string }>()
  const [active, setActive] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [proposal, setProposal] = useState<{ original: string; text: string; image?: Frame }>()
  const currentProposal = proposal?.original === value && proposal.image === image ? proposal.text : undefined
  const weightMode = weights === 'on' ? 'on' : 'off'
  const weightNote =
    weights !== 'on' && (hasWeights(value) || hasWeights(negative ?? ''))
      ? t(
          weights === 'missing'
            ? 'Gewichtungen brauchen ComfyUI-KJNodes und werden beim Senden entfernt.'
            : 'Dieses Modell ignoriert Gewichtungen, sie werden beim Senden entfernt.'
        )
      : undefined

  async function refine() {
    if (!onRefine) return
    setProposal(undefined)
    notice()
    try {
      const text = await onRefine(value)
      if (text) setProposal({ original: value, text, image })
    } catch (error) {
      notice(messageOf(error))
    }
  }

  function applyProposal(text: string) {
    setProposal(undefined)
    textarea.current?.focus()
    if (text !== value) {
      pendingCursor.current = text.length
      onChange(text)
    }
  }
  const images =
    image && limit
      ? [
          { id: 'source', frame: image, name: t('Aktuelles Startbild') + ' · ' + imageName },
          ...references.slice(0, limit)
        ]
      : []
  const options = images
    .map((item, i) => ({ ...item, tag: `<image${i + 1}>` }))
    .filter((item) => !query || item.tag.startsWith('<' + query.text))
  const expanded = Boolean(query && options.length)
  const selected = Math.min(active, Math.max(0, options.length - 1))

  useLayoutEffect(() => {
    if (expanded) suggestions.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [expanded, selected])

  useLayoutEffect(() => {
    if (pendingCursor.current === null) return
    textarea.current?.focus()
    textarea.current?.setSelectionRange(pendingCursor.current, pendingCursor.current)
    pendingCursor.current = null
  }, [value])

  function suggest(input: HTMLTextAreaElement) {
    const end = input.selectionStart
    const match =
      input.selectionStart === input.selectionEnd && /<(image\d*|imag|ima|im|i|)$/.exec(input.value.slice(0, end))
    setQuery(match ? { start: end - match[0].length, end, text: match[1] } : undefined)
    setActive(0)
  }

  function insert(tag: string) {
    if (!query) return
    const next = value.slice(0, query.start) + tag + value.slice(query.end)
    if (next.length > 16000) return
    pendingCursor.current = query.start + tag.length
    onChange(next)
    setQuery(undefined)
  }

  return (
    <>
      <CollapsibleSection id="prompt-settings" title={t('Anweisung')}>
        <label className="sr-only" htmlFor="prompt">
          {t('Positiver Prompt')}
        </label>
        <div className="prompt-input">
          <WeightedTextarea
            ref={textarea}
            id="prompt"
            rows={4}
            maxLength={16000}
            placeholder={placeholder}
            value={value}
            mode={weightMode}
            range={weightRange}
            aria-autocomplete="list"
            aria-controls={expanded ? 'image-suggestions' : undefined}
            aria-activedescendant={expanded ? `image-option-${selected}` : undefined}
            aria-describedby={weightNote ? 'weight-note' : undefined}
            onChange={(next, input) => {
              setProposal(undefined)
              onChange(next)
              suggest(input)
            }}
            onClick={(event) => suggest(event.currentTarget)}
            onKeyUp={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) suggest(event.currentTarget)
            }}
            onBlur={() => setQuery(undefined)}
            onKeyDown={(event) => {
              if (!expanded || event.nativeEvent.isComposing) return
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
                event.preventDefault()
                event.stopPropagation()
                if (event.key === 'Escape') setQuery(undefined)
                else if (event.key === 'Enter') insert(options[selected].tag)
                else setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
              } else if (event.key === 'Tab') setQuery(undefined)
            }}
          />
          {expanded && (
            <div
              ref={suggestions}
              id="image-suggestions"
              className="image-suggestions"
              role="listbox"
              aria-label={t('Bildreferenzen')}
            >
              {options.map((item, i) => (
                <div
                  id={`image-option-${i}`}
                  key={item.id}
                  role="option"
                  aria-selected={selected === i}
                  className="image-suggestion"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insert(item.tag)
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <Thumbnail frame={item.frame} />
                  <span>
                    <strong>{item.tag}</strong>
                    <small>{item.name}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {weightNote && (
          <small id="weight-note" className="field-note">
            {weightNote}
          </small>
        )}
        {(canRefine || refining) && (
          <div className="prompt-refinement">
            <Button
              className="quiet compact"
              icon="edit"
              aria-busy={refining}
              disabled={refining || !onRefine || !value.trim()}
              onClick={refine}
            >
              {t(refining ? 'Prompt wird verbessert …' : 'Prompt verbessern')}
            </Button>
            {currentProposal && (
              <div className="prompt-proposal">
                <p>{currentProposal}</p>
                <div className="prompt-proposal-actions">
                  <Button className="quiet compact" onClick={() => setProposal(undefined)}>
                    {t('Verwerfen')}
                  </Button>
                  <Button className="secondary compact" icon="check" onClick={() => applyProposal(currentProposal)}>
                    {t('Übernehmen')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {negative !== undefined && (
          <label id="negative-row" className="stack">
            <span>{t('Negativprompt')}</span>
            <WeightedTextarea
              id="negative"
              rows={2}
              maxLength={16000}
              placeholder={t('Optional')}
              disabled={negativeInactive}
              aria-describedby={negativeInactive ? 'negative-note' : undefined}
              value={negative}
              mode={weightMode}
              range={weightRange}
              onChange={onNegative}
            />
            {negativeInactive && (
              <small id="negative-note" className="field-note">
                {t('Der Negativprompt wirkt bei CFG über 1.')}
              </small>
            )}
          </label>
        )}
      </CollapsibleSection>
      {limit > 0 && (
        <details
          id="reference-settings"
          className="section reference-area collapsible-section"
          open
          data-dragging={dragging}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = references.length < limit ? 'copy' : 'none'
            setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDragging(false)
            onDrop(Array.from(event.dataTransfer.files).slice(0, Math.max(0, limit - references.length)))
          }}
        >
          <summary>
            <h2>{t('Referenz')}</h2>
            <span className="reference-count">
              {images.length} / {limit + 1}
            </span>
            <Icon name="chevron" />
          </summary>
          <div className="section-content">
            <div className="reference-grid">
              {images.map((item, i) => (
                <div key={item.id} className="reference-card" title={item.name}>
                  <Thumbnail frame={item.frame} />
                  <code>{`<image${i + 1}>`}</code>
                  <span>{i === 0 ? t('Startbild') : item.name}</span>
                  {i > 0 && (
                    <Button
                      className="reference-remove icon compact"
                      icon="close"
                      aria-label={t('Referenzbild entfernen') + ` <image${i + 1}>`}
                      onClick={() => onRemove(item.id)}
                    />
                  )}
                </div>
              ))}
            </div>
            <Button
              id="ref-add"
              className="reference-add quiet compact"
              icon="plus"
              onClick={onAdd}
              disabled={references.length >= limit || !image}
            >
              {t('Referenzbilder hinzufügen')}
            </Button>
            <p className="field-note">{t('Bilder hierher ziehen · < im Prompt für Bildauswahl')}</p>
          </div>
        </details>
      )}
    </>
  )
}
