import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'frontend/src'),
    },
  },
})