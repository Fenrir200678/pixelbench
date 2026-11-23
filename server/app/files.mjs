import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { decodeAsync, encodeAsync, validSize } from '../png.mjs'
import { badInput, readBody, reject, sendRaw } from './http.mjs'

export async function handlePng(req, res, url) {
  if (url.pathname === '/api/png/decode') {
    const body = await readBody(req, 100 * 1024 * 1024)
    const png = await badInput(() => decodeAsync(body))
    return sendRaw(res, png)
  }
  const w = Number(url.searchParams.get('w')),
    h = Number(url.searchParams.get('h'))
  if (!validSize(w, h)) reject('Invalid PNG export dimensions.')
  const body = await readBody(req, w * h * 4)
  const bytes = await badInput(() => encodeAsync(w, h, body))
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length })
  return res.end(bytes)
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

export function serveStatic(req, res, path, web) {
  const staticFile = path === '/' ? '/index.html' : path
  if (req.method === 'GET' && /^\/(?:index\.html|assets\/[\w-]+\.(?:js|css|woff2?))$/.test(staticFile)) {
    return sendAsset(res, web, staticFile)
  }
}

async function sendAsset(res, web, staticFile) {
  const file = await readFile(join(web, staticFile.slice(1)))
  res.writeHead(200, { 'Content-Type': contentTypes[staticFile.slice(staticFile.lastIndexOf('.'))] })
  return res.end(file)
}
