import { useTranslation } from 'react-i18next'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Panel } from 'react-resizable-panels'
import { CanvasWorkspace } from './components/CanvasWorkspace.js'
import { Inspector } from './components/inspector/Inspector.js'
import { WorkflowSwitch } from './components/inspector/WorkflowPresets.js'
import { RunPanel } from './components/RunPanel.js'
import { SettingsDialog } from './components/settings/SettingsDialog.js'
import { Topbar } from './components/Topbar.js'
import { exportKey } from './editor/tools.js'
import { outpaintSides, referenceImage } from './editor/generation.js'
import { fitView, suggestExpansion } from './editor/geometry.js'
import { useAdjustments } from './hooks/useAdjustments.js'
import { useBridge } from './hooks/useBridge.js'
import { useUpdates } from './hooks/useUpdates.js'
import { useCanvasTools } from './hooks/useCanvasTools.js'
import { useConfig } from './hooks/useConfig.js'
import { useDocument } from './hooks/useDocument.js'
import { useEditorSession } from './hooks/useEditorSession.js'
import { useEditorGeneration } from './hooks/useEditorGeneration.js'
import { useReferences } from './hooks/useReferences.js'
import { useShortcuts } from './hooks/useShortcuts.js'
import { useVariantActions } from './hooks/useVariantActions.js'
import { useVariants } from './hooks/useVariants.js'
import { useWorkflow } from './hooks/useWorkflow.js'
import { useDetailer } from './hooks/useDetailer.js'
import { useInspection } from './hooks/useInspection.js'
import { useSendSettings, type SendTarget } from './hooks/useSendSettings.js'
import type { Viewport } from './image/viewport.js'
import type { Workspace } from './editor/session/workspace.js'
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
  // An import can finish after the editor switches tools.
  const activeTool = useRef(tool)
  const [opacity, setOpacity] = useState(52)
  const [variantsCollapsed, setVariantsCollapsed] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [restored, setRestored] = useState(0)
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
  const document = useDocument(notice, activeTool)
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
    deselect: variants.deselect
  })
  const references = useReferences({
    work,
    profile: workflow.profile,
    importVersion: document.importVersion,
    notice
  })
  const adjustments = useAdjustments({ work, mask: maskData?.alpha, commit: document.commit })
  const settings = useConfig(notice, Boolean(serverAction))
  const editorGeneration = useEditorGeneration({
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

  const {
    generation,
    jobBlocked,
    canRun,
    runTitle,
    canHiresImage,
    canDetailImage,
    detailImage,
    hiresImage,
    background,
    run
  } = editorGeneration
  const candidate = variants.selected
  const image = work?.image
  const displayed = candidate?.frame ?? image
  const hasMask = Boolean(strokes?.length)
  const canFrame = Boolean(image && !candidate && !create && tool !== 'upscale')
  const canToggleMask = tool === 'inpaint' && hasMask && !candidate
  const canSetBaseline = Boolean(displayed && (displayed !== work?.start || hasMask))
  const canAdjust = Boolean(image && !generation.running)
  const { measurement } = workflow
  const canOpen = !generation.running && !serverAction
  const snapshot = useMemo<Omit<Workspace, 'workflow'>>(
    () => ({
      tool,
      opacity,
      variantsCollapsed,
      document: document.sessionState,
      detailer: detailer.settings,
      background: background.settings,
      tools: tools.sessionState,
      adjustments: adjustments.sessionState,
      references: references.items,
      variants: variants.sessionState,
      inspection: inspection.inspected
    }),
    [
      tool,
      opacity,
      variantsCollapsed,
      document.sessionState,
      detailer.settings,
      background.settings,
      tools.sessionState,
      adjustments.sessionState,
      references.items,
      variants.sessionState,
      inspection.inspected
    ]
  )
  const sessionChanges = useMemo(() => [snapshot, workflow.sessionChanges], [snapshot, workflow.sessionChanges])
  const session = useEditorSession({
    workspace: { ...snapshot, workflow: workflow.sessionState },
    changes: sessionChanges,
    canRestore: canOpen && !generation.refining && !document.importing && !document.exporting,
    notice,
    prepareRestore(next) {
      const restoreDocument = document.prepareRestore(next.document)
      return () => {
        bridge.closeSession()
        restoreDocument()
        changeTool(next.tool)
        workflow.restore(next.workflow, next.tool)
        detailer.restore(next.detailer)
        background.restore(next.background)
        tools.restore(next.tools)
        adjustments.restore(next.document.work?.image, next.adjustments)
        references.restore(next.references)
        variants.dispatch({ type: 'restore', state: next.variants })
        inspection.restore(next.inspection)
        setOpacity(next.opacity)
        setVariantsCollapsed(next.variantsCollapsed)
        setRestored((version) => version + 1)
        requestAnimationFrame(() =>
          fitView(viewRef.current, next.tool, next.document.work, next.variants.items[next.variants.index]?.frame)
        )
      }
    }
  })

  // Outpaint refinement looks at the image, so it can also write a prompt from an empty field.
  async function refinePrompt(prompt: string, refineTool: Tool, profile?: string, model?: string) {
    const vision =
      refineTool === 'outpaint' && image && measurement
        ? { image: await referenceImage(image), sides: outpaintSides(image, measurement.target) }
        : undefined
    return generation.refine(prompt, refineTool, profile, model, vision?.sides.length ? vision : undefined)
  }

  function changeTool(next: Tool) {
    activeTool.current = next
    setTool(next)
  }

  function chooseTool(next: Tool) {
    variants.deselect()
    if (next === activeTool.current) return
    changeTool(next)
    tools.resetForTool()
    if (work && next === 'outpaint' && !Object.values(work.margins).some(Boolean)) {
      document.setMargins(suggestExpansion(work.image))
    }
    notice()
  }

  const canNew = canOpen && (Boolean(work) || tool !== 'create' || variants.items.length > 0)

  function openDocument(file: File) {
    return document.open(file, (previous, importTool) => {
      // Opening an image in Create uses it as the Img2Img template.
      if (importTool === 'create') workflow.toggleTemplate(true)
      bridge.closeSession()
      variants.dispatch({ type: 'clear' })
      tools.resetForDocument()
      references.reset()
      inspection.clear()
      if (previous) {
        // Preferences may have changed while decoding the image.
        if (!getPreferences().keepPrompts) workflow.resetPrompts()
        workflow.resetFrameRatios()
      }
    })
  }

  // Opening replaces the variants, so a file that was only inspected asks first.
  async function openFile(file: File) {
    if (!canOpen) return false
    if (variants.items.length && !confirmDiscard(t('Das Bild öffnen? Die Varianten werden dabei gelöscht.')))
      return false
    return openDocument(file)
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
    chooseTool('create')
    tools.setPan(false)
    notice('Neues Bild. Beschreibe es rechts im Prompt.', true)
  }

  function travel(direction: 'undo' | 'redo') {
    if (!document.travel(direction)) return
    variants.deselect()
    notice()
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
    variants.deselect()
    if (strokes?.length) changeTool('inpaint')
    else if (continueInEdit) changeTool('edit')
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

  const variantActions = useVariantActions({
    document,
    variants,
    adoptCreated,
    resetAfterReplace: tools.resetAfterReplace,
    showVariantSeed: workflow.showVariantSeed,
    notice
  })

  const openPicker = () => fileInput.current?.click()
  const fit = () => fitView(viewRef.current, tool, work, candidate?.frame)
  const zoomCanvas = (direction: -1 | 0 | 1) => {
    const view = viewRef.current
    if (view) view.zoom(direction === 0 ? 1 : view.scale * 1.25 ** direction)
  }
  const setDisplayedBaseline = () => {
    if (displayed) variantActions.setBaseline(displayed)
  }
  const toggleVariants = () => setVariantsCollapsed((value) => !value)
  const toggleConsole = () => setConsoleOpen((value) => !value)
  // The adjustments always work on the open image, so a shown variant is deselected first.
  const toggleAdjust = () => {
    if (!adjustments.open && !canAdjust) return
    variants.deselect()
    adjustments.toggle()
  }
  const dismiss = () => {
    if (adjustments.open) adjustments.cancel()
    else variants.deselect()
  }
  const removeVariant = () => {
    if (candidate || !document.created || !work) return variants.dispatch({ type: 'remove' })
    if (!confirmDiscard(t('Das erstellte Quellbild löschen?'))) return
    document.close(true)
    workflow.toggleTemplate(false)
    chooseTool('create')
    notice()
  }
  useShortcuts({
    tool,
    loaded: Boolean(image || (create && variants.items.length)),
    canOpen,
    dirty: document.dirty || session.unsaved,
    hasVariants: variants.items.length > 0,
    canFrame,
    canToggleMask,
    canClearMask: tool === 'inpaint' && hasMask,
    canSetBaseline,
    canAdjust: canAdjust || adjustments.open,
    paintBrush: tools.paintBrush && Boolean(drawing),
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
    toggleCompare: adjustments.open ? () => adjustments.setShowPreview((show) => !show) : variantActions.toggleCompare,
    canApply: Boolean(candidate),
    apply: variantActions.apply,
    remove: removeVariant,
    clearVariants: variantActions.clear,
    toggleVariants,
    travel,
    fit,
    setBaseline: setDisplayedBaseline,
    toggleAdjust,
    dismiss,
    movePreview: variantActions.movePreview,
    open: openPicker,
    canNew,
    newImage,
    toggleConsole,
    exportImage: document.download,
    run: () => run()
  })

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
        session={session}
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
            <CanvasWorkspace
              tool={tool}
              viewRef={viewRef}
              document={document}
              tools={tools}
              workflow={workflow}
              variants={variants}
              variantActions={variantActions}
              adjustments={adjustments}
              editorGeneration={editorGeneration}
              bridge={bridge}
              opacity={opacity}
              keepBoxes={detailer.settings.keepBoxes}
              canOpen={canOpen}
              canFrame={canFrame}
              canToggleMask={canToggleMask}
              canSetBaseline={canSetBaseline}
              canAdjust={canAdjust || adjustments.open}
              consoleOpen={consoleOpen}
              variantsCollapsed={variantsCollapsed}
              openSettings={settings.open}
              openPicker={openPicker}
              dropFile={dropFile}
              fit={fit}
              zoomCanvas={zoomCanvas}
              toggleConsole={toggleConsole}
              toggleVariants={toggleVariants}
              toggleAdjust={toggleAdjust}
              setDisplayedBaseline={setDisplayedBaseline}
              removeVariant={removeVariant}
            />
          </Panel>
          <ResizeHandle label={t('Breite der Seitenleiste ändern')} />
          <Panel id="inspector-panel" className="layout-panel" defaultSize="320px" minSize="224px" maxSize="70%">
            <Inspector
              key={restored}
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
                variants.deselect()
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
                save={{
                  disabled: !(image && !document.exporting),
                  title: `${t('{{format}} exportieren', { format: document.exportFormat.toUpperCase() })} (${exportKey.replace('Shift+', t('Umschalt') + '+')})`,
                  onClick: document.download
                }}
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
          session={session}
          busy={generation.running || document.importing || document.exporting}
          onClose={settings.close}
        />
      )}
    </>
  )
}
