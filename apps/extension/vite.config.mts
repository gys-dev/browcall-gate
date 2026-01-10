/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'
import dts from 'unplugin-dts/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/extension',

  plugins: [
    react(),
    nxCopyAssetsPlugin(['*.md', 'manifest.json']),
    nxViteTsPaths(),
    dts({
      insertTypesEntry: false,
      tsconfigPath: path.resolve(__dirname, 'tsconfig.json'),
    }),
  ],

  build: {
    outDir: '../../dist/apps/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
})
