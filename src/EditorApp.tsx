import { useTranslation } from 'react-i18next'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Panel } from 'react-resizable-panels'
import { Workspace } from './components/BackendConsole.js'
import { AdjustPanel } from './components/canvas/AdjustPanel.js'
import { CanvasStage } from './components/canvas/CanvasStage.js'
import { Inspector } from './components/inspector/Inspector.js'
import { WorkflowSwitch } from './components/inspector/WorkflowPresets.js'
import { RunPanel } from './components/RunPanel.js'
import { SettingsDialog } from './components/settings/SettingsDialog.js'
import { BackendStatus, Topbar } from './components/Topbar.js'
import { CanvasToolbar, ZoomControls } from './components/canvas/CanvasToolbar.js'
import { VramMeter } from './components/VramMeter.js'
import { VariantActions, VariantStrip, VariantsToggle } from './components/variants/VariantStrip.js'
import { outpaintSides, referenceImage, seedless } from './editor/generation.js'
import { fitView, sizeLabel, suggestExpansion } from './editor/geometry.js'
import { useAdjustments } from './hooks/useAdjustments.js'
import { useBridge } from './hooks/useBridge.js'
import { useUpdates } from './hooks/useUpdates.js'
import { useCanvasTools } from './hooks/useCanvasTools.js'
import { useConfig } from './hooks/useConfig.js'
import { useDocument } from './hooks/useDocument.js'
import { useEditorGeneration } from './hooks/useEditorGeneration.js'
import { useReferences } from './hooks/useReferences.js'
import { useShortcuts } from './hooks/useShortcuts.js'
import { useVariantActions } from './hooks/useVariantActions.js'
import { useVariants } from './hooks/useVariants.js'
import { useWorkflow } from './hooks/useWorkflow.js'
import { useDetailer } from './hooks/useDetailer.js'
import { useInspection } from './hooks/useInspection.js'
import { useSendSettings, type SendTarget } from './hooks/useSendSettings.js'
import type { Drawing, Mask } from './image/mask.js'
import type { Viewport } from './image/viewport.js'
import type { Notice, NoticeValues, Tool } from './types/editor.js'
import type { Frame, Stroke } from './types/image.js'
import { ResizableLayout, ResizeHandle } from './ui/ResizableLayout.js'
import { announceRunEnd } from './settings/notify.js'
import { confirmDiscard, getPreferences, usePreferences } from './settings/preferences.js'
import { modKey } from './helpers/platform.js'

const acceptedImages = 'image/png,image/jpeg,image/webp'

export function EditorApp() {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)
  const referenceInput = useRef<HTMLInputElement>(null)
  const viewRef = useRef<Viewport>(null)
  const [tool, setTool] = useState<Tool>('create')
  const [zoom, setZoom] = useState(1)
  const [opacity, setOpacity] = useState(52)
  const [variantsCollapsed, setVariantsCollapsed] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const { continueInEdit, consoleOnError } = usePreferences()
  const [message, setMessage] = useState<{ message: string; good: boolean; values?: NoticeValues }>()
  const notice = useCallback<Notice>(
    (message = '', good = false, values) => setMessage(message ? { message, good, values } : undefined),
    []
  )

  const bridge = useBridge(notice)
  const updates = useUpdates(notice, bridge)
  const { status, serverAction } = bridge
  const variants = useVariants()
  const inspection = useInspection()
  const document = useDocument(notice, (previous) => {
    bridge.closeSession()
    variants.dispatch({ type: 'clear' })
    // The import callback runs after render, once the hooks below have been initialized.
    // eslint-disable-next-line react-hooks/immutability
    tools.resetForDocument()
    // eslint-disable-next-line react-hooks/immutability
    references.reset()
    inspection.clear()
    if (previous) {
      // Read live: this callback may hold the preferences of an earlier render.
      // eslint-disable-next-line react-hooks/immutability
      if (!getPreferences().keepPrompts) workflow.resetPrompts()
      workflow.resetFrameRatios()
    }
  })
  const { work, mask, drawing } = document
  const strokes = work?.strokes
  const maskData = useMemo(
    () => (tool === 'inpaint' && strokes?.length ? mask?.get() : undefined),
    [tool, strokes, mask]
  )
  const maskBox = maskData?.box
  const workflow = useWorkflow(tool, status, work, maskBox, notice)
  const detailer = useDetailer(tool, status, workflow.profile, notice)
  const sendSettings = useSendSettings(tool, chooseTool, workflow, status, notice)
  const create = tool === 'create'
  const tools = useCanvasTools({
    tool,
    work,
    create,
    drawing,
    commit: document.commit,
    deselect: () => selectVariant(-1)
  })
  const { pan, space, frameMode, eraser, paintBrush, brushColor, brushSize, showMask } = tools
  const references = useReferences({
    work,
    profile: workflow.profile,
    importVersion: document.importVersion,
    notice
  })
  const adjustments = useAdjustments({ work, mask: maskData?.alpha, commit: document.commit })
  const settings = useConfig(notice, Boolean(serverAction))
  const {
    generation,
    jobBlocked,
    canRun,
    runTitle,
    replayProfile,
    canReplay,
    variantUpscale,
    canHiresImage,
    canDetailImage,
    detailImage,
    hiresImage,
    background,
    run
  } = useEditorGeneration({
    tool,
    bridge,
    document,
    workflow,
    detailer,
    variants,
    maskData,
    references: references.items,
    notice,
    onRunEnd(outcome) {
      announceRunEnd(outcome)
      if (outcome === 'error' && consoleOnError) setConsoleOpen(true)
    },
    t
  })

  // Create without a template starts from an empty canvas. With a template, while the image adjustments are open
  // or after a click on the Source card, the open image is shown.
  const template = workflow.template
  const [sourceShown, setSourceShown] = useState(false)
  const blank = create && !template && !adjustments.open && !sourceShown
  const candidate = variants.selected
  const image = work?.image
  const displayed = candidate?.frame ?? (blank ? undefined : image)
  const hasMask = Boolean(strokes?.length)
  const upscaling = tool === 'upscale'
  const canFrame = Boolean(image && !candidate && !create && !upscaling)
  const canToggleMask = tool === 'inpaint' && hasMask && !candidate
  const canSetBaseline = Boolean(displayed && (displayed !== work?.start || hasMask))
  const canAdjust = Boolean(image && !generation.running)
  const { measurement } = workflow
  const canOpen = !generation.running && !serverAction
  // Image runs get a placeholder card in the variant strip. Prompt refinement does not.
  const rendering = generation.running && !generation.refining
  // Created variants have no source image to compare against.
  const comparing = variants.compare && Boolean(candidate?.prepared.source)
  const candidateLabel =
    candidate &&
    (replayProfile?.short ?? t('Vorschau')) +
      (seedless(candidate.prepared.request) ? '' : ' · Seed ' + candidate.prepared.request.seed)
  const stageMode = candidate
    ? candidateLabel
    : upscaling && image && measurement
      ? t('Hochskalieren') + ' · ' + sizeLabel(image.w, image.h) + ' → ' + sizeLabel(...measurement.effective) + ' px'
      : template && measurement
        ? 'Img2Img · ' +
          sizeLabel(template.w, template.h) +
          ' → ' +
          sizeLabel(...measurement.effective) +
          ' px' +
          (workflow.hiresSize ? ' · Hires-Fix ' + sizeLabel(...workflow.hiresSize) + ' px' : '')
        : image && tool === 'outpaint'
          ? t('Zielrahmen ziehen') +
            (measurement ? ' · ' + sizeLabel(measurement.target.w, measurement.target.h) + ' px' : '')
          : undefined

  // Outpaint refinement looks at the image, so it can also write a prompt from an empty field.
  async function refinePrompt(prompt: string, refineTool: Tool, profile?: string, model?: string) {
    const vision =
      refineTool === 'outpaint' && image && measurement
        ? { image: await referenceImage(image), sides: outpaintSides(image, measurement.target) }
        : undefined
    return generation.refine(prompt, refineTool, profile, model, vision?.sides.length ? vision : undefined)
  }

  function selectVariant(index: number) {
    setSourceShown(false)
    const variant = variants.items[index]
    if (variant) workflow.showVariantSeed(variant.prepared.request.seed)
    variants.dispatch({ type: 'select', index })
  }

  // The Source card shows the open image, also in Create without a template, where the canvas is otherwise empty.
  function showSource() {
    selectVariant(-1)
    if (!create || template) return
    setSourceShown(true)
    requestAnimationFrame(() => fitView(viewRef.current, tool, work))
  }

  function movePreview(by: number) {
    const { index, items } = variants
    if (!items.length) return
    selectVariant(index < 0 ? (by > 0 ? 0 : items.length - 1) : (index + by + items.length) % items.length)
  }

  function chooseTool(next: Tool) {
    selectVariant(-1)
    if (next === tool) return
    setTool(next)
    // useDocument exposes this mutable ref for tool selection during an asynchronous import.
    // eslint-disable-next-line react-hooks/immutability
    document.toolAtImport.current = next
    tools.resetForTool()
    if (work && next === 'outpaint' && !Object.values(work.margins).some(Boolean)) {
      document.setMargins(suggestExpansion(work.image))
    }
    notice()
  }

  const canNew = canOpen && (Boolean(work) || tool !== 'create' || variants.items.length > 0)

  // Opening a file in Create means using it as the Img2Img template, as the empty canvas offers.
  function openDocument(file: File) {
    if (tool === 'create') workflow.toggleTemplate(true)
    return document.open(file)
  }

  // Opening replaces the variants, so a file that was only inspected asks first.
  async function openFile(file: File) {
    if (!canOpen) return false
    if (variants.items.length && !confirmDiscard(t('Das Bild öffnen? Die Varianten werden dabei gelöscht.')))
      return false
    await openDocument(file)
    return true
  }

  // A file dropped on the canvas always opens. Extras reads generation data from its own drop field.
  function dropFile(file: File) {
    if (canOpen) void openDocument(file)
  }

  // Edit and Inpaint need the inspected image as the open one. Create only takes the settings.
  async function sendMetadata(target: SendTarget) {
    const inspected = inspection.inspected
    if (!inspected?.info) return
    if (target !== 'create' && !(await openFile(inspected.file))) return
    sendSettings(inspected.info, target)
  }

  // New image: close the document, clear the variants and start over in Erstellen.
  function newImage() {
    // Unexported document changes ask in close(). Otherwise ask once before variants are lost.
    if (
      !document.dirty &&
      variants.items.length &&
      !confirmDiscard(t('Neues Bild beginnen? Die Varianten werden dabei gelöscht.'))
    )
      return
    if (!document.close()) return
    workflow.toggleTemplate(false)
    variants.dispatch({ type: 'clear' })
    selectVariant(-1)
    chooseTool('create')
    tools.setPan(false)
    notice('Neues Bild. Beschreibe es rechts im Prompt.', true)
  }

  function travel(direction: 'undo' | 'redo') {
    if (!document.travel(direction)) return
    selectVariant(-1)
    notice()
  }

  // After Apply the new source stays on the canvas and its variant card is marked, also in Create without a template.
  function showApplied() {
    selectVariant(-1)
    setSourceShown(true)
  }

  // strokes: a detailer segmentation. It continues in Ersetzen, where it is the mask.
  function adoptCreated(frame: Frame, strokes?: Stroke[]) {
    if (
      work &&
      !confirmDiscard(
        t('Das geöffnete Bild durch das erstellte Bild ersetzen? {{mod}}+Z stellt es wieder her.', { mod: modKey(t) })
      )
    )
      return
    document.adopt(frame, strokes)
    // Optionally continue in Ändern. toolAtImport only affects outpaint imports, so it can stay as it is.
    showApplied()
    if (strokes?.length) setTool('inpaint')
    else if (continueInEdit) setTool('edit')
    tools.setPan(false)
    tools.setShowMask(true)
    requestAnimationFrame(() => viewRef.current?.fit(frame))
    notice(
      strokes?.length
        ? 'Bild übernommen. Die Segmentierungsmaske ist unter „Ersetzen“ gesetzt.'
        : continueInEdit
          ? 'Bild übernommen. Weiter mit Ändern, Ersetzen oder Erweitern.'
          : 'Bild übernommen.',
      true
    )
  }

  const { apply, setBaseline } = useVariantActions({
    document,
    variants,
    adoptCreated,
    resetAfterReplace: tools.resetAfterReplace,
    selectVariant,
    showApplied,
    notice
  })

  function addStroke(stroke: Stroke, layer: Mask | Drawing) {
    if (!work) return
    const next = stroke.color
      ? { ...work, drawing: [...(work.drawing ?? []), stroke] }
      : { ...work, strokes: [...work.strokes, stroke] }
    document.commit(next, layer)
  }

  const openPicker = () => fileInput.current?.click()
  const fit = () => fitView(viewRef.current, tool, blank ? undefined : work, candidate?.frame)
  const zoomCanvas = (direction: -1 | 0 | 1) => {
    const view = viewRef.current
    if (view) view.zoom(direction === 0 ? 1 : view.scale * 1.25 ** direction)
  }
  const setDisplayedBaseline = () => {
    if (displayed) setBaseline(displayed)
  }
  const toggleCompare = () => {
    if (!candidate || candidate.prepared.source) variants.dispatch({ type: 'compare' })
  }
  const toggleVariants = () => setVariantsCollapsed((value) => !value)
  // The adjustments always work on the open image, so a shown variant is deselected first.
  const toggleAdjust = () => {
    if (!adjustments.open && !canAdjust) return
    selectVariant(-1)
    adjustments.toggle()
    // In Create without a template the open image only appears while the adjustments are open.
    if (create && !template && !adjustments.open) requestAnimationFrame(() => fitView(viewRef.current, tool, work))
  }
  const dismiss = () => {
    if (adjustments.open) adjustments.cancel()
    else selectVariant(-1)
  }
  // A created source image stays reachable in the strip after its variants are gone.
  const showStrip = variants.items.length > 0 || rendering || Boolean(document.created && work)
  // Clearing the variants keeps the source image. A created source is removed on its own with Delete while it is shown.
  const clearVariants = () => {
    if (!confirmDiscard(t('Alle Vorschauen löschen?'))) return
    selectVariant(-1)
    variants.dispatch({ type: 'clear' })
  }
  const removeVariant = () => {
    if (candidate || !document.created || blank || !work) return variants.dispatch({ type: 'remove' })
    if (!confirmDiscard(t('Das erstellte Quellbild löschen?'))) return
    document.close(true)
    workflow.toggleTemplate(false)
    chooseTool('create')
    notice()
  }
  useShortcuts({
    tool,
    loaded: Boolean(blank ? variants.items.length : image),
    canOpen,
    dirty: document.dirty,
    hasVariants: variants.items.length > 0,
    canFrame,
    canToggleMask,
    canClearMask: tool === 'inpaint' && hasMask,
    canSetBaseline,
    canAdjust: canAdjust || adjustments.open,
    paintBrush: paintBrush && Boolean(drawing),
    stageHovered: () => viewRef.current?.element.matches(':hover') ?? false,
    chooseTool,
    setEraser: tools.chooseEraser,
    selectBrush: tools.selectBrush,
    setSpace: tools.setSpace,
    togglePan: tools.togglePan,
    toggleFrame: tools.toggleFrame,
    toggleMask: tools.toggleMask,
    clearMask: tools.clearMask,
    resizeBrush: tools.resizeBrush,
    zoom: zoomCanvas,
    // While adjusting, V flips the adjustment preview instead of the variant before/after.
    toggleCompare: adjustments.open ? () => adjustments.setShowPreview((show) => !show) : toggleCompare,
    canApply: Boolean(candidate),
    apply,
    remove: removeVariant,
    clearVariants,
    toggleVariants,
    travel,
    fit,
    setBaseline: setDisplayedBaseline,
    toggleAdjust,
    dismiss,
    movePreview,
    open: openPicker,
    canNew,
    newImage,
    toggleConsole: () => setConsoleOpen((value) => !value),
    exportImage: document.download,
    run: () => run()
  })

  const meta = image
    ? (candidate ? t('Vorschau ') + sizeLabel(candidate.frame.w, candidate.frame.h) + ' px  ·  ' : '') +
      t('{{format}}-Export ', { format: document.exportFormat.toUpperCase() }) +
      sizeLabel(image.w, image.h) +
      ' px'
    : candidate
      ? t('Vorschau ') + sizeLabel(candidate.frame.w, candidate.frame.h) + ' px'
      : t('Kein Bild geöffnet')

  return (
    <>
      <input
        id="file"
        ref={fileInput}
        type="file"
        accept={acceptedImages}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file && canOpen) void openDocument(file)
        }}
      />
      <input
        id="ref-file"
        ref={referenceInput}
        type="file"
        accept={acceptedImages}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          references.add(files)
        }}
      />
      <Topbar
        tool={tool}
        canUndo={document.canUndo}
        canRedo={document.canRedo}
        openDisabled={!canOpen}
        newDisabled={!canNew}
        onNew={newImage}
        canExport={Boolean(image && !document.exporting)}
        exportLabel={t('{{format}} exportieren', { format: document.exportFormat.toUpperCase() })}
        onOpen={openPicker}
        onExport={document.download}
        onUndo={() => travel('undo')}
        onRedo={() => travel('redo')}
        onSettings={settings.open}
        onTool={chooseTool}
        updateAvailable={updates.available}
        workflowSwitch={tool !== 'upscale' && <WorkflowSwitch workflow={workflow} />}
      />
      <main className="editor">
        <ResizableLayout id="editor-layout" panelIds={['workspace-panel', 'inspector-panel']}>
          <Panel id="workspace-panel" className="layout-panel" minSize="20%">
            <Workspace
              fileName={document.fileName}
              dirty={document.dirty}
              meta={meta}
              loaded={Boolean(displayed)}
              hasVariants={showStrip}
              variantsCollapsed={variantsCollapsed}
              consoleOpen={consoleOpen}
              onToggleConsole={() => setConsoleOpen((value) => !value)}
              zoomControls={<ZoomControls zoom={zoom} onZoom={zoomCanvas} onFit={fit} />}
              backendStatus={
                <>
                  <VramMeter enabled={bridge.status?.state === 'ready'} />
                  <BackendStatus bridge={bridge} onSettings={settings.open} />
                </>
              }
              variants={
                <VariantStrip
                  items={variants.items}
                  selected={candidate}
                  index={variants.index}
                  baseline={work?.start}
                  status={status}
                  onSelect={selectVariant}
                  source={
                    work && showStrip
                      ? {
                          frame: work.image,
                          unused: create && !template,
                          shown: !candidate && !blank,
                          onShow: showSource
                        }
                      : undefined
                  }
                  pending={
                    rendering
                      ? { progress: generation.progress?.progress, preview: generation.progress?.preview }
                      : undefined
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
                detections={generation.detections ?? (detailer.settings.keepBoxes ? candidate?.detections : undefined)}
                compare={
                  candidate?.prepared.source
                    ? { before: comparing, onChange: (before) => before !== comparing && toggleCompare() }
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
                  if (candidate) selectVariant(-1)
                  tools.setShowMask(true)
                }}
              />
              <CanvasToolbar
                tool={tool}
                loaded={Boolean(displayed)}
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
                canAdjust={canAdjust || adjustments.open}
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
                leading={
                  <VariantsToggle
                    open={showStrip ? !variantsCollapsed : false}
                    count={variants.items.length}
                    position={candidate ? variants.index + 1 : undefined}
                    disabled={!showStrip}
                    canClear={variants.items.length > 0}
                    onToggle={toggleVariants}
                    onClear={clearVariants}
                  />
                }
                actions={
                  variants.items.length > 0 && (
                    <VariantActions
                      selected={Boolean(candidate)}
                      canReplay={canReplay}
                      quickUpscale={variantUpscale}
                      onReplay={() => {
                        if (candidate) run(candidate)
                      }}
                      onDismiss={() => selectVariant(-1)}
                      onRemove={removeVariant}
                      onApply={apply}
                    />
                  )
                }
              />
            </Workspace>
          </Panel>
          <ResizeHandle label={t('Breite der Seitenleiste ändern')} />
          <Panel id="inspector-panel" className="layout-panel" defaultSize="320px" minSize="224px" maxSize="70%">
            <Inspector
              tool={tool}
              status={status}
              workflow={workflow}
              onRefine={jobBlocked ? undefined : refinePrompt}
              refining={generation.refining}
              onReload={() => void bridge.reload()}
              reloading={bridge.reloading}
              references={references.items}
              imageName={document.fileName}
              work={work}
              onReference={() => referenceInput.current?.click()}
              onDropReferences={references.add}
              onRemoveReference={references.remove}
              onMoveReference={references.move}
              onReplaceReference={references.replace}
              opacity={opacity}
              onOpacity={setOpacity}
              onMargins={document.setMargins}
              onCrop={(crop) => {
                selectVariant(-1)
                document.setCrop(crop)
              }}
              notice={notice}
              canHiresImage={canHiresImage}
              onHiresImage={hiresImage}
              detailer={detailer}
              metadata={{
                info: inspection.inspected?.info,
                fileName: inspection.inspected?.file.name ?? '',
                loaded: Boolean(inspection.inspected),
                busy: !canOpen,
                onSend: (target) => void sendMetadata(target),
                thumbnail: inspection.inspected?.url,
                onInspect: (file) => void inspection.inspect(file),
                onClearInspection: inspection.clear,
                onOpen: inspection.inspected && (() => void openFile(inspection.inspected!.file))
              }}
              sourceSwitch={
                candidate && work && candidate.frame !== work.image
                  ? { variant: variants.index + 1, onUse: setDisplayedBaseline }
                  : undefined
              }
              canDetailImage={canDetailImage}
              onDetailImage={detailImage}
              background={background}
            >
              <RunPanel
                generation={generation}
                notice={message}
                disabled={!canRun}
                title={runTitle}
                onRun={() => run()}
              />
            </Inspector>
          </Panel>
        </ResizableLayout>
      </main>
      {settings.config && (
        <SettingsDialog
          config={settings.config}
          bridge={bridge}
          updates={updates}
          busy={generation.running || document.importing || document.exporting}
          onClose={settings.close}
        />
      )}
    </>
  )
}
