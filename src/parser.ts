import ts from 'typescript'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type {
  InterfaceDefinition,
  InterfaceProperty,
  TypeAliasDefinition,
  ClassDefinition,
  ParserContext,
  ResolverConfig,
  ParseFileOptions,
} from './types.js'
import { resolveImport } from './resolver.js'
import { formatError, warn } from './errors.js'

export function parseFile(
  filePath: string,
  config: ResolverConfig,
  options: ParseFileOptions = {},
): ParserContext {
  const resolvedInput = resolve(filePath)
  const ctx: ParserContext = {
    inputFile: resolvedInput,
    visitedFiles: new Set(),
    interfaces: new Map(),
    typeAliases: new Map(),
    classes: new Map(),
    config,
    namespace: options.namespace,
    program: null,
    checker: null,
  }

  processFile(resolvedInput, ctx)
  enrichWithTypeChecker(ctx)
  applyReExports(ctx)
  return ctx
}

function processFile(filePath: string, ctx: ParserContext): void {
  if (ctx.visitedFiles.has(filePath)) return
  ctx.visitedFiles.add(filePath)

  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch (err) {
    warn(`could not parse "${filePath}": ${formatError(err)}`)
    return
  }

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const importedFiles: string[] = []
  const isInputFile = resolve(filePath) === resolve(ctx.inputFile)
  const useNamespace = isInputFile && !!ctx.namespace

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
      const resolved = resolveImport(modulePath, filePath, ctx.config)
      if (resolved) importedFiles.push(resolved)
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
      const resolved = resolveImport(modulePath, filePath, ctx.config)
      if (resolved) importedFiles.push(resolved)
    }
  })

  for (const imported of importedFiles) {
    processFile(imported, ctx)
  }

  if (useNamespace) {
    extractFromNamespace(sourceFile, filePath, ctx, ctx.namespace!)
    return
  }

  extractTopLevelDeclarations(sourceFile, filePath, ctx)
}

function extractFromNamespace(
  sourceFile: ts.SourceFile,
  filePath: string,
  ctx: ParserContext,
  namespaceName: string,
): void {
  let found = false

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isModuleDeclaration(node) || !ts.isIdentifier(node.name)) return
    if (node.name.text !== namespaceName) return

    found = true
    const body = node.body

    if (body && ts.isModuleBlock(body)) {
      extractDeclarationNodes(body.statements, filePath, sourceFile, ctx)
    } else if (body && ts.isModuleDeclaration(body)) {
      warn(`nested namespace in "${namespaceName}" is not supported`)
    }
  })

  if (!found) {
    warn(`namespace "${namespaceName}" not found in ${filePath}`)
  }
}

function extractTopLevelDeclarations(
  sourceFile: ts.SourceFile,
  filePath: string,
  ctx: ParserContext,
): void {
  extractDeclarationNodes(sourceFile.statements, filePath, sourceFile, ctx)
}

function extractDeclarationNodes(
  statements: ts.NodeArray<ts.Statement>,
  filePath: string,
  sourceFile: ts.SourceFile,
  ctx: ParserContext,
): void {
  for (const node of statements) {
    if (ts.isInterfaceDeclaration(node)) {
      const iface = extractInterface(node, filePath, sourceFile)
      ctx.interfaces.set(iface.name, iface)
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const alias = extractTypeAlias(node, filePath)
      ctx.typeAliases.set(alias.name, alias)
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const cls = extractClass(node, filePath)
      ctx.classes.set(cls.name, cls)
    }
  }
}

function hasExportModifier(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration,
): boolean {
  const modifiers = ts.getModifiers(node)
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function extractExtendsClause(node: ts.InterfaceDeclaration): string[] {
  const parents: string[] = []

  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue
    for (const type of clause.types) {
      parents.push(type.expression.getText())
    }
  }

  return parents
}

function extractImplementsClause(node: ts.ClassDeclaration): string[] {
  const implemented: string[] = []

  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue
    for (const type of clause.types) {
      implemented.push(type.expression.getText())
    }
  }

  return implemented
}

function extractInterface(
  node: ts.InterfaceDeclaration,
  filePath: string,
  sourceFile: ts.SourceFile,
): InterfaceDefinition {
  const name = node.name.text
  const typeParameters = node.typeParameters?.map((param) => param.name.text) ?? []
  const properties: InterfaceProperty[] = []

  for (const member of node.members) {
    if (ts.isPropertySignature(member) || ts.isMethodSignature(member)) {
      const prop = propertyFromMember(member, sourceFile)
      if (prop) properties.push(prop)
    }
  }

  return {
    name,
    properties,
    sourceFile: filePath,
    isExported: hasExportModifier(node),
    extends: extractExtendsClause(node),
    typeParameters,
    isGeneric: typeParameters.length > 0,
  }
}

function extractTypeAlias(node: ts.TypeAliasDeclaration, filePath: string): TypeAliasDefinition {
  return {
    name: node.name.text,
    sourceFile: filePath,
    isExported: hasExportModifier(node),
    properties: [],
  }
}

function extractClass(node: ts.ClassDeclaration, filePath: string): ClassDefinition {
  return {
    name: node.name!.text,
    sourceFile: filePath,
    isExported: hasExportModifier(node),
    implements: extractImplementsClause(node),
    properties: [],
  }
}

function propertyFromMember(
  member: ts.PropertySignature | ts.MethodSignature,
  sourceFile: ts.SourceFile,
): InterfaceProperty | null {
  const propName = member.name
    ? ts.isIdentifier(member.name)
      ? member.name.text
      : member.name.getText(sourceFile)
    : ''

  if (!propName) return null

  const isOptional = !!member.questionToken
  const typeText = member.type ? member.type.getText(sourceFile) : 'any'

  return { name: propName, isOptional, type: typeText }
}

function buildCompilerOptions(config: ResolverConfig): ts.CompilerOptions {
  const paths: Record<string, string[]> = {}

  for (const [alias, target] of Object.entries(config.aliases)) {
    const pattern = alias.endsWith('/') ? `${alias}*` : `${alias}/*`
    const targetPattern = target.endsWith('/') ? `${target}*` : `${target}/*`
    paths[pattern] = [targetPattern]
  }

  if (!paths['@/*']) {
    paths['@/*'] = [`${resolve(config.basePath, 'src')}/*`]
  }

  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: config.basePath,
    paths,
  }
}

export function findInterfaceDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): ts.InterfaceDeclaration | undefined {
  let found: ts.InterfaceDeclaration | undefined

  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isInterfaceDeclaration(node) && node.name.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

export function findTypeAliasDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): ts.TypeAliasDeclaration | undefined {
  let found: ts.TypeAliasDeclaration | undefined

  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

export function findClassDeclaration(
  sourceFile: ts.SourceFile,
  name: string,
): ts.ClassDeclaration | undefined {
  let found: ts.ClassDeclaration | undefined

  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function propertyFromSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  fallbackLocation: ts.Node,
): InterfaceProperty {
  const name = symbol.getName()
  const declarations = symbol.getDeclarations()
  const decl = declarations?.find(ts.isPropertySignature)
    ?? declarations?.find(ts.isMethodSignature)
    ?? declarations?.[0]

  const isOptional = (symbol.flags & ts.SymbolFlags.Optional) !== 0
    || !!(decl && ts.isPropertySignature(decl) && decl.questionToken)

  const location = symbol.valueDeclaration ?? decl ?? fallbackLocation
  const type = checker.getTypeOfSymbolAtLocation(symbol, location)

  return {
    name,
    isOptional,
    type: checker.typeToString(type),
  }
}

function propertiesFromType(
  type: ts.Type,
  checker: ts.TypeChecker,
  location: ts.Node,
): InterfaceProperty[] {
  if (type.isIntersection()) {
    const merged = new Map<string, InterfaceProperty>()

    for (const constituent of type.types) {
      for (const prop of propertiesFromType(constituent, checker, location)) {
        merged.set(prop.name, prop)
      }
    }

    if (merged.size === 0) {
      warn(`could not resolve intersection type properties at ${location.getSourceFile().fileName}`)
    }

    return Array.from(merged.values())
  }

  const symbols = checker.getPropertiesOfType(type)
  const merged = new Map<string, InterfaceProperty>()

  for (const symbol of symbols) {
    const name = symbol.getName()
    if (name.startsWith('__')) continue
    merged.set(name, propertyFromSymbol(symbol, checker, location))
  }

  return Array.from(merged.values())
}

function propertiesFromDeclaration(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
): InterfaceProperty[] {
  const declaredType = checker.getTypeAtLocation(node)
  return propertiesFromType(declaredType, checker, node)
}

function propertiesFromClassImplements(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): InterfaceProperty[] {
  const merged = new Map<string, InterfaceProperty>()
  const implementsClause = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ImplementsKeyword,
  )

  if (!implementsClause) return []

  for (const typeNode of implementsClause.types) {
    const ifaceType = checker.getTypeAtLocation(typeNode.expression)
    for (const prop of propertiesFromType(ifaceType, checker, node)) {
      merged.set(prop.name, prop)
    }
  }

  return Array.from(merged.values())
}

function enrichWithTypeChecker(ctx: ParserContext): void {
  const rootNames = Array.from(ctx.visitedFiles)
  if (rootNames.length === 0) return

  const program = ts.createProgram(rootNames, buildCompilerOptions(ctx.config))
  const checker = program.getTypeChecker()
  ctx.program = program
  ctx.checker = checker

  for (const [name, iface] of ctx.interfaces) {
    const sourceFile = program.getSourceFile(iface.sourceFile)
    if (!sourceFile) {
      warn(`could not load source file for interface "${name}": ${iface.sourceFile}`)
      continue
    }

    const declaration = findInterfaceDeclaration(sourceFile, name)
    if (!declaration) {
      warn(`could not find interface declaration "${name}" in ${iface.sourceFile}`)
      continue
    }

    iface.properties = propertiesFromDeclaration(declaration, checker)
  }

  for (const [name, alias] of ctx.typeAliases) {
    const sourceFile = program.getSourceFile(alias.sourceFile)
    if (!sourceFile) {
      warn(`could not load source file for type alias "${name}": ${alias.sourceFile}`)
      continue
    }

    const declaration = findTypeAliasDeclaration(sourceFile, name)
    if (!declaration) {
      warn(`could not find type alias declaration "${name}" in ${alias.sourceFile}`)
      continue
    }

    alias.properties = propertiesFromDeclaration(declaration, checker)
  }

  for (const [name, cls] of ctx.classes) {
    const sourceFile = program.getSourceFile(cls.sourceFile)
    if (!sourceFile) {
      warn(`could not load source file for class "${name}": ${cls.sourceFile}`)
      continue
    }

    const declaration = findClassDeclaration(sourceFile, name)
    if (!declaration) {
      warn(`could not find class declaration "${name}" in ${cls.sourceFile}`)
      continue
    }

    cls.properties = propertiesFromClassImplements(declaration, checker)
  }
}

function findDefinitionInFile<T extends { name: string; sourceFile: string }>(
  map: Map<string, T>,
  name: string,
  filePath: string,
): T | undefined {
  const entry = map.get(name)
  if (entry && resolve(entry.sourceFile) === resolve(filePath)) return entry
  return undefined
}

function applyReExports(ctx: ParserContext): void {
  for (const filePath of ctx.visitedFiles) {
    let source: string
    try {
      source = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)

    ts.forEachChild(sourceFile, (node) => {
      if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !node.exportClause) return
      if (!ts.isNamedExports(node.exportClause)) return

      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
      const resolved = resolveImport(modulePath, filePath, ctx.config)
      if (!resolved) {
        warn(`could not resolve re-export module "${modulePath}" from ${filePath}`)
        return
      }

      const isTypeOnly = !!node.isTypeOnly

      for (const element of node.exportClause.elements) {
        const exportName = element.name.text
        const originalName = element.propertyName?.text ?? exportName

        if (isTypeOnly) {
          const original = findDefinitionInFile(ctx.typeAliases, originalName, resolved)
          if (!original) {
            warn(`could not resolve type re-export ${exportName} from ${modulePath}`)
            continue
          }

          ctx.typeAliases.set(exportName, {
            ...original,
            name: exportName,
            sourceFile: filePath,
            isExported: true,
            properties: [...original.properties],
          })
          continue
        }

        const originalIface = findDefinitionInFile(ctx.interfaces, originalName, resolved)
        if (originalIface) {
          ctx.interfaces.set(exportName, {
            ...originalIface,
            name: exportName,
            sourceFile: filePath,
            isExported: true,
            properties: [...originalIface.properties],
          })
          continue
        }

        const originalAlias = findDefinitionInFile(ctx.typeAliases, originalName, resolved)
        if (originalAlias) {
          ctx.typeAliases.set(exportName, {
            ...originalAlias,
            name: exportName,
            sourceFile: filePath,
            isExported: true,
            properties: [...originalAlias.properties],
          })
          continue
        }

        warn(`could not resolve re-export ${exportName} from ${modulePath}`)
      }
    })
  }
}

export function resolveTypeAliasProperties(
  aliasName: string,
  ctx: ParserContext,
): InterfaceProperty[] | null {
  const alias = ctx.typeAliases.get(aliasName)
  if (!alias || alias.properties.length === 0) return null
  return alias.properties
}
