import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasWeights } from '../../editor/promptWeights.js'
import { messageOf } from '../../helpers/async.js'
import { usePromptHistory, type PromptEntry } from '../../settings/promptHistory.js'
import type { Notice } from '../../types/editor.js'
import type { Frame, ReferenceImage } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { Icon } from '../../ui/Icon.js'
import { Thumbnail } from '../../ui/Thumbnail.js'
import { PromptHistory } from './PromptHistory.js'
import { WeightedTextarea } from './WeightedTextarea.js'

const referenceDrag = 'application/x-pixelbench-reference'

export function PromptFields({
  value,
  onChange,
  canRefine,
  refineEmpty,
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
  onMove,
  onReplace,
  weights,
  weightRange
}: {
  /** on: the model reads prompt weights. off: it ignores them. missing: it needs the KJNodes node. */
  weights: 'on' | 'off' | 'missing'
  weightRange: [number, number]
  value: string
  onChange: (value: string) => void
  canRefine: boolean
  /** The refinement can write a prompt from an empty field. */
  refineEmpty?: boolean
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
  onMove: (from: string, to: string) => void
  onReplace: (id: string, file: File) => void
}) {
  const { t } = useTranslation()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const suggestions = useRef<HTMLDivElement>(null)
  const pendingCursor = useRef<number | null>(null)
  const [query, setQuery] = useState<{ start: number; end: number; text: string }>()
  const [active, setActive] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState<string>()
  /** Reference count before the last removal; the notice shows until a reference is added again. */
  const [removedFrom, setRemovedFrom] = useState(0)
  const [proposal, setProposal] = useState<{ original: string; text: string; image?: Frame }>()
  const historyEnabled = usePromptHistory()?.enabled === true
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
  // A stored negative prompt replaces the current one; an entry without one leaves the field alone.
  function applyHistory(entry: PromptEntry) {
    applyProposal(entry.prompt)
    if (negative !== undefined && entry.negative) onNegative(entry.negative)
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
      <CollapsibleSection
        id="prompt-settings"
        title={t('Anweisung')}
        summary={value.replace(/\s+/g, ' ').trim() || t('Kein Prompt')}
      >
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
        {(canRefine || refining || historyEnabled) && (
          <div className="prompt-refinement">
            <div className="prompt-actions">
              {historyEnabled && <PromptHistory onApply={applyHistory} notice={notice} />}
              {(canRefine || refining) && (
                <Button
                  className="quiet compact"
                  icon="edit"
                  aria-busy={refining}
                  disabled={refining || !onRefine || (!value.trim() && !refineEmpty)}
                  onClick={refine}
                >
                  {t(refining ? 'Prompt wird verbessert …' : 'Prompt verbessern')}
                </Button>
              )}
            </div>
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
                <div
                  key={item.id}
                  className="reference-card"
                  title={item.name}
                  draggable={i > 0}
                  data-target={dropTarget === item.id}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(referenceDrag, item.id)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    if (i === 0) return
                    const types = event.dataTransfer.types
                    if (!types.includes('Files') && !types.includes(referenceDrag)) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move'
                    setDropTarget(item.id)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined)
                  }}
                  onDragEnd={() => setDropTarget(undefined)}
                  onDrop={(event) => {
                    if (i === 0) return
                    event.preventDefault()
                    event.stopPropagation()
                    setDropTarget(undefined)
                    setDragging(false)
                    const from = event.dataTransfer.getData(referenceDrag)
                    const file = event.dataTransfer.files[0]
                    if (from) onMove(from, item.id)
                    else if (file) onReplace(item.id, file)
                  }}
                >
                  <Thumbnail frame={item.frame} />
                  <code>{`<image${i + 1}>`}</code>
                  <span>{i === 0 ? t('Startbild') : item.name}</span>
                  {i > 0 && (
                    <Button
                      className="reference-remove icon compact"
                      icon="close"
                      aria-label={t('Referenzbild entfernen') + ` <image${i + 1}>`}
                      onClick={() => {
                        setRemovedFrom(references.length)
                        onRemove(item.id)
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            {references.length < removedFrom && (
              <p className="field-note reference-notice" role="status">
                {t('Referenz entfernt. Die Bildverweise im Prompt bleiben unverändert.')}
              </p>
            )}
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
