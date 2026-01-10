import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
    root: __dirname,
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
