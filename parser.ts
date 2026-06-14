import ts from 'typescript'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type {
  InterfaceDefinition,
  InterfaceProperty,
  TypeAliasDefinition,
  ParserContext,
  ResolverConfig,
} from './types.js'
import { resolveImport } from './resolver.js'

/**
 * Parse a TypeScript source file and extract all interface definitions
 * and type aliases, recursively following imports.
 */
export function parseFile(filePath: string, config: ResolverConfig): ParserContext {
  const resolvedInput = resolve(filePath)
  const ctx: ParserContext = {
    inputFile: resolvedInput,
    visitedFiles: new Set(),
    interfaces: new Map(),
    typeAliases: new Map(),
    config,
  }

  processFile(resolvedInput, ctx)
  return ctx
}

function processFile(filePath: string, ctx: ParserContext): void {
  if (ctx.visitedFiles.has(filePath)) return
  ctx.visitedFiles.add(filePath)

  let source: string
  try {
    source = readFileSync(filePath, 'utf-8')
  } catch {
    // File not found or not readable — skip silently
    return
  }

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)

  // First pass: collect imports and queue them for processing
  const importedFiles: string[] = []
  const importedNames = new Map<string, string>() // localName -> sourceFile

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const modulePath = (node.moduleSpecifier as ts.StringLiteral).text
      const resolved = resolveImport(modulePath, filePath, ctx.config)

      if (resolved) {
        importedFiles.push(resolved)

        // Track what names are imported from where
        if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            const localName = element.name.text
            importedNames.set(localName, resolved)
          }
        }
      }
    }
  })

  // Recursively process imports FIRST so their interfaces are available
  for (const imported of importedFiles) {
    processFile(imported, ctx)
  }

  // Second pass: extract interfaces and type aliases from this file
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      const iface = extractInterface(node, filePath, sourceFile)
      ctx.interfaces.set(iface.name, iface)
    }

    if (ts.isTypeAliasDeclaration(node)) {
      const alias = extractTypeAlias(node, filePath, sourceFile)
      if (alias) {
        ctx.typeAliases.set(alias.name, alias)
      }
    }
  })
}

function hasExportModifier(node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration): boolean {
  const modifiers = ts.getModifiers(node)
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function extractInterface(
  node: ts.InterfaceDeclaration,
  filePath: string,
  sourceFile: ts.SourceFile,
): InterfaceDefinition {
  const name = node.name.text
  const properties: InterfaceProperty[] = []

  for (const member of node.members) {
    if (ts.isPropertySignature(member) || ts.isMethodSignature(member)) {
      const propName = member.name
        ? ts.isIdentifier(member.name)
          ? member.name.text
          : member.name.getText(sourceFile)
        : ''

      if (!propName) continue

      const isOptional = !!member.questionToken
      const typeText = member.type ? member.type.getText(sourceFile) : 'any'

      properties.push({ name: propName, isOptional, type: typeText })
    }
  }

  return { name, properties, sourceFile: filePath, isExported: hasExportModifier(node) }
}

function extractTypeAlias(
  node: ts.TypeAliasDeclaration,
  filePath: string,
  sourceFile: ts.SourceFile,
): TypeAliasDefinition | null {
  const name = node.name.text
  const typeNode = node.type

  // Pattern: type Foo = SomeInterface
  if (ts.isTypeReferenceNode(typeNode)) {
    const refName = typeNode.typeName.getText(sourceFile)
    return { name, referencedInterface: refName, sourceFile: filePath, isExported: hasExportModifier(node) }
  }

  // Pattern: type Foo = SomeInterface['field']
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    const objectType = typeNode.objectType
    const indexType = typeNode.indexType

    if (ts.isTypeReferenceNode(objectType) && ts.isLiteralTypeNode(indexType)) {
      const refName = objectType.typeName.getText(sourceFile)
      const field = indexType.literal.getText(sourceFile).replace(/['"]/g, '')
      return {
        name,
        referencedInterface: refName,
        fieldAccessor: field,
        sourceFile: filePath,
        isExported: hasExportModifier(node),
      }
    }
  }

  return null
}

/**
 * Resolve a type alias chain to find the actual interface properties.
 * Handles:
 *  - Direct reference: type Foo = IBar → use IBar's properties
 *  - Field access:     type Foo = IBar['data'] → use IBar.data's type's properties
 */
export function resolveTypeAliasProperties(
  aliasName: string,
  ctx: ParserContext,
): InterfaceProperty[] | null {
  const alias = ctx.typeAliases.get(aliasName)
  if (!alias) return null

  const { referencedInterface, fieldAccessor } = alias

  if (!fieldAccessor) {
    // Direct reference: type Foo = IBar
    const iface = ctx.interfaces.get(referencedInterface)
    if (iface) return iface.properties
    // Maybe it's another alias
    return resolveTypeAliasProperties(referencedInterface, ctx)
  }

  // Field access: type Foo = IBar['data']
  const iface = ctx.interfaces.get(referencedInterface)
  if (!iface) return null

  const fieldProp = iface.properties.find((p) => p.name === fieldAccessor)
  if (!fieldProp) return null

  // The field's type should reference another interface
  // e.g., data?: ILoginResponseData
  const refTypeName = extractTypeName(fieldProp.type)
  if (!refTypeName) return null

  const nestedIface = ctx.interfaces.get(refTypeName)
  if (nestedIface) return nestedIface.properties

  // Check if it's a type alias
  return resolveTypeAliasProperties(refTypeName, ctx)
}

/**
 * Extract the type name from a type string, handling optional/array types
 * e.g. "IFoo | null" -> "IFoo", "IFoo[]" -> "IFoo", "IFoo" -> "IFoo"
 */
function extractTypeName(typeStr: string): string | null {
  // Remove array brackets
  let cleaned = typeStr.replace(/\[\]/g, '').trim()
  // Remove null/undefined union
  cleaned = cleaned.replace(/\s*\|\s*(null|undefined)/g, '').trim()
  cleaned = cleaned.replace(/(null|undefined)\s*\|\s*/g, '').trim()

  // Must be an identifier
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
    return cleaned
  }

  return null
}
