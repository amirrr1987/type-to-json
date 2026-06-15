import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { parseFile } from './parser.js'
import { generateMapping } from './generator.js'
import { buildResolverConfig } from './resolver.js'
import { applyOutputTransforms } from './output.js'
import { loadTsConfigAliases, mergeAliasMaps } from './tsconfig-loader.js'
import type { AliasMap, MappingOptions, OutputMapping } from './types.js'
import type { ExportEntry, TypeToJsonConfig } from './config.js'

export interface ExportInterfaceOptions {
  basePath?: string
  aliases?: AliasMap
  resolvePaths?: string[]
  /** Only export types from this namespace in the input file */
  namespace?: string
  extendsTsConfig?: string
  flatten?: boolean
  mergeExisting?: boolean
  includePrimitives?: boolean
  expandArrays?: boolean
  primitiveKey?: string
}

function resolveMappingOptions(
  entry: Partial<ExportEntry>,
  global: ExportInterfaceOptions,
): MappingOptions {
  return {
    includePrimitives: entry.includePrimitives ?? global.includePrimitives,
    expandArrays: entry.expandArrays ?? global.expandArrays,
    primitiveKey: global.primitiveKey,
  }
}

function resolveOutputOptions(
  entry: Partial<ExportEntry>,
  global: ExportInterfaceOptions,
  outputPath: string,
) {
  return {
    flatten: entry.flatten ?? global.flatten,
    mergeExisting: entry.mergeExisting ?? global.mergeExisting,
    outputPath,
  }
}

export function exportInterfaceToJson(
  input: string,
  output: string,
  options: ExportInterfaceOptions = {},
): OutputMapping {
  const basePath = options.basePath ?? process.cwd()
  const inputFile = resolve(basePath, input)
  const outputFile = resolve(basePath, output)
  const tsconfigAliases = loadTsConfigAliases(basePath, options.extendsTsConfig)
  const mergedAliases = mergeAliasMaps(tsconfigAliases, options.aliases ?? {})

  const config = buildResolverConfig(
    inputFile,
    mergedAliases,
    options.resolvePaths ?? [],
    basePath,
    options.extendsTsConfig,
  )

  const mappingOptions = resolveMappingOptions({}, options)

  const ctx = parseFile(inputFile, config, {
    namespace: options.namespace,
    mapping: mappingOptions,
  })
  const raw = generateMapping(ctx)
  const mapping = applyOutputTransforms(raw, resolveOutputOptions({}, options, outputFile))

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')

  return mapping
}

export function exportInterfaceEntries(
  entries: ExportEntry[],
  options: ExportInterfaceOptions = {},
): void {
  const basePath = options.basePath ?? process.cwd()
  const tsconfigAliases = loadTsConfigAliases(basePath, options.extendsTsConfig)
  const mergedAliases = mergeAliasMaps(tsconfigAliases, options.aliases ?? {})

  for (const entry of entries) {
    const inputFile = resolve(basePath, entry.input)
    const outputFile = resolve(basePath, entry.output)

    const config = buildResolverConfig(
      inputFile,
      mergedAliases,
      options.resolvePaths ?? [],
      basePath,
      options.extendsTsConfig,
    )

    const ctx = parseFile(inputFile, config, {
      namespace: entry.namespace ?? options.namespace,
      mapping: resolveMappingOptions(entry, options),
    })

    const raw = generateMapping(ctx)
    const mapping = applyOutputTransforms(
      raw,
      resolveOutputOptions(entry, options, outputFile),
    )

    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')
  }
}

export function resolveConfigOptions(config: TypeToJsonConfig): ExportInterfaceOptions {
  return {
    aliases: config.aliases,
    resolvePaths: config.resolvePaths,
    extendsTsConfig: config.extendsTsConfig,
    flatten: config.flatten,
    mergeExisting: config.mergeExisting,
    includePrimitives: config.includePrimitives,
    expandArrays: config.expandArrays,
    primitiveKey: config.primitiveKey,
  }
}
