import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
    root: __dirname,
    plugins: [nxViteTsPaths()],
    build: {
        outDir: '../../dist/apps/extension',
        emptyOutDir: false,

        rollupOptions: {
            input: path.resolve(__dirname, 'src/inject.ts'),
            output: {
                format: 'iife',
                inlineDynamicImports: true,
                entryFileNames: 'inject.js',
                name: 'InjectScript',
            },
        },
    },
})
