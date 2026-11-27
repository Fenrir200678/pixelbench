import type { DetailerSettings } from '../detailer.js'
import type { SessionAdjustments } from '../../hooks/useAdjustments.js'
import type { BackgroundSettings } from '../../hooks/useBackgroundRemoval.js'
import type { SessionTools } from '../../hooks/useCanvasTools.js'
import type { SessionDocument } from '../../hooks/useDocument.js'
import type { Inspection } from '../../hooks/useInspection.js'
import type { SessionVariants } from '../../hooks/useVariants.js'
import type { SessionWorkflow } from '../../hooks/useWorkflow.js'
import type { Tool } from '../../types/editor.js'
import type { ReferenceImage } from '../../types/image.js'

export type Workspace = {
  tool: Tool
  opacity: number
  variantsCollapsed: boolean
  workflow: SessionWorkflow
  detailer: DetailerSettings
  background: BackgroundSettings
  document: SessionDocument
  tools: SessionTools
  adjustments?: SessionAdjustments
  references: ReferenceImage[]
  variants: SessionVariants
  inspection?: Omit<Inspection, 'url'>
}
