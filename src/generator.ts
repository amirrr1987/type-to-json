import ts from 'typescript'
import type { ParserContext, OutputMapping, PropertyMapping } from './types.js'
import { resolve } from 'path'
import {
  findInterfaceDeclaration,
  findTypeAliasDeclaration,
  findClassDeclaration,
} from './parser.js'
import { mappingFromDeclaration, mappingFromClassImplements } from './mapping.js'
import { warn } from './errors.js'

function isFromInputFile(sourceFile: string, inputFile: string): boolean {
  return resolve(sourceFile) === resolve(inputFile)
}

function isEmptyMapping(mapping: Record<string, PropertyMapping>): boolean {
  return Object.keys(mapping).length === 0
}

function warnSkippedExport(
  exportName: string,
  kind: 'type alias' | 'interface' | 'class',
  ctx: ParserContext,
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration | null,
): void {
  const checker = ctx.checker
  if (!checker || !declaration) {
    warn(`skipped exported ${kind} "${exportName}" — resolved to empty property map`)
    return
  }

  if (ts.isClassDeclaration(declaration)) {
    warn(`skipped exported ${kind} "${exportName}" — resolved to empty property map (no implements clause)`)
    return
  }

  const typeNode = ts.isTypeAliasDeclaration(declaration) ? declaration.type : declaration
  const type = checker.getTypeAtLocation(typeNode)
  warn(
    `skipped exported ${kind} "${exportName}" — resolved to empty property map (${checker.typeToString(type)})`,
  )
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

  return mappingFromDeclaration(declaration, checker, ctx.mapping)
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

  return mappingFromDeclaration(declaration, checker, ctx.mapping)
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

  return mappingFromClassImplements(declaration, checker, ctx.mapping)
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
    if (!mapping || isEmptyMapping(mapping)) {
      const sourceFile = ctx.program?.getSourceFile(alias.sourceFile)
      const declaration = sourceFile ? findTypeAliasDeclaration(sourceFile, aliasName) ?? null : null
      warnSkippedExport(aliasName, 'type alias', ctx, declaration)
      continue
    }

    output[aliasName] = mapping
  }

  for (const [ifaceName] of ctx.interfaces) {
    const iface = ctx.interfaces.get(ifaceName)!
    if (!isFromInputFile(iface.sourceFile, ctx.inputFile)) continue
    if (!iface.isExported) continue

    const mapping = buildMappingFromInterface(ifaceName, ctx)
    if (!mapping || isEmptyMapping(mapping)) {
      const sourceFile = ctx.program?.getSourceFile(iface.sourceFile)
      const declaration = sourceFile ? findInterfaceDeclaration(sourceFile, ifaceName) ?? null : null
      warnSkippedExport(ifaceName, 'interface', ctx, declaration)
      continue
    }

    output[ifaceName] = mapping
  }

  for (const [className] of ctx.classes) {
    const cls = ctx.classes.get(className)!
    if (!isFromInputFile(cls.sourceFile, ctx.inputFile)) continue
    if (!cls.isExported) continue

    const mapping = buildMappingFromClass(className, ctx)
    if (!mapping || isEmptyMapping(mapping)) {
      const sourceFile = ctx.program?.getSourceFile(cls.sourceFile)
      const declaration = sourceFile ? findClassDeclaration(sourceFile, className) ?? null : null
      warnSkippedExport(className, 'class', ctx, declaration)
      continue
    }

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
