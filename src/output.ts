import { existsSync, readFileSync } from 'fs'
import type { OutputMapping, PropertyMapping, OutputMeta, SkippedExport } from './types.js'
import { OUTPUT_META_KEY } from './types.js'

function isNestedMapping(value: PropertyMapping | undefined): value is Record<string, PropertyMapping> {
  return typeof value === 'object' && value !== null
}

export function flattenPropertyMapping(
  mapping: Record<string, PropertyMapping>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(mapping)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      result[path] = path
    } else {
      Object.assign(result, flattenPropertyMapping(value, path))
    }
  }

  return result
}

export function flattenOutput(mapping: OutputMapping): OutputMapping {
  const result: OutputMapping = {}

  for (const [exportName, props] of Object.entries(mapping)) {
    if (exportName === OUTPUT_META_KEY) continue
    result[exportName] = flattenPropertyMapping(props)
  }

  return result
}

function mergePropertyMapping(
  generated: PropertyMapping,
  existing: PropertyMapping | undefined,
  key: string,
): PropertyMapping {
  if (typeof generated === 'string') {
    if (typeof existing === 'string' && existing !== key) {
      return existing
    }
    return generated
  }

  const merged: Record<string, PropertyMapping> = {}
  const existingObj = isNestedMapping(existing) ? existing : undefined

  for (const [childKey, childValue] of Object.entries(generated) as [string, PropertyMapping][]) {
    merged[childKey] = mergePropertyMapping(childValue, existingObj?.[childKey], childKey)
  }

  return merged
}

export function stripOutputMeta(mapping: OutputMapping): OutputMapping {
  const { [OUTPUT_META_KEY]: _, ...rest } = mapping
  return rest
}

export function attachOutputMeta(
  mapping: OutputMapping | Record<string, unknown>,
  skipped: SkippedExport[],
): Record<string, unknown> {
  if (skipped.length === 0) return mapping
  return { ...mapping, [OUTPUT_META_KEY]: { skipped } satisfies OutputMeta }
}

export function mergeOutputWithExisting(
  generated: OutputMapping,
  existing: OutputMapping,
): OutputMapping {
  const cleanExisting = stripOutputMeta(existing)
  const result: OutputMapping = { ...generated }

  for (const [exportName, existingProps] of Object.entries(cleanExisting)) {
    if (!result[exportName]) {
      result[exportName] = existingProps
      continue
    }

    const merged: Record<string, PropertyMapping> = {}
    const generatedProps = result[exportName]

    for (const [key, value] of Object.entries(generatedProps) as [string, PropertyMapping][]) {
      merged[key] = mergePropertyMapping(value, existingProps[key], key)
    }

    result[exportName] = merged
  }

  return result
}

export function loadExistingOutput(outputPath: string): OutputMapping | null {
  if (!existsSync(outputPath)) return null

  try {
    return JSON.parse(readFileSync(outputPath, 'utf-8')) as OutputMapping
  } catch {
    return null
  }
}

export type MergeStrategy = 'overwrite' | 'merge-labels'

export function applyOutputTransforms(
  mapping: OutputMapping,
  options: {
    flatten?: boolean
    mergeStrategy?: MergeStrategy
    mergeExisting?: boolean
    outputPath?: string
    skipped?: SkippedExport[]
    skippedInOutput?: boolean
  },
): Record<string, unknown> {
  let result: Record<string, unknown> = mapping

  if (options.flatten) {
    result = flattenOutput(result as OutputMapping)
  }

  const shouldMerge = options.mergeStrategy === 'merge-labels' || options.mergeExisting === true
  if (shouldMerge && options.outputPath) {
    const existing = loadExistingOutput(options.outputPath)
    if (existing) {
      result = mergeOutputWithExisting(result as OutputMapping, existing)
    }
  }

  if (options.skippedInOutput && options.skipped && options.skipped.length > 0) {
    result = attachOutputMeta(result, options.skipped)
  }

  return result
}
