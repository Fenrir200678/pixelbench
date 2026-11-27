import { useTranslation } from 'react-i18next'
import { useState, type RefObject } from 'react'
import { Workspace } from './BackendConsole.js'
import { AdjustPanel } from './canvas/AdjustPanel.js'
import { CanvasStage } from './canvas/CanvasStage.js'
import { CanvasToolbar, ZoomControls } from './canvas/CanvasToolbar.js'
import type { FrameControls } from './canvas/ToolOptions.js'
import { BackendStatus } from './Topbar.js'
import { VramMeter } from './VramMeter.js'
import { VariantActions, VariantStrip, VariantsToggle } from './variants/VariantStrip.js'
import { seedless } from '../editor/generation.js'
import { frameChoices, sizeLabel } from '../editor/geometry.js'
import type { useAdjustments } from '../hooks/useAdjustments.js'
import type { Bridge } from '../hooks/useBridge.js'
import type { useCanvasTools } from '../hooks/useCanvasTools.js'
import type { useDocument } from '../hooks/useDocument.js'
import type { useEditorGeneration } from '../hooks/useEditorGeneration.js'
import type { useVariantActions } from '../hooks/useVariantActions.js'
import type { useVariants } from '../hooks/useVariants.js'
import type { Workflow } from '../hooks/useWorkflow.js'
import type { Drawing, Mask } from '../image/mask.js'
import { expandedRect } from '../image/pixels.js'
import type { Viewport } from '../image/viewport.js'
import type { Tool, Work } from '../types/editor.js'
import type { Rect, Stroke } from '../types/image.js'

type Props = {
  tool: Tool
  viewRef: RefObject<Viewport | null>
  document: Pick<
    ReturnType<typeof useDocument>,
    | 'work'
    | 'mask'
    | 'drawing'
    | 'original'
    | 'fileName'
    | 'dirty'
    | 'created'
    | 'exportFormat'
    | 'commit'
    | 'setMargins'
    | 'setCrop'
  >
  tools: ReturnType<typeof useCanvasTools>
  workflow: Pick<
    Workflow,
    'template' | 'measurement' | 'hiresSize' | 'crop' | 'grid' | 'frameRatio' | 'prefs' | 'toggleFrameRatio'
  >
  variants: Pick<ReturnType<typeof useVariants>, 'items' | 'index' | 'selected' | 'compare' | 'deselect'>
  variantActions: Pick<ReturnType<typeof useVariantActions>, 'select' | 'toggleCompare' | 'clear' | 'apply'>
  adjustments: ReturnType<typeof useAdjustments>
  editorGeneration: Pick<
    ReturnType<typeof useEditorGeneration>,
    'generation' | 'replayProfile' | 'canReplay' | 'variantUpscale' | 'variantDetail' | 'run'
  >
  bridge: Bridge
  opacity: number
  keepBoxes: boolean
  canOpen: boolean
  canFrame: boolean
  canToggleMask: boolean
  canSetBaseline: boolean
  canAdjust: boolean
  consoleOpen: boolean
  variantsCollapsed: boolean
  openSettings: () => void
  openPicker: () => void
  dropFile: (file: File) => void
  fit: () => void
  zoomCanvas: (direction: -1 | 0 | 1) => void
  toggleConsole: () => void
  toggleVariants: () => void
  toggleAdjust: () => void
  setDisplayedBaseline: () => void
  removeVariant: () => void
}

export function CanvasWorkspace({
  tool,
  viewRef,
  document,
  tools,
  workflow,
  variants,
  variantActions,
  adjustments,
  editorGeneration,
  bridge,
  opacity,
  keepBoxes,
  canOpen,
  canFrame,
  canToggleMask,
  canSetBaseline,
  canAdjust,
  consoleOpen,
  variantsCollapsed,
  openSettings,
  openPicker,
  dropFile,
  fit,
  zoomCanvas,
  toggleConsole,
  toggleVariants,
  toggleAdjust,
  setDisplayedBaseline,
  removeVariant
}: Props) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)
  const { work, mask, drawing } = document
  const { pan, space, frameMode, eraser, paintBrush, brushColor, brushSize, showMask } = tools
  const { generation, replayProfile, canReplay, variantUpscale, variantDetail, run } = editorGeneration
  const { template, measurement, hiresSize } = workflow
  const { status } = bridge
  const candidate = variants.selected
  const image = work?.image
  const create = tool === 'create'
  const blank = create && !image
  const loaded = Boolean(candidate || image)
  const hasMask = Boolean(work?.strokes.length)
  // Prompt refinement has no variant placeholder. A created source remains reachable after clearing variants.
  const rendering = generation.running && !generation.refining
  const showStrip = variants.items.length > 0 || rendering || Boolean(document.created && work)
  const comparing = variants.compare && Boolean(candidate?.prepared.source)

  let stageMode: string | undefined
  if (candidate) {
    const { request } = candidate.prepared
    stageMode = (replayProfile?.short ?? t('Vorschau')) + (seedless(request) ? '' : ' · Seed ' + request.seed)
  } else if (tool === 'upscale' && image && measurement) {
    stageMode =
      t('Hochskalieren') + ' · ' + sizeLabel(image.w, image.h) + ' → ' + sizeLabel(...measurement.effective) + ' px'
  } else if (template && measurement) {
    stageMode =
      'Img2Img · ' +
      sizeLabel(template.w, template.h) +
      ' → ' +
      sizeLabel(...measurement.effective) +
      ' px' +
      (hiresSize ? ' · Hires-Fix ' + sizeLabel(...hiresSize) + ' px' : '')
  } else if (image && tool === 'outpaint') {
    stageMode =
      t('Zielrahmen ziehen') +
      (measurement ? ' · ' + sizeLabel(measurement.target.w, measurement.target.h) + ' px' : '')
  }

  const meta = image
    ? (candidate ? t('Vorschau ') + sizeLabel(candidate.frame.w, candidate.frame.h) + ' px  ·  ' : '') +
      t('{{format}}-Export ', { format: document.exportFormat.toUpperCase() }) +
      sizeLabel(image.w, image.h) +
      ' px'
    : candidate
      ? t('Vorschau ') + sizeLabel(candidate.frame.w, candidate.frame.h) + ' px'
      : t('Kein Bild geöffnet')

  function setCrop(crop?: Rect) {
    variants.deselect()
    document.setCrop(crop)
  }

  function addStroke(stroke: Stroke, layer: Mask | Drawing) {
    if (!work) return
    const next = stroke.color
      ? { ...work, drawing: [...(work.drawing ?? []), stroke] }
      : { ...work, strokes: [...work.strokes, stroke] }
    document.commit(next, layer)
  }

  return (
    <Workspace
      fileName={document.fileName}
      dirty={document.dirty}
      meta={meta}
      loaded={loaded}
      hasVariants={showStrip}
      variantsCollapsed={variantsCollapsed}
      consoleOpen={consoleOpen}
      onToggleConsole={toggleConsole}
      zoomControls={<ZoomControls zoom={zoom} onZoom={zoomCanvas} onFit={fit} />}
      backendStatus={
        <>
          <VramMeter enabled={bridge.status?.state === 'ready'} />
          <BackendStatus bridge={bridge} onSettings={openSettings} />
        </>
      }
      variants={
        <VariantStrip
          items={variants.items}
          selected={candidate}
          index={variants.index}
          baseline={work?.start}
          status={status}
          onSelect={variantActions.select}
          source={
            work && showStrip
              ? {
                  frame: work.image,
                  unused: create && !template,
                  shown: !candidate && !blank,
                  onShow: variants.deselect
                }
              : undefined
          }
          pending={
            rendering ? { progress: generation.progress?.progress, preview: generation.progress?.preview } : undefined
          }
        />
      }
    >
      <CanvasStage
        viewRef={viewRef}
        work={blank ? undefined : work}
        original={document.original}
        preview={blank ? undefined : adjustments.preview}
        overlay={adjustments.open && !blank && <AdjustPanel adjustments={adjustments} />}
        createSize={blank ? measurement?.effective : undefined}
        candidate={candidate?.frame}
        compareSource={comparing ? (candidate?.before ?? candidate?.prepared.source) : undefined}
        detections={generation.detections ?? (keepBoxes ? candidate?.detections : undefined)}
        compare={
          candidate?.prepared.source
            ? { before: comparing, onChange: (before) => before !== comparing && variantActions.toggleCompare() }
            : undefined
        }
        stageMode={stageMode}
        tool={tool}
        crop={workflow.crop}
        grid={workflow.grid}
        frameRatio={workflow.frameRatio}
        frameMode={frameMode}
        mask={mask}
        drawing={create ? undefined : drawing}
        brushColor={paintBrush && drawing && !create ? brushColor : undefined}
        pan={pan || space}
        eraser={eraser}
        brushSize={brushSize}
        opacity={opacity}
        showMask={showMask}
        openDisabled={!canOpen}
        onOpen={openPicker}
        onDrop={dropFile}
        onStroke={addStroke}
        onMargins={document.setMargins}
        onCrop={document.setCrop}
        onBrush={tools.setBrushSize}
        onZoomChanged={setZoom}
        onRevealMask={() => {
          if (candidate) variants.deselect()
          tools.setShowMask(true)
        }}
      />
      <CanvasToolbar
        tool={tool}
        loaded={loaded}
        pan={pan || space}
        frameMode={canFrame && (tool === 'outpaint' ? !paintBrush || !drawing : frameMode) && !pan && !space}
        canFrame={canFrame}
        painting={!candidate && !frameMode && !pan && !space}
        paintBrush={paintBrush && Boolean(drawing)}
        hasDrawing={Boolean(drawing)}
        brushColor={brushColor}
        hasMask={hasMask}
        showMask={canToggleMask && showMask}
        canToggleMask={canToggleMask}
        canSetBaseline={canSetBaseline}
        eraser={eraser}
        brushSize={brushSize}
        canAdjust={canAdjust}
        adjusting={adjustments.open}
        onAdjust={toggleAdjust}
        onPan={tools.togglePan}
        onFrame={tools.toggleFrame}
        onEraser={tools.chooseEraser}
        onSelectBrush={tools.selectBrush}
        onBrushColor={tools.setBrushColor}
        onDeleteDrawing={tools.deleteDrawing}
        onToggleMask={tools.toggleMask}
        onClearMask={tools.clearMask}
        onBrush={tools.setBrushSize}
        onBaseline={setDisplayedBaseline}
        frame={work && frameControls(tool, work, workflow, setCrop)}
        leading={
          <VariantsToggle
            open={showStrip ? !variantsCollapsed : false}
            count={variants.items.length}
            position={candidate ? variants.index + 1 : undefined}
            disabled={!showStrip}
            canClear={variants.items.length > 0}
            onToggle={toggleVariants}
            onClear={variantActions.clear}
          />
        }
        actions={
          variants.items.length > 0 && (
            <VariantActions
              selected={Boolean(candidate)}
              canReplay={canReplay}
              quickUpscale={variantUpscale}
              quickDetail={variantDetail}
              onReplay={() => {
                if (candidate) run(candidate)
              }}
              onDismiss={variants.deselect}
              onRemove={removeVariant}
              onApply={variantActions.apply}
            />
          )
        }
      />
    </Workspace>
  )
}

function frameControls(
  tool: Tool,
  work: Work,
  workflow: Pick<Workflow, 'crop' | 'frameRatio' | 'prefs' | 'toggleFrameRatio'>,
  setCrop: (crop?: Rect) => void
): FrameControls | undefined {
  const lock = { locked: Boolean(workflow.frameRatio), onLock: workflow.toggleFrameRatio }
  if (tool === 'outpaint') {
    const target = expandedRect(work.image, work.margins)
    return { ...lock, size: sizeLabel(target.w, target.h) }
  }
  const { crop } = workflow
  if (!crop) return undefined
  const choices = frameChoices(work, tool, crop, workflow.prefs.auto)
  return {
    ...lock,
    size: sizeLabel(crop.w, crop.h),
    full: { active: choices.fullImage, onClick: () => setCrop(choices.fullCrop) },
    auto: choices.autoAvailable ? { active: choices.automatic, onClick: () => setCrop() } : undefined
  }
}
