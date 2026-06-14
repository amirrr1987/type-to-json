import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { parseFile } from './parser.js'
import { generateMapping } from './generator.js'
import { buildResolverConfig } from './resolver.js'
import type { AliasMap, OutputMapping } from './types.js'

export interface ExportInterfaceOptions {
  basePath?: string
  aliases?: AliasMap
  resolvePaths?: string[]
  /** Only export types from this namespace in the input file */
  namespace?: string
}

export function exportInterfaceToJson(
  input: string,
  output: string,
  options: ExportInterfaceOptions = {},
): OutputMapping {
  const basePath = options.basePath ?? process.cwd()
  const inputFile = resolve(basePath, input)
  const outputFile = resolve(basePath, output)
  const config = buildResolverConfig(
    inputFile,
    options.aliases ?? {},
    options.resolvePaths ?? [],
    basePath,
  )

  const ctx = parseFile(inputFile, config, { namespace: options.namespace })
  const mapping = generateMapping(ctx)

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')

  return mapping
}

export function exportInterfaceEntries(
  entries: Array<{ input: string; output: string; namespace?: string }>,
  options: ExportInterfaceOptions = {},
): void {
  for (const entry of entries) {
    exportInterfaceToJson(entry.input, entry.output, {
      ...options,
      namespace: entry.namespace ?? options.namespace,
    })
  }
}
