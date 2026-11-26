import { useTranslation } from 'react-i18next'
import { useState, type ReactNode } from 'react'
import { isMainModel, modelKey } from '../../editor/models.js'
import { tools } from '../../editor/tools.js'
import { readStorage, writeStorage } from '../../helpers/storage.js'
import type { BackgroundRemoval } from '../../hooks/useBackgroundRemoval.js'
import type { Detailer } from '../../hooks/useDetailer.js'

import type { Workflow } from '../../hooks/useWorkflow.js'
import type { Status } from '../../types/api.js'
import type { Notice, Tool, Work } from '../../types/editor.js'
import type { Margins, Rect, ReferenceImage } from '../../types/image.js'
import { Button } from '../../ui/Button.js'
import { Combobox } from '../../ui/Combobox.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { setAllSections, useAnySectionOpen } from '../../ui/sectionState.js'
import { BackgroundFields } from './BackgroundFields.js'
import { DetailerFields } from './DetailerFields.js'
import { MetadataFields, type MetadataView } from './MetadataFields.js'
import { ModelFields, ProfileNote } from './ModelFields.js'
import { SizeFields } from './GeometryFields.js'
import type { SourceSwitch } from './CreateSizeFields.js'
import { MaskFields } from './MaskFields.js'
import { LoraFields } from './LoraFields.js'
import { ModelToggleSections } from './ModelToggle.js'
import { HiresFields, UpscaleFields } from './UpscaleFields.js'
import { PromptFields } from './PromptFields.js'
import { RenderFields, SamplingFields } from './RenderFields.js'

const refinementModelKey = 'pixelbench-refinement-model-v1'

export function Inspector({
  tool,
  status,
  workflow,
  onRefine,
  refining,
  onReload,
  reloading,
  references,
  imageName,
  onDropReferences,
  onReference,
  onRemoveReference,
  onMoveReference,
  onReplaceReference,
  work,
  opacity,
  onOpacity,
  onMargins,
  onCrop,
  notice,
  canHiresImage,
  onHiresImage,
  detailer,
  metadata,
  sourceSwitch,
  canDetailImage,
  onDetailImage,
  background,
  children
}: {
  tool: Tool
  status?: Status
  workflow: Workflow
  onRefine?: (prompt: string, tool: Tool, profile?: string, model?: string) => Promise<string | undefined>
  refining: boolean
  onReload: () => void
  reloading: boolean
  references: ReferenceImage[]
  imageName: string
  onDropReferences: (files: File[]) => void
  onReference: () => void
  onRemoveReference: (id: string) => void
  onMoveReference: (from: string, to: string) => void
  onReplaceReference: (id: string, file: File) => void
  work?: Work
  opacity: number
  onOpacity: (value: number) => void
  onMargins: (value: Margins) => void
  onCrop: (value?: Rect) => void
  notice: Notice
  canHiresImage: boolean
  onHiresImage: () => void
  detailer: Detailer
  metadata: MetadataView
  /** Set while a variant is shown that is not the source image of the next job. */
  sourceSwitch?: SourceSwitch
  canDetailImage: boolean
  onDetailImage: () => void
  background: BackgroundRemoval
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { prompt } = tools[tool]
  const profile = workflow.profile
  const inpaint = tool === 'inpaint'
  const [savedModel, setSavedModel] = useState(() => readStorage(refinementModelKey, ''))
  const refinementModels = status?.refinementModels ?? []
  const refinementModel = refinementModels.includes(savedModel) ? savedModel : ''
  const canRefine = refinementModels.length > 0
  const anyOpen = useAnySectionOpen()
  const hasMainModel = Boolean(profile?.models.some(isMainModel))
  const mainSlot = profile?.models.find(isMainModel)
  const mainFile = mainSlot && workflow.choices[modelKey(mainSlot)]
  const activeLoras = workflow.loras.filter((entry) => entry.enabled).length
  const modelSummary = [
    mainFile?.replace(/^.*[\\/]/, '').replace(/\.(safetensors|gguf|ckpt|pt|pth|bin)$/i, ''),
    activeLoras && t('{{count}} LoRA', { count: activeLoras })
  ]
    .filter(Boolean)
    .join(' · ')
  const toggleLabel = anyOpen ? t('Alle Abschnitte einklappen') : t('Alle Abschnitte ausklappen')
  // Extras: the generation data of the opened file, the plain upscaler and background removal. No prompt or seed.
  if (tool === 'upscale')
    return (
      <aside className="inspector" aria-label={t('Bearbeitungseinstellungen')}>
        <div className="inspector-scroll">
          <MetadataFields {...metadata} />
          <UpscaleFields workflow={workflow} work={work} />
          <BackgroundFields background={background} />
        </div>
        {children}
      </aside>
    )
  return (
    <aside className="inspector" aria-label={t('Bearbeitungseinstellungen')}>
      <div className="inspector-scroll">
        <ProfileNote workflow={workflow} status={status} />
        <PromptFields
          key={tool + ':' + profile?.id}
          value={workflow.prompt}
          onChange={workflow.setPrompt}
          canRefine={canRefine}
          refineEmpty={tool === 'outpaint'}
          refining={refining}
          onRefine={onRefine && ((value) => onRefine(value, tool, profile?.id, refinementModel || undefined))}
          notice={notice}
          placeholder={t(prompt)}
          negative={profile?.negative ? workflow.negative : undefined}
          onNegative={workflow.setNegative}
          negativeInactive={Number(workflow.parameters.cfg) <= 1}
          image={work?.image}
          imageName={imageName}
          references={references}
          limit={tool === 'edit' && profile?.reference ? (profile.referenceLimit ?? 1) : 0}
          onAdd={onReference}
          onDrop={onDropReferences}
          onRemove={onRemoveReference}
          onMove={onMoveReference}
          onReplace={onReplaceReference}
          weights={profile?.weightsActive ? 'on' : profile?.weights === 'krea2' ? 'missing' : 'off'}
          weightRange={profile?.weights === 'krea2' ? [-1, 2] : [0, 2]}
        />
        <SizeFields
          tool={tool}
          work={work}
          workflow={workflow}
          onCrop={onCrop}
          onMargins={onMargins}
          notice={notice}
          sourceSwitch={sourceSwitch}
        />
        {(hasMainModel || profile?.lora) && (
          <CollapsibleSection id="model-settings" title={t('Modell & LoRAs')} summary={modelSummary}>
            {hasMainModel && (
              <div className="model-pick">
                <div className="model-pick-fields">
                  <ModelFields workflow={workflow} main />
                </div>
                <Button
                  id="reload-models"
                  className="icon quiet"
                  icon="reload"
                  title={t('Modelllisten neu laden')}
                  aria-label={t('Modelllisten neu laden')}
                  aria-busy={reloading}
                  disabled={reloading || status?.state !== 'ready'}
                  onClick={onReload}
                />
              </div>
            )}
            <LoraFields workflow={workflow} />
          </CollapsibleSection>
        )}
        <ModelToggleSections workflow={workflow} />
        {workflow.hiresAvailable && (
          <HiresFields workflow={workflow} work={work} canApply={canHiresImage} onApply={onHiresImage} />
        )}
        {inpaint && <MaskFields workflow={workflow} opacity={opacity} onOpacity={onOpacity} />}
        <RenderFields workflow={workflow} />
        <SamplingFields workflow={workflow} />
        {detailer.available && (
          <DetailerFields
            detailer={detailer}
            profile={profile}
            parameters={workflow.parameters}
            canApply={canDetailImage}
            onApply={onDetailImage}
          />
        )}
        {(canRefine || profile?.models.some((slot) => !isMainModel(slot))) && (
          <CollapsibleSection id="advanced" title={t('Erweiterte Einstellungen')} defaultOpen={false}>
            <ModelFields workflow={workflow} />
            {canRefine && (
              <label className="stack">
                <span>{t('Modell für Prompt-Verbesserung')}</span>
                <Combobox
                  value={refinementModel}
                  disabled={refining}
                  options={[
                    { value: '', label: t('Standard') + ' · ' + refinementModels[0] },
                    ...refinementModels.map((file) => ({ value: file }))
                  ]}
                  onChange={(model) => {
                    setSavedModel(model)
                    if (!writeStorage(refinementModelKey, model))
                      notice('Einstellungen konnten in diesem Browser nicht gespeichert werden.')
                  }}
                />
              </label>
            )}
          </CollapsibleSection>
        )}
        <div className="inspector-tail">
          <Button
            id="toggle-sections"
            className="quiet compact"
            icon={anyOpen ? 'collapse-all' : 'expand-all'}
            onClick={() => setAllSections(!anyOpen)}
          >
            {toggleLabel}
          </Button>
        </div>
      </div>
      {children}
    </aside>
  )
}
