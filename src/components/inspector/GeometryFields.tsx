import { useTranslation } from 'react-i18next'
import { sizeLabel } from '../../editor/geometry.js'
import type { Workflow } from '../../hooks/useWorkflow.js'
import type { Notice, Tool, Work } from '../../types/editor.js'
import type { Margins, Rect } from '../../types/image.js'
import { CollapsibleSection } from '../../ui/CollapsibleSection.js'
import { CreateSizeFields, type SourceSwitch } from './CreateSizeFields.js'
import { FrameFields, GenerationFrameFields } from './FrameFields.js'
import { GenerationSize } from './GenerationSize.js'

export function SizeFields({
  workflow,
  tool,
  work,
  onCrop,
  onMargins,
  notice,
  sourceSwitch
}: {
  workflow: Workflow
  tool: Tool
  work?: Work
  onCrop: (value?: Rect) => void
  onMargins: (value: Margins) => void
  notice: Notice
  sourceSwitch?: SourceSwitch
}) {
  const { t } = useTranslation()
  if (tool === 'create')
    return <CreateSizeFields workflow={workflow} source={work?.image} sourceSwitch={sourceSwitch} />
  const { measurement, prefs } = workflow
  const summary = measurement && sizeLabel(...measurement.effective) + ' px' + (prefs.auto ? ' · Auto' : '')
  return (
    <CollapsibleSection id="size-settings" title={t('Größe')} summary={summary}>
      {tool === 'outpaint' ? (
        <FrameFields work={work} workflow={workflow} onMargins={onMargins} notice={notice} />
      ) : (
        work && <GenerationFrameFields work={work} tool={tool} workflow={workflow} onCrop={onCrop} />
      )}
      <GenerationSize workflow={workflow} tool={tool} />
    </CollapsibleSection>
  )
}
