import { randomUUID } from 'node:crypto'

const entries = []
const stream = randomUUID()
let cursor = 0

export function log(source, message) {
  // eslint-disable-next-line no-control-regex -- Match terminal escape sequences in ComfyUI logs.
  const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g
  const line = String(message).replace(ansiEscape, '').trimEnd().slice(0, 1600)
  if (!line.trim()) return
  entries.push({ id: ++cursor, at: Date.now(), source, line })
  if (entries.length > 480) entries.shift()
}

export function readLogs(after, previousStream) {
  return { cursor, stream, entries: previousStream === stream ? entries.filter((entry) => entry.id > after) : entries }
}

// Progress bars redraw a line with "\r". Only the last state is useful.
const finalState = (line) => line.replace(/\r+$/, '').split('\r').at(-1)

// onLine receives each finished line, for example to follow the running job.
export function capture(stream, onLine) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    const lines = (pending + chunk).split('\n')
    pending = lines.pop().slice(-1600)
    for (const line of lines) {
      const state = finalState(line)
      log('ComfyUI', state)
      onLine?.(state)
    }
  })
  stream.on('end', () => log('ComfyUI', finalState(pending)))
}
