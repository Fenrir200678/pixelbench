import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adjustWeight, forgeBrackets, hasWeights, stripWeights, weightTokens } from '../src/editor/promptWeights.ts'
import { buildGraph, profiles } from '../server/profiles.mjs'

const weighted = (text) =>
  weightTokens(text)
    .filter((token) => token.kind === 'text' && token.weight !== 1)
    .map((token) => [token.text, token.weight])

test('weight tokens follow ComfyUI: explicit weights, 1.1 per plain bracket, nesting multiplies', () => {
  assert.deepEqual(weighted('a (red:1.3) car'), [['red', 1.3]])
  assert.deepEqual(weighted('((big)) dog'), [['big', 1.21]])
  // b: 2 × 0.5 = 1, so only a stays weighted.
  assert.deepEqual(weighted('(a (b:0.5):2)'), [['a ', 2]])
  assert.deepEqual(weighted('(x:-1)'), [['x', -1]])
  // A colon without a number keeps the text and the default weight.
  assert.deepEqual(weighted('(time: noon)'), [['time: noon', 1.1]])
})

test('escaped and unmatched brackets stay plain text', () => {
  assert.deepEqual(weighted('\\(literal\\) and (open'), [])
  assert.equal(hasWeights('\\(literal\\) and (open'), false)
  assert.equal(hasWeights('a (red:1.2)'), true)
  assert.equal(
    weightTokens('a ) b')
      .map((token) => token.text)
      .join(''),
    'a ) b'
  )
})

test('stripping removes the syntax and unescapes literal brackets', () => {
  assert.equal(stripWeights('a (red:-1) car, ((big)), (x (y:0.5))'), 'a red car, big, x y')
  assert.equal(stripWeights('\\(literal\\) (open'), '(literal) (open')
})

test('Ctrl+arrow wraps the word at the cursor or the selection, and adjusts existing groups', () => {
  assert.deepEqual(adjustWeight('a red car', 3, 3, 0.05), { text: 'a (red:1.05) car', start: 3, end: 6 })
  assert.deepEqual(adjustWeight('a red car', 2, 9, 0.1), { text: 'a (red car:1.1)', start: 3, end: 10 })
  // Surrounding whitespace of the selection stays outside the brackets.
  assert.equal(adjustWeight('a red car', 1, 6, 0.1)?.text, 'a (red:1.1) car')
  assert.equal(adjustWeight('a (red) car', 5, 5, 0.05)?.text, 'a (red:1.15) car')
  assert.equal(adjustWeight('a (red:1.2) car', 3, 6, -0.1)?.text, 'a (red:1.1) car')
  // Back at 1 the brackets go away.
  assert.deepEqual(adjustWeight('a (red:1.05) car', 5, 5, -0.05), { text: 'a red car', start: 2, end: 5 })
  assert.equal(adjustWeight('a (red:1.95) car', 5, 5, 0.1)?.text, 'a (red:2) car')
  assert.equal(adjustWeight('(red:0.1)', 2, 2, -0.2, [-1, 2])?.text, '(red:-0.1)')
  // Inside a group, a partial selection gets its own nested group.
  assert.equal(adjustWeight('(red car:1.2)', 1, 4, 0.1)?.text, '((red:1.1) car:1.2)')
  assert.equal(adjustWeight('a  b', 2, 2, 0.1), undefined)
})

test('Forge de-emphasis brackets become ComfyUI weights, prompt editing stays', () => {
  assert.equal(forgeBrackets('[blurry], [[ugly]]'), '(blurry:0.91), (ugly:0.83)')
  assert.equal(forgeBrackets('[a:b:0.5], [a|b], \\[x]'), '[a:b:0.5], [a|b], \\[x]')
})

function profileOf(id, extra = {}) {
  const { definition } = profiles.find(({ definition }) => definition.id === id)
  const choices = Object.fromEntries(
    Object.entries(definition.parameters)
      .filter(([, p]) => typeof p.default === 'string')
      .map(([key, p]) => [key, [p.default]])
  )
  return { ...definition, models: [], choices, ...extra }
}

const create = { tool: 'create', seed: 7, size: [1024, 1024] }

test('CLIP profiles keep the weights, encoders without weights get the plain text', () => {
  const sdxl = profileOf('sdxl-t2i', { weightsActive: true })
  const prompt = 'a (red:1.3) car'
  const { graph } = buildGraph(sdxl, { ...create, prompt, negative: '(blurry:1.2)' }, 'job')
  assert.equal(graph.positive.inputs.text, prompt)
  assert.equal(graph.negative.inputs.text, '(blurry:1.2)')
  const zimage = profileOf('zimage-turbo-t2i')
  const [node, input] = zimage.bindings.prompt
  const plain = buildGraph(zimage, { ...create, prompt: 'a (red:1.3) car,  ((big))' }, 'job').graph
  assert.equal(plain[node].inputs[input], 'a red car, big')
})

test('Krea 2 weights go through Krea2PromptWeight after the LoRAs and before the seed variance', () => {
  const krea = profileOf('krea2-t2i', { weightsActive: true, loraCatalog: ['style.safetensors'] })
  const loras = [{ name: 'style.safetensors', strength: 0.8 }]
  const prompt = 'a (red:-1) car'
  const { graph } = buildGraph(krea, { ...create, prompt, loras, variance: 1 }, 'job')
  assert.deepEqual(graph.weights.inputs, { clip: ['clip', 0], model: ['lora1', 0], text: prompt, strength: 1 })
  assert.equal(graph.weights.class_type, 'Krea2PromptWeight')
  assert.deepEqual(graph.sample.inputs.model, ['weights', 0])
  assert.deepEqual(graph.variance.inputs.conditioning, ['weights', 1])
  assert.deepEqual(graph.negative.inputs.conditioning, ['weights', 1])

  // Without weights in the prompt, or without the node, the template graph stays as it is.
  const unweighted = buildGraph(krea, { ...create, prompt: 'a red car' }, 'job').graph
  assert.equal(unweighted.weights, undefined)
  assert.deepEqual(unweighted.sample.inputs.model, ['unet', 0])
  const missing = buildGraph({ ...krea, weightsActive: false }, { ...create, prompt }, 'job').graph
  assert.equal(missing.weights, undefined)
  assert.equal(missing.positive.inputs.text, 'a red car')

  const inpaint = profileOf('krea2-inpaint', { weightsActive: true })
  const edit = buildGraph(inpaint, { ...create, tool: 'inpaint', prompt, image: 'x', mask: 'y' }, 'job').graph
  assert.deepEqual(edit.weights.inputs.model, ['diff', 0])
  assert.deepEqual(edit.sample.inputs.model, ['weights', 0])
  assert.deepEqual(edit.diff.inputs.model, ['unet', 0])
})
