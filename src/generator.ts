import ts from 'typescript'
import type {
  ParserContext,
  OutputMapping,
  PropertyMapping,
  GenerationResult,
  SkippedExport,
  GenerationOptions,
} from './types.js'
import { resolve } from 'path'
import {
  findInterfaceDeclaration,
  findTypeAliasDeclaration,
  findClassDeclaration,
} from './parser.js'
import { mappingFromDeclaration, mappingFromClassImplements, normalizeRootType } from './mapping.js'
import { warn } from './errors.js'

function isFromInputFile(sourceFile: string, inputFile: string): boolean {
  return resolve(sourceFile) === resolve(inputFile)
}

function isEmptyMapping(mapping: Record<string, PropertyMapping>): boolean {
  return Object.keys(mapping).length === 0
}

function resolvedTypeString(
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration,
  checker: ts.TypeChecker,
): string {
  if (ts.isClassDeclaration(declaration)) {
    return 'class (implements clause)'
  }
  const typeNode = ts.isTypeAliasDeclaration(declaration) ? declaration.type : declaration
  const type = checker.getTypeAtLocation(typeNode)
  return checker.typeToString(normalizeRootType(type, checker))
}

function skipReason(
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker | null,
): string | undefined {
  if (!checker || !ts.isTypeAliasDeclaration(declaration)) return undefined
  const type = normalizeRootType(checker.getTypeAtLocation(declaration.type), checker)
  const flags = type.flags
  if (flags & ts.TypeFlags.Boolean) return 'primitive boolean — set includePrimitives: true to emit a placeholder key'
  if (flags & (ts.TypeFlags.String | ts.TypeFlags.Number)) return 'primitive scalar — set includePrimitives: true to emit a placeholder key'
  return undefined
}

function recordSkipped(
  skipped: SkippedExport[],
  exportName: string,
  kind: SkippedExport['kind'],
  ctx: ParserContext,
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration | null,
  options: GenerationOptions,
): void {
  const checker = ctx.checker
  const resolvedType = checker && declaration
    ? resolvedTypeString(declaration, checker)
    : 'unknown'

  const entry: SkippedExport = {
    name: exportName,
    kind,
    resolvedType,
    reason: declaration && (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))
      ? skipReason(declaration, checker)
      : undefined,
  }

  skipped.push(entry)

  if (options.warnOnSkip !== false) {
    const detail = entry.reason ? ` (${entry.reason})` : ''
    warn(`skipped exported ${kind} "${exportName}" — resolved to empty property map (${resolvedType})${detail}`)
  }
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
export function generateMapping(
  ctx: ParserContext,
  options: GenerationOptions = {},
): GenerationResult {
  const output: OutputMapping = {}
  const skipped: SkippedExport[] = []

  for (const [aliasName, alias] of ctx.typeAliases) {
    if (!isFromInputFile(alias.sourceFile, ctx.inputFile)) continue
    if (!alias.isExported) continue

    const mapping = buildMappingFromTypeAlias(aliasName, ctx)
    if (!mapping || isEmptyMapping(mapping)) {
      const sourceFile = ctx.program?.getSourceFile(alias.sourceFile)
      const declaration = sourceFile ? findTypeAliasDeclaration(sourceFile, aliasName) ?? null : null
      recordSkipped(skipped, aliasName, 'type alias', ctx, declaration, options)
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
      recordSkipped(skipped, ifaceName, 'interface', ctx, declaration, options)
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
      recordSkipped(skipped, className, 'class', ctx, declaration, options)
      continue
    }

    output[className] = mapping
  }

  return { mapping: output, skipped }
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
