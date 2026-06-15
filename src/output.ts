import { existsSync, readFileSync } from 'fs'
import type { OutputMapping, PropertyMapping } from './types.js'

function isNestedMapping(value: PropertyMapping): value is Record<string, PropertyMapping> {
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
      result[path] = value
    } else {
      Object.assign(result, flattenPropertyMapping(value, path))
    }
  }

  return result
}

export function flattenOutput(mapping: OutputMapping): OutputMapping {
  const result: OutputMapping = {}

  for (const [exportName, props] of Object.entries(mapping)) {
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

  for (const [childKey, childValue] of Object.entries(generated)) {
    merged[childKey] = mergePropertyMapping(childValue, existingObj?.[childKey], childKey)
  }

  return merged
}

export function mergeOutputWithExisting(
  generated: OutputMapping,
  existing: OutputMapping,
): OutputMapping {
  const result: OutputMapping = { ...generated }

  for (const [exportName, existingProps] of Object.entries(existing)) {
    if (!result[exportName]) {
      result[exportName] = existingProps
      continue
    }

    const merged: Record<string, PropertyMapping> = {}
    const generatedProps = result[exportName]

    for (const [key, value] of Object.entries(generatedProps)) {
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

export function applyOutputTransforms(
  mapping: OutputMapping,
  options: {
    flatten?: boolean
    mergeExisting?: boolean
    outputPath?: string
  },
): OutputMapping {
  let result = mapping

  if (options.mergeExisting && options.outputPath) {
    const existing = loadExistingOutput(options.outputPath)
    if (existing) {
      result = mergeOutputWithExisting(result, existing)
    }
  }

  if (options.flatten) {
    result = flattenOutput(result)
  }

  return result
}
