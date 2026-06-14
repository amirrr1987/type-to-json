import type { ParserContext, OutputMapping, PropertyMapping } from './types.js'
import { resolve } from 'path'
import {
  findInterfaceDeclaration,
  findTypeAliasDeclaration,
  findClassDeclaration,
} from './parser.js'
import { mappingFromDeclaration, mappingFromClassImplements } from './mapping.js'

function isFromInputFile(sourceFile: string, inputFile: string): boolean {
  return resolve(sourceFile) === resolve(inputFile)
}

function isEmptyMapping(mapping: Record<string, PropertyMapping>): boolean {
  return Object.keys(mapping).length === 0
}

function buildMappingFromTypeAlias(
  name: string,
  ctx: ParserContext,
): Record<string, PropertyMapping> | null {
  const checker = ctx.checker
  const program = ctx.program
  if (!checker || !program) return null

  const alias = ctx.typeAliases.get(name)
  if (!alias) return null

  const sourceFile = program.getSourceFile(alias.sourceFile)
  if (!sourceFile) return null

  const declaration = findTypeAliasDeclaration(sourceFile, name)
  if (!declaration) return null

  return mappingFromDeclaration(declaration, checker)
}

function buildMappingFromInterface(
  name: string,
  ctx: ParserContext,
): Record<string, PropertyMapping> | null {
  const checker = ctx.checker
  const program = ctx.program
  if (!checker || !program) return null

  const iface = ctx.interfaces.get(name)
  if (!iface) return null

  const sourceFile = program.getSourceFile(iface.sourceFile)
  if (!sourceFile) return null

  const declaration = findInterfaceDeclaration(sourceFile, name)
  if (!declaration) return null

  return mappingFromDeclaration(declaration, checker)
}

function buildMappingFromClass(
  name: string,
  ctx: ParserContext,
): Record<string, PropertyMapping> | null {
  const checker = ctx.checker
  const program = ctx.program
  if (!checker || !program) return null

  const cls = ctx.classes.get(name)
  if (!cls) return null

  const sourceFile = program.getSourceFile(cls.sourceFile)
  if (!sourceFile) return null

  const declaration = findClassDeclaration(sourceFile, name)
  if (!declaration) return null

  return mappingFromClassImplements(declaration, checker)
}

/**
 * Generate JSON mapping only for exports declared in the input file.
 */
export function generateMapping(ctx: ParserContext): OutputMapping {
  const output: OutputMapping = {}

  for (const [aliasName, alias] of ctx.typeAliases) {
    if (!isFromInputFile(alias.sourceFile, ctx.inputFile)) continue
    if (!alias.isExported) continue

    const mapping = buildMappingFromTypeAlias(aliasName, ctx)
    if (!mapping || isEmptyMapping(mapping)) continue

    output[aliasName] = mapping
  }

  for (const [ifaceName] of ctx.interfaces) {
    const iface = ctx.interfaces.get(ifaceName)!
    if (!isFromInputFile(iface.sourceFile, ctx.inputFile)) continue
    if (!iface.isExported) continue

    const mapping = buildMappingFromInterface(ifaceName, ctx)
    if (!mapping || isEmptyMapping(mapping)) continue

    output[ifaceName] = mapping
  }

  for (const [className] of ctx.classes) {
    const cls = ctx.classes.get(className)!
    if (!isFromInputFile(cls.sourceFile, ctx.inputFile)) continue
    if (!cls.isExported) continue

    const mapping = buildMappingFromClass(className, ctx)
    if (!mapping || isEmptyMapping(mapping)) continue

    output[className] = mapping
  }

  return output
}

export function generateMappingForInterfaces(
  interfaceNames: string[],
  ctx: ParserContext,
): OutputMapping {
  const output: OutputMapping = {}

  for (const name of interfaceNames) {
    const mapping = buildMappingFromInterface(name, ctx)
    if (!mapping || isEmptyMapping(mapping)) continue
    output[name] = mapping
  }

  return output
}
