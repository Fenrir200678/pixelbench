import { createInterface } from 'node:readline/promises'
import { styleText } from 'node:util'

const interactive = process.stdin.isTTY && process.stdout.isTTY
let assumeYes = false

export function setAssumeYes(value) {
  assumeYes = value
}

export const ui = {
  step: (text) => console.log('\n' + styleText('bold', '» ' + text)),
  ok: (text) => console.log(styleText('green', '  ✓ ') + text),
  info: (text) => console.log('    ' + text),
  warn: (text) => console.log(styleText('yellow', '  ! ') + text),
  fail: (text) => console.log(styleText('red', '  ✗ ') + text)
}

/** Asks one question. Without a terminal or with --yes, the fallback answer is used. */
export async function ask(question, fallback = '') {
  if (!interactive || assumeYes) return fallback
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await prompt.question('  ? ' + question + (fallback ? ' [' + fallback + ']' : '') + ' ')).trim()
    return answer || fallback
  } finally {
    prompt.close()
  }
}

export async function confirm(question, fallback = true) {
  const answer = await ask(question + (fallback ? ' (Y/n)' : ' (y/N)'))
  if (!answer) return fallback
  return /^y(es)?$/i.test(answer)
}

/** Lets the user pick one entry by number. Returns undefined for "none of these". */
export async function choose(question, entries, label) {
  entries.forEach((entry, index) => ui.info(index + 1 + ') ' + label(entry)))
  ui.info('0) None of these, enter a path')
  const answer = await ask(question, '1')
  const index = Number(answer)
  if (!Number.isInteger(index) || index < 0 || index > entries.length) {
    ui.warn('Unknown choice: ' + answer)
    return choose(question, entries, label)
  }
  return index === 0 ? undefined : entries[index - 1]
}
