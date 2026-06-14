import { resolve } from 'path'
import type { ParserContext, OutputMapping } from './types.js'
import { cleanInterfaceName } from './utils.js'
import { resolveTypeAliasProperties } from './parser.js'

export interface GeneratorOptions {
  /** If true, clean up names like IAuthLoginReq -> AuthLoginRequest */
  cleanNames: boolean
  /** If true, include all discovered interfaces, not just alias-referenced ones */
  includeAllInterfaces: boolean
}

function isFromInputFile(sourceFile: string, inputFile: string): boolean {
  return resolve(sourceFile) === resolve(inputFile)
}

function toDisplayName(exportName: string, cleanNames: boolean): string {
  return cleanNames ? cleanInterfaceName(exportName) : exportName
}

/**
 * Generate JSON mapping only for exports declared in the input file.
 * Top-level keys use the exported type/interface name (e.g. IAuthLoginReq).
 */
export function generateMapping(ctx: ParserContext, options: GeneratorOptions): OutputMapping {
  const output: OutputMapping = {}

  for (const [aliasName, alias] of ctx.typeAliases) {
    if (!isFromInputFile(alias.sourceFile, ctx.inputFile)) continue

    const properties = resolveTypeAliasProperties(aliasName, ctx)
    if (!properties || properties.length === 0) continue

    const displayName = toDisplayName(aliasName, options.cleanNames)
    const mapping: { [key: string]: string } = {}

    for (const prop of properties) {
      mapping[prop.name] = prop.name
    }

    output[displayName] = mapping
  }

  for (const [ifaceName, iface] of ctx.interfaces) {
    if (!isFromInputFile(iface.sourceFile, ctx.inputFile)) continue
    if (iface.properties.length === 0) continue

    const displayName = toDisplayName(ifaceName, options.cleanNames)
    const mapping: { [key: string]: string } = {}

    for (const prop of iface.properties) {
      mapping[prop.name] = prop.name
    }

    output[displayName] = mapping
  }

  if (options.includeAllInterfaces) {
    for (const [ifaceName, iface] of ctx.interfaces) {
      if (isFromInputFile(iface.sourceFile, ctx.inputFile)) continue
      if (iface.properties.length === 0) continue
      if (output[toDisplayName(ifaceName, options.cleanNames)]) continue

      const displayName = toDisplayName(ifaceName, options.cleanNames)
      const mapping: { [key: string]: string } = {}

      for (const prop of iface.properties) {
        mapping[prop.name] = prop.name
      }

      output[displayName] = mapping
    }
  }

  return output
}

/**
 * Generate mapping for specific interfaces by name
 */
export function generateMappingForInterfaces(
  interfaceNames: string[],
  ctx: ParserContext,
  options: GeneratorOptions,
): OutputMapping {
  const output: OutputMapping = {}

  for (const name of interfaceNames) {
    const iface = ctx.interfaces.get(name)
    if (!iface || iface.properties.length === 0) continue

    const displayName = toDisplayName(name, options.cleanNames)
    const mapping: { [key: string]: string } = {}

    for (const prop of iface.properties) {
      mapping[prop.name] = prop.name
    }

    output[displayName] = mapping
  }

  return output
}
