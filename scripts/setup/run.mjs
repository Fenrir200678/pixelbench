import { spawn } from 'node:child_process'

/**
 * Runs a program and collects its output. Resolves with { code, stdout, stderr } and never rejects,
 * so callers can treat a missing program like a failed one.
 */
export function capture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let child
    try {
      child = spawn(command, args, { windowsHide: true, ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: -1, stdout, stderr: error.message })
      return
    }
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: error.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

/** Runs a program with its output shown in this console. Rejects when it fails. */
export function show(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error([command, ...args].join(' ') + ' failed with exit code ' + code))
    )
  })
}
