import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { parseFile } from './parser.js'
import { generateMapping } from './generator.js'
import { buildResolverConfig } from './resolver.js'
import { applyOutputTransforms, type MergeStrategy } from './output.js'
import { loadTsConfigAliases, mergeAliasMaps } from './tsconfig-loader.js'
import { Errors } from './errors.js'
import { OUTPUT_META_KEY } from './types.js'
import type { AliasMap, MappingOptions, OutputMapping, GenerationResult } from './types.js'
import type { ExportEntry, TypeToJsonConfig } from './config.js'

export interface ExportInterfaceOptions {
  basePath?: string
  aliases?: AliasMap
  resolvePaths?: string[]
  namespace?: string
  extendsTsConfig?: string
  flatten?: boolean
  /** @deprecated Use mergeStrategy: 'merge-labels' */
  mergeExisting?: boolean
  mergeStrategy?: MergeStrategy
  includePrimitives?: boolean
  expandArrays?: boolean
  primitiveKey?: string
  useJsDocLabels?: boolean
  strict?: boolean
  warnOnSkip?: boolean
  skippedInOutput?: boolean
}

function resolveMappingOptions(
  entry: Partial<ExportEntry>,
  global: ExportInterfaceOptions,
): MappingOptions {
  return {
    includePrimitives: entry.includePrimitives ?? global.includePrimitives,
    expandArrays: entry.expandArrays ?? global.expandArrays,
    primitiveKey: global.primitiveKey,
    useJsDocLabels: entry.useJsDocLabels ?? global.useJsDocLabels,
  }
}

function resolveGenerationOptions(global: ExportInterfaceOptions) {
  return {
    strict: global.strict,
    warnOnSkip: global.warnOnSkip,
  }
}

function resolveMergeStrategy(
  entry: Partial<ExportEntry>,
  global: ExportInterfaceOptions,
): MergeStrategy | undefined {
  return entry.mergeStrategy
    ?? global.mergeStrategy
    ?? (entry.mergeExisting || global.mergeExisting ? 'merge-labels' : undefined)
}

function resolveOutputOptions(
  entry: Partial<ExportEntry>,
  global: ExportInterfaceOptions,
  outputPath: string,
  skipped: GenerationResult['skipped'],
) {
  return {
    flatten: entry.flatten ?? global.flatten,
    mergeStrategy: resolveMergeStrategy(entry, global),
    mergeExisting: entry.mergeExisting ?? global.mergeExisting,
    outputPath,
    skipped,
    skippedInOutput: entry.skippedInOutput ?? global.skippedInOutput,
  }
}

function writeOutput(
  mapping: Record<string, unknown>,
  outputFile: string,
): OutputMapping {
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')
  const labels = { ...mapping }
  delete labels[OUTPUT_META_KEY]
  return labels as OutputMapping
}

function assertNotStrict(skipped: GenerationResult['skipped'], strict?: boolean): void {
  if (strict && skipped.length > 0) {
    throw Errors.SKIPPED_EXPORTS(skipped.map((s) => s.name))
  }
}

export function runExport(
  input: string,
  output: string,
  options: ExportInterfaceOptions = {},
  entryOverrides: Partial<ExportEntry> = {},
): GenerationResult {
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

  const mergedEntry = { ...entryOverrides }
  const ctx = parseFile(inputFile, config, {
    namespace: mergedEntry.namespace ?? options.namespace,
    mapping: resolveMappingOptions(mergedEntry, options),
  })

  const result = generateMapping(ctx, resolveGenerationOptions(options))
  assertNotStrict(result.skipped, mergedEntry.strict ?? options.strict)

  const outputPayload = applyOutputTransforms(
    result.mapping,
    resolveOutputOptions(mergedEntry, options, outputFile, result.skipped),
  )

  const mapping = writeOutput(outputPayload, outputFile)
  return { mapping, skipped: result.skipped }
}

export function exportInterfaceToJson(
  input: string,
  output: string,
  options: ExportInterfaceOptions = {},
): OutputMapping {
  return runExport(input, output, options).mapping
}

export function exportInterfaceEntries(
  entries: ExportEntry[],
  options: ExportInterfaceOptions = {},
): GenerationResult {
  const allSkipped: GenerationResult['skipped'] = []
  let lastMapping: OutputMapping = {}

  for (const entry of entries) {
    const { mapping, skipped } = runExport(entry.input, entry.output, options, entry)
    lastMapping = mapping
    allSkipped.push(...skipped)
  }

  assertNotStrict(allSkipped, options.strict)
  return { mapping: lastMapping, skipped: allSkipped }
}

export function resolveConfigOptions(config: TypeToJsonConfig): ExportInterfaceOptions {
  return {
    aliases: config.aliases,
    resolvePaths: config.resolvePaths,
    extendsTsConfig: config.extendsTsConfig,
    flatten: config.flatten,
    mergeExisting: config.mergeExisting,
    mergeStrategy: config.mergeStrategy ?? (config.mergeExisting ? 'merge-labels' : undefined),
    includePrimitives: config.includePrimitives,
    expandArrays: config.expandArrays,
    primitiveKey: config.primitiveKey,
    useJsDocLabels: config.useJsDocLabels,
    strict: config.strict,
    warnOnSkip: config.warnOnSkip,
    skippedInOutput: config.skippedInOutput,
  }
}
