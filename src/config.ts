import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { tmpdir } from 'os'
import ts from 'typescript'
import type { AliasMap, MappingOptions } from './types.js'

export const CONFIG_FILENAME = 'type-to-json.config.ts'
export const NPM_SCRIPT_NAME = 'type-json'

export interface ExportEntry {
  input: string
  output: string
  /** Only export types from this namespace in the input file */
  namespace?: string
  /** Dot-path keys instead of nested objects (e.g. `data.id`) */
  flatten?: boolean
  /** Preserve existing translated values in the output file */
  mergeExisting?: boolean
  /** Emit placeholder key for primitive-only exports */
  includePrimitives?: boolean
  /** Expand `ItemDTO[]` into nested item field keys */
  expandArrays?: boolean
}

export interface TypeToJsonConfig {
  entries: ExportEntry[]
  aliases?: AliasMap
  resolvePaths?: string[]
  /** Reuse path aliases from a tsconfig (e.g. `./tsconfig.app.json`) */
  extendsTsConfig?: string
  flatten?: boolean
  mergeExisting?: boolean
  includePrimitives?: boolean
  expandArrays?: boolean
  primitiveKey?: string
}

export function defineConfig(config: TypeToJsonConfig): TypeToJsonConfig {
  return config
}

export const DEFAULT_CONFIG_TEMPLATE = `import { defineConfig } from 'type-to-json'

export default defineConfig({
  extendsTsConfig: './tsconfig.app.json',
  mergeExisting: true,
  entries: [
    {
      input: 'src/interfaces/example.interface.ts',
      output: 'src/locales/labels/example.fa.json',
    },
  ],
  aliases: {
    '@/': './src',
  },
})
`

function packageEntryUrl(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return pathToFileURL(join(currentDir, 'index.js')).href
}

function importTranspiledConfig(configPath: string): Promise<TypeToJsonConfig> {
  const source = readFileSync(configPath, 'utf-8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const rewritten = outputText.replace(
    /from\s+['"]type-to-json['"]/g,
    `from '${packageEntryUrl()}'`,
  )

  const tempDir = mkdtempSync(join(tmpdir(), 'type-to-json-'))
  const tempFile = join(tempDir, 'config.mjs')

  return (async () => {
    try {
      writeFileSync(tempFile, rewritten, 'utf-8')
      const module = await import(pathToFileURL(tempFile).href)
      const config = module.default ?? module.config
      if (!config || !Array.isArray(config.entries)) {
        throw new Error(`${CONFIG_FILENAME} must export a default config with an "entries" array`)
      }
      return config as TypeToJsonConfig
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })()
}

export async function loadConfig(cwd = process.cwd()): Promise<TypeToJsonConfig> {
  const configPath = resolve(cwd, CONFIG_FILENAME)
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }
  return importTranspiledConfig(configPath)
}
