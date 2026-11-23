import { useEffect, useRef } from 'react'
import { forgeBrackets } from '../editor/promptWeights.js'
import { settingsForProfile } from '../editor/sendSettings.js'
import { settingsOf, type GenerationSettings } from '../metadata/settings.js'
import type { GenerationInfo } from '../metadata/index.js'
import type { Status } from '../types/api.js'
import type { Notice, Tool } from '../types/editor.js'
import type { Workflow } from './useWorkflow.js'

export type SendTarget = Extract<Tool, 'create' | 'edit' | 'inpaint'>
type Pending = { target: SendTarget; settings: GenerationSettings }

// "Übernehmen in …" for generation data: switch the mode, then fill in what its profile can use.
// The settings wait for the mode's profile, because parameters and limits belong to the profile.
export function useSendSettings(
  tool: Tool,
  chooseTool: (tool: Tool) => void,
  workflow: Workflow,
  status: Status | undefined,
  notice: Notice
) {
  const pending = useRef<Pending>(undefined)
  const profile = workflow.profile

  function apply(settings: GenerationSettings) {
    if (!profile) return
    const { parameters, loras, size, skipped } = settingsForProfile(settings, profile, status?.loras ?? [])
    workflow.setPrompt(settings.prompt ?? '')
    if (profile.negative) workflow.setNegative(settings.negative ?? '')
    else if (settings.negative) skipped.push('Negative prompt')
    for (const [key, value] of Object.entries(parameters)) workflow.updateParameter(key, value)
    if (settings.seed !== undefined) workflow.updatePrefs({ seedMode: 'fixed', seed: settings.seed })
    if (tool === 'create' && size) workflow.updatePrefs({ createW: size[0], createH: size[1] })
    if (profile.lora) workflow.replaceLoras(loras)
    notice(
      skipped.length ? 'Einstellungen übernommen. Nicht übernommen: {{skipped}}' : 'Einstellungen übernommen.',
      true,
      { skipped: skipped.join(', ') }
    )
  }

  useEffect(() => {
    const next = pending.current
    if (!next || tool !== next.target || !profile) return
    pending.current = undefined
    apply(next.settings)
    // Runs once the target mode and its profile are active. apply reads the workflow of that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, profile])

  return (info: GenerationInfo, target: SendTarget) => {
    // Forge's [text] lowers the weight, ComfyUI only knows (text:0.91).
    const forge = (text?: string) => (text && info.source === 'forge' ? forgeBrackets(text) : text)
    const parsed = settingsOf(info)
    const settings = { ...parsed, prompt: forge(parsed.prompt), negative: forge(parsed.negative) }
    if (target === tool) {
      apply(settings)
      return
    }
    pending.current = { target, settings }
    chooseTool(target)
  }
}
