import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGraph, profiles } from '../server/profiles.mjs'

for (const id of ['qwen21', 'qwen21-turbo', 'qwen21-turbo-fun']) {
  test(id + ' preserves reference order and supports all 15 additional images', () => {
    const definition = profiles.find((p) => p.definition.id === id).definition
    const profile = { ...definition, models: [], choices: { sampler: ['euler'], scheduler: ['normal'] } }
    // Numeric defaults and enum values come from the workflow definition.
    for (const [key, parameter] of Object.entries(profile.parameters)) {
      if (typeof parameter.default === 'string') profile.choices[key] = [parameter.default]
    }
    const args = { tool: 'edit', prompt: 'Use <image2> and <image16> to edit <image1>', seed: 1, size: [512, 512] }
    const references = Array.from({ length: 15 }, (_, i) => 'payload-' + i)
    const { graph, files } = buildGraph(profile, { ...args, references }, 'job')
    assert.deepEqual(graph.encode.inputs['images.image_1'], ['image', 0])
    references.forEach((payload, i) => {
      assert.deepEqual(graph.encode.inputs['images.image_' + (i + 2)], ['reference' + (i + 2), 0])
      assert.equal(files[i + 1].payload, payload)
      assert.equal(graph['reference' + (i + 2)].inputs.image, 'job/' + files[i + 1].name)
    })
    const legacy = buildGraph(profile, { ...args, reference: 'old-payload' }, 'job')
    assert.equal(legacy.files[1].payload, 'old-payload')
    assert.throws(() => buildGraph(profile, { ...args, references: [...references, 'extra'] }, 'job'), /Too many/)
    assert.throws(
      () => buildGraph({ ...profile, reference: undefined }, { ...args, references: ['one'] }, 'job'),
      /does not support/
    )
  })
}
