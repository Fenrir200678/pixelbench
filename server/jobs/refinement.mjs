// Short adaptations of InvokeAI's Qwen-Image Edit, FLUX.2 and Krea 2 presets for text-only refinement.
const qwenEdit =
  'Write direct editing instructions. Identify the target, change and placement. For replacements, name both the old and new elements. Keep explicit preservation instructions.'
const kreaInpaint =
  'Describe the final visible content in the mask in one cohesive paragraph. Group subjects with their colors, materials, actions and positions. Retain the requested medium and lightly polish detailed input.'
const qwenOutpaint =
  'Write a direct instruction to extend the image. Describe what should appear beyond the current edges.'
const kreaCreate =
  'Describe the complete image in one cohesive paragraph. Start with the main subject, then setting, colors, materials, lighting, camera and composition. Retain the requested medium and style.'
const inpaintPresets = {
  'krea2-inpaint': kreaInpaint,
  'krea2-lanpaint': kreaInpaint,
  'moss-image-turbo-inpaint': kreaInpaint,
  'moss-image-turbo-lanpaint': kreaInpaint,
  'qwen21-turbo-fun': kreaInpaint,
  'flux-fill':
    'Use natural sentences to describe the content to fill, including requested textures, materials and lighting.',
  'sdxl-inpaint': 'Use a compact description of the subject, appearance and placement within the masked area.'
}
const editPresets = {
  qwen21: qwenEdit,
  'qwen21-turbo': qwenEdit,
  'qwen21-turbo-fun': qwenEdit,
  'krea2-edit':
    'Write one plain instruction that names the change. For outfits, say concretely what is worn and what is gone. Describe light by where it lands.',
  'flux2-klein':
    'Describe the edit first. Clarify specified forms, textures, materials, lighting and spatial relationships. Keep structured inputs structured.'
}
const outpaintPresets = {
  'qwen21-turbo-fun': qwenOutpaint,
  'flux-fill': 'Describe what fills the new area and how its materials, lighting and geometry continue the scene.',
  'sdxl-inpaint': 'Use a compact visual description of the new area, matching the specified surroundings.'
}
const createPresets = {
  'sdxl-t2i':
    'Use a compact visual description: subject, setting, style, lighting and composition as short comma-separated phrases.',
  'krea2-t2i': kreaCreate,
  'moss-image-t2i': kreaCreate,
  'moss-image-turbo-t2i': kreaCreate
}
const refinementPresets = {
  create: createPresets,
  upscale: createPresets,
  edit: editPresets,
  inpaint: inpaintPresets,
  outpaint: outpaintPresets
}
const fallbackInstructions = {
  create: kreaCreate,
  upscale: kreaCreate,
  edit: qwenEdit,
  inpaint: kreaInpaint,
  outpaint: qwenOutpaint
}
const refinementByTool = {
  create:
    'For a bare concept, add a few compatible visual details about setting, light and composition. ' +
    'If the request is already detailed, only polish the wording and keep every stated attribute.',
  upscale: 'Describe the existing image as it is, with its subject, materials and lighting. Do not add new elements.',
  edit: 'For a broad creative request, add a few compatible visible details that clarify the result. For a precise edit, keep the change narrow and do not add unrelated changes.',
  inpaint:
    'Start directly with the subject or visible content. Write a caption of what should appear in the mask. ' +
    'If the request specifies an exact change, a restriction or several visual attributes, only polish the wording. ' +
    'Example: "small copper ring, flat top, no engraving" becomes "A small copper ring with a flat, unengraved top." ' +
    'Expand only a bare creative concept with two to four fitting visual details. Example: "dragon in fog" becomes ' +
    '"A dark-scaled dragon with folded wings, its silhouette partly obscured by low gray fog."',
  outpaint:
    'Describe the visible extension. For a sparse concept, add a few compatible details about materials, depth or light. ' +
    'Follow explicit continuation directions closely and keep existing scene elements consistent.'
}

const areas = { top: 'above', bottom: 'below', left: 'to the left of', right: 'to the right of' }
const list = (items) => (items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items.at(-1) : items[0])

// Outpainting with an image: the vision model describes the new area from what the image shows.
function visionGraph({ file, type }, { prompt, sides }, jobId) {
  const where = list(sides.map((side) => areas[side])) + ' the image'
  return {
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: file, type, device: 'default' } },
    image: { class_type: 'LoadImage', inputs: { image: jobId + '/image.png' } },
    refine: {
      class_type: 'TextGenerateV2',
      inputs: {
        clip: ['clip', 0],
        'images.image1': ['image', 0],
        prompt: prompt.trim() || 'Describe the new area ' + where + '.',
        system_prompt:
          'You write prompts for an image outpainting model. The attached image will be extended into a new area ' +
          where +
          '. Describe only what should appear in that new area so that it continues the image seamlessly: ' +
          'first the parts of cut-off subjects and objects that continue there, then the ground, background or sky around them. ' +
          'Briefly name the medium, style, lighting and color palette of the image. ' +
          'Do not describe what is only visible in the existing image and do not add new main subjects. ' +
          'If the user asks for specific content, include it. ' +
          'Write one or two concise English sentences. Return only the prompt, without Markdown, explanations or alternatives.',
        max_length: 256,
        sampling_mode: 'off',
        thinking: false
      }
    },
    preview: { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } }
  }
}

export function refinementGraph(model, data, jobId) {
  if (data.image !== undefined) return visionGraph(model, data, jobId)
  const { file, type } = model
  const { prompt, tool, profile } = data
  const instruction = (profile && refinementPresets[tool][profile]) || fallbackInstructions[tool]
  return {
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: file, type, device: 'default' } },
    refine: {
      class_type: 'TextGenerateV2',
      inputs: {
        clip: ['clip', 0],
        prompt,
        system_prompt:
          'Rewrite the user input as a concise English prompt for an image editor. ' +
          instruction +
          ' ' +
          refinementByTool[tool] +
          ' Preserve the subject, explicit constraints, quoted text, quantities and exact <imageN> references. ' +
          'Skip generic preambles such as "Create an image of". ' +
          'Write the entire answer in English even if the input is in another language. The only exception is literal text the user wants to appear in the image. ' +
          'Return only the prompt, without Markdown, explanations or alternatives.',
        max_length: 256,
        sampling_mode: 'off',
        thinking: false
      }
    },
    preview: { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } }
  }
}
