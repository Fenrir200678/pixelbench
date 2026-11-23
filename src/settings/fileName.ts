import type { PixelbenchRecord } from '../metadata/pixelbench.js'

export const fileNameTokens = ['name', 'date', 'time', 'seed', 'model', 'profile', 'width', 'height'] as const
type Token = (typeof fileNameTokens)[number]

const pad = (value: number) => String(value).padStart(2, '0')
const baseName = (path: string) => path.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')

/** Builds the export file name, without extension, from a pattern such as "{name}-{seed}". */
export function exportFileName(
  pattern: string,
  input: { name: string; width: number; height: number; record?: PixelbenchRecord; now?: Date }
) {
  const now = input.now ?? new Date()
  const { record } = input
  const values: Record<Token, string> = {
    name: baseName(input.name) || 'pixelbench',
    date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
    time: pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()),
    seed: record ? String(record.seed) : '',
    model: baseName(Object.values(record?.models ?? {})[0] ?? ''),
    profile: record?.profile ?? '',
    width: String(input.width),
    height: String(input.height)
  }
  const name = pattern
    .replace(/\{(\w+)\}/g, (match, token: string) => (Object.hasOwn(values, token) ? values[token as Token] : match))
    // Characters Windows does not allow in file names.
    // eslint-disable-next-line no-control-regex -- Control characters are invalid in file names.
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    // Tokens without a value leave separators behind, such as "photo--edit".
    .replace(/([-_. ])[-_. ]+/g, '$1')
    .replace(/^[-_. ]+|[-_. ]+$/g, '')
    .slice(0, 150)
  return name || values.name
}
