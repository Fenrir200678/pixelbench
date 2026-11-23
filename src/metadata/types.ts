// Generation data read from an image file, in one shape for every source.
export type MetadataSource = 'pixelbench' | 'forge' | 'comfyui' | 'other'
export type MetadataField = { key: string; value: string }
export type GenerationInfo = {
  source: MetadataSource
  prompt?: string
  negative?: string
  // Settings in reading order, such as Steps, Sampler, Seed and Size.
  fields: MetadataField[]
  // The stored text as it is, per key: "parameters" for Forge, "prompt" and "workflow" for ComfyUI.
  raw: MetadataField[]
}
