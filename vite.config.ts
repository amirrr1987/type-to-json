import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'index.ts'),
        cli: resolve(__dirname, 'cli.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'typescript',
        'chalk',
        'ora',
        'commander',
        'vite',
        'path',
        'fs',
        'fs/promises',
        'url',
        'node:path',
        'node:fs',
        'node:fs/promises',
        'node:url',
        'node:process',
      ],
    },
    target: 'node18',
    ssr: true,
  },
})
