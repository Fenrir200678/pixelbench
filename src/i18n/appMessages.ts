import type { NoticeValues } from '../types/editor.js'
import i18n from './index.js'

// The bridge returns English text for its API and logs. Translate known messages and keep details such as
// paths, node identifiers and external output intact. The tables run in both languages: in English the
// templates come back as written, while embedded UI labels (still German keys) are translated.
type Pattern = [RegExp, (parts: string[]) => string]

const german = () => i18n.language === 'de'

const prefixes = [
  'Invalid launch option: ',
  'Could not check for updates · ',
  'Could not download the update · ',
  'Pixelbench sets this option itself: ',
  'Cannot reach ComfyUI · ',
  'External connection configured · ',
  'Pixelbench ready · ',
  'Starting private ComfyUI · ',
  'ComfyUI connected · ',
  'Preparing inputs · ',
  'Could not release the ComfyUI cache · ',
  'Models · ',
  'Strength ',
  'Connection to ComfyUI lost. ',
  'Could not remove all temporary job files. ',
  'Used cache · ',
  'Upscaling · ',
  'Detection · ',
  'Could not open the picker · ',
  'Upscale model is not available in the loader · ',
  'LoRA is unavailable in the loader · ',
  'Invalid LoRA strength · ',
  'Missing node: ',
  'Missing node input: ',
  'Default value unavailable: '
]
const patterns: Pattern[] = [
  [
    /^Restarting private ComfyUI · attempt (\d+) of 3$/,
    ([attempt]) => i18n.t('Restarting private ComfyUI · attempt {{attempt}} of 3', { attempt })
  ],
  [
    /^([\s\S]+) Restarting \(attempt (\d+) of 3\) …$/,
    ([details, attempt]) => appMessage(details) + ' ' + i18n.t('Restarting (attempt {{attempt}} of 3) …', { attempt })
  ],
  [
    /^Hires fix · (.+ px) · Details (\S+)(?: · (\d+) steps)?(?: · (\d+) tiles)?$/,
    ([size, strength, steps, tiles]) =>
      i18n.t('Hires fix') +
      ' · ' +
      size +
      ' · Details ' +
      strength +
      (steps ? ' · ' + i18n.t('{{steps}} steps', { steps }) : '') +
      (tiles ? ' · ' + i18n.t('{{tiles}} tiles', { tiles }) : '')
  ],
  [
    /^([\s\S]+) Automatic restart abandoned after 3 attempts in 5 minutes\. Restart in Settings\.$/,
    ([details]) =>
      appMessage(details) +
      ' ' +
      i18n.t('Automatic restart abandoned after 3 attempts in 5 minutes. Restart in Settings.')
  ],
  [/^Running (.+)$/, ([node]) => i18n.t('Running {{node}}', { node })],
  [
    /^The private ComfyUI process exited \(([^)]+)\)\.$/,
    ([code]) => i18n.t('The private ComfyUI process exited ({{code}}).', { code })
  ],
  [/^Loading (.+) into VRAM …$/, ([model]) => i18n.t('Loading {{model}} into VRAM …', { model })],
  [
    /^(.+) loaded · (.+ GB)$/,
    ([model, size]) => i18n.t('{{model}} loaded · {{size}}', { model, size: german() ? size.replace('.', ',') : size })
  ],
  [/^VRAM · (.+) \((.+)\)$/, ([model, kind]) => 'VRAM · ' + model + ' (' + i18n.t(kind) + ')'],
  [
    /^Tile (\d+) \/ (\d+) · Sampling (.+)$/,
    ([tile, total, step]) => i18n.t('Tile {{tile}} / {{total}} · Sampling {{step}}', { tile, total, step })
  ],
  [
    /^Invalid value for (.+)\.$/,
    ([parameter]) => i18n.t('Invalid value for {{parameter}}.', { parameter: i18n.t(parameter) })
  ],
  [/^Select (.+)\.$/, ([model]) => i18n.t('Select {{model}}.', { model: i18n.t(model) })],
  [
    /^File unavailable in the loader for (.+?) · ([\s\S]+)$/,
    ([model, file]) => i18n.t('File unavailable in the loader for {{model}} · {{file}}', { model: i18n.t(model), file })
  ],
  [
    /^(.+?) is missing \((.+)\)\. Search path: ([\s\S]*)$/,
    ([model, files, path]) =>
      i18n.t('{{model}} is missing ({{files}}). Search path: {{path}}', {
        model: i18n.t(model),
        files: files.replace(/(?<=\.(?:safetensors|sft|ckpt|pt|pt2|bin|pth|pkl)) or /gi, german() ? ' oder ' : ' or '),
        path: /^\w+ in this instance’s search configuration$/.test(path)
          ? path.replace(' in this instance’s search configuration', i18n.t(' in this instance’s search configuration'))
          : path
      })
  ],
  [
    /^(.+?) · ((?:Missing node: |Missing node input: |Default value unavailable: |Check backend)[\s\S]*)$/,
    ([profile, reason]) => profile + ' · ' + appMessage(reason)
  ]
]

export function appMessage(message: string | undefined, values?: NoticeValues): string {
  if (!message) return ''
  if (values) return i18n.t(message, values)
  const prefix = prefixes.find((key) => message.startsWith(key))
  if (prefix) return i18n.t(prefix) + appMessage(message.slice(prefix.length))
  for (const [pattern, render] of patterns) {
    const match = message.match(pattern)
    if (match) return render(match.slice(1))
  }
  return i18n.t(message)
}

export function bridgeLogMessage(line: string) {
  const [, job = '', message, elapsed = ''] = line.match(/^([\da-f]{8} · )?(.*?)( · \d+\.\d+ s)?$/) ?? ['', '', line]
  return job + appMessage(message) + elapsed
}
