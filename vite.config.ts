import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version, author, license } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
  author: string
  license: string
}

const devHost = '127.0.0.1:5173'
const devOrigin = 'http://' + devHost
const backend = 'http://127.0.0.1:' + Number(process.env.PIXELBENCH_PORT ?? 3720)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_AUTHOR__: JSON.stringify(author),
    __APP_LICENSE__: JSON.stringify(license)
  },
  plugins: [
    react(),
    {
      name: 'pixelbench-api-origin',
      configureServer(server) {
        server.middlewares.use('/api', (request, response, next) => {
          const origin = request.headers.origin
          if (
            request.headers.host !== devHost ||
            request.headers['sec-fetch-site'] === 'cross-site' ||
            (origin && origin !== devOrigin)
          ) {
            response.writeHead(403).end()
            return
          }
          // Forward only the Vite origin as the backend's equivalent same-origin request.
          if (origin === devOrigin) request.headers.origin = backend
          next()
        })
      }
    }
  ],
  // ONNX Runtime Web finds its .wasm next to its own module. Pre-bundling would move the module away from it.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/': { target: backend, changeOrigin: true }
    }
  }
})
