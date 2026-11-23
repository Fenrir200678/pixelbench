import { readFile, readdir } from 'node:fs/promises'

const jsonFile = async (url) => JSON.parse(await readFile(url, 'utf8'))
const profileRoot = new URL('../../profiles/', import.meta.url)
const list = await readdir(profileRoot)
export const profiles = await Promise.all(
  list
    .filter((name) => name.endsWith('.json'))
    .map(async (name) => {
      const definition = await jsonFile(new URL(name, profileRoot))
      const graph = await jsonFile(new URL('../../workflows/' + definition.workflow, import.meta.url))
      const outputs = Object.values(graph).filter((node) => /^(Save|Preview)/.test(node.class_type))
      if (outputs.length !== 1 || graph.preview?.class_type !== 'PreviewImage') {
        throw new Error('Workflow requires a single PreviewImage output: ' + definition.id)
      }
      for (const [node, input] of [
        ...Object.values(definition.bindings),
        ...definition.models.map((m) => [m.node, m.input])
      ]) {
        if (!graph[node] || !Object.hasOwn(graph[node].inputs, input))
          throw new Error('Invalid workflow binding: ' + node + '.' + input)
      }
      const lora = definition.lora
      if (
        lora &&
        [lora.model, lora.clip]
          .filter(Boolean)
          .some((ref) => !Array.isArray(ref) || !graph[ref[0]] || !Number.isInteger(ref[1]))
      )
        throw new Error('Invalid LoRA insertion point in profile: ' + definition.id)
      const variance = definition.variance
      if (
        variance &&
        (!Array.isArray(variance) || !graph[variance[0]] || !Array.isArray(graph[variance[0]].inputs[variance[1]]))
      )
        throw new Error('Invalid variation point in profile: ' + definition.id)
      const { weights, weightsModel } = definition
      if (
        (weights !== undefined && weights !== 'clip' && weights !== 'krea2') ||
        (weights === 'krea2' &&
          (!Array.isArray(weightsModel) ||
            !Array.isArray(graph[weightsModel[0]]?.inputs[weightsModel[1]]) ||
            !Array.isArray(graph[definition.bindings.prompt?.[0]]?.inputs.clip)))
      )
        throw new Error('Invalid prompt weights point in profile: ' + definition.id)
      const template = definition.img2img && (definition.img2img.denoise ?? definition.img2img.sigmas)
      if (
        definition.img2img &&
        (!graph.latent ||
          !Array.isArray(template) ||
          !graph[template[0]] ||
          !Object.hasOwn(graph[template[0]].inputs, template[1]))
      )
        throw new Error('Invalid img2img point in profile: ' + definition.id)
      const { sizes, parameters } = definition
      if (!Number.isInteger(sizes?.grid) || sizes.grid < 1 || sizes.min % sizes.grid || sizes.area < sizes.min ** 2)
        throw new Error('Invalid size rules in profile: ' + definition.id)
      for (const [key, parameter] of Object.entries(parameters)) {
        if (!Object.hasOwn(definition.bindings, key))
          throw new Error('Parameter without binding: ' + definition.id + '.' + key)
        if (
          typeof parameter.default !== 'string' &&
          !(Number.isFinite(parameter.min) && Number.isFinite(parameter.max))
        )
          throw new Error('Parameter without min/max: ' + definition.id + '.' + key)
        for (const tool of Object.keys(parameter.defaultsByTool ?? {})) {
          if (!definition.tools.includes(tool))
            throw new Error('Invalid tool in defaultsByTool: ' + definition.id + '.' + key + ' · ' + tool)
        }
      }
      return { definition, graph }
    })
)
