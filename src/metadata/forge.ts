import type { GenerationInfo, MetadataField } from './types.js'

// The settings line of A1111 and Forge: "Steps: 20, Sampler: Euler, Lora hashes: "a: 1, b: 2", Seed: 5".
const settingPattern = /\s*([\w][\w \-/+.()]*?):\s*("(?:\\.|[^\\"])*"|[^,]*)(?:,|$)/g

export function parseSettings(line: string): MetadataField[] {
  const fields: MetadataField[] = []
  for (const [, key, rawValue] of line.matchAll(settingPattern)) {
    const value = rawValue.trim()
    const quoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    fields.push({ key: key.trim(), value: quoted ? value.slice(1, -1).replace(/\\(.)/g, '$1') : value })
  }
  return fields
}

// Prompt lines, then "Negative prompt:" lines, then one settings line. Each part may be missing.
export function parseForge(text: string): GenerationInfo {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  const last = lines.at(-1) ?? ''
  const fields = parseSettings(last)
  const hasSettings = fields.length >= 3 && /(^|,\s*)Steps:\s*\d/.test(last)
  if (hasSettings) lines.pop()
  const body = lines.join('\n')
  const negativeAt = body.search(/(^|\n)Negative prompt:/)
  const prompt = (negativeAt < 0 ? body : body.slice(0, negativeAt)).trim()
  const negative =
    negativeAt < 0
      ? ''
      : body
          .slice(negativeAt)
          .replace(/^\n?Negative prompt:/, '')
          .trim()
  return {
    source: 'forge',
    prompt: prompt || undefined,
    negative: negative || undefined,
    fields: hasSettings ? fields : [],
    raw: [{ key: 'parameters', value: text }]
  }
}
