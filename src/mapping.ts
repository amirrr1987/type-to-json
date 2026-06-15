import ts from 'typescript'
import type { PropertyMapping, MappingOptions } from './types.js'
import { warn } from './errors.js'
import { normalizePropertyName } from './utils.js'

const MAX_NESTING_DEPTH = 10
const DEFAULT_PRIMITIVE_KEY = '_value'

function isPrimitiveType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(type)
  return !!(
    nonNullable.flags
    & (ts.TypeFlags.String
      | ts.TypeFlags.Number
      | ts.TypeFlags.Boolean
      | ts.TypeFlags.BigInt
      | ts.TypeFlags.StringLiteral
      | ts.TypeFlags.NumberLiteral
      | ts.TypeFlags.BooleanLiteral)
  )
}

function isNullishOrVoidType(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0
}

function primitivePlaceholder(options?: MappingOptions): Record<string, PropertyMapping> {
  const key = options?.primitiveKey ?? DEFAULT_PRIMITIVE_KEY
  return { [key]: key }
}

function getArrayElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  if (checker.isArrayType(type)) {
    const ref = type as ts.TypeReference
    return checker.getTypeArguments(ref)[0]
  }

  if (checker.isTupleType(type)) {
    const ref = type as ts.TypeReference
    return checker.getTypeArguments(ref)[0]
  }

  return undefined
}

function hasObjectProperties(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (isNullishOrVoidType(type) || isPrimitiveType(type, checker)) return false
  const nonNullable = checker.getNonNullableType(type)
  if (!(nonNullable.flags & ts.TypeFlags.Object)) return false
  if (checker.getPropertiesOfType(nonNullable).length > 0) return true

  const symbol = nonNullable.getSymbol()
  if (symbol) {
    return checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)).length > 0
  }

  return false
}

export function normalizeRootType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  let current = checker.getNonNullableType(type)

  if (current.isUnion()) {
    const meaningful = current.types.filter((t) => !isNullishOrVoidType(t))
    if (meaningful.length === 1) {
      current = checker.getNonNullableType(meaningful[0]!)
    } else if (meaningful.length > 1) {
      const objectMembers = meaningful.filter((t) => hasObjectProperties(t, checker))
      if (objectMembers.length === 1) {
        current = checker.getNonNullableType(objectMembers[0]!)
      } else if (objectMembers.length > 1) {
        warn(
          `union type resolves to multiple object members (${checker.typeToString(current)}) — using first object member`,
        )
        current = checker.getNonNullableType(objectMembers[0]!)
      } else {
        const primitiveMembers = meaningful.filter((t) => isPrimitiveType(t, checker))
        if (primitiveMembers.length === 1) {
          current = checker.getNonNullableType(primitiveMembers[0]!)
        }
      }
    }
  }

  return current
}

function propertyKeyFromSymbol(symbol: ts.Symbol): string {
  return normalizePropertyName(symbol.getName())
}

function labelForProperty(
  symbol: ts.Symbol,
  key: string,
  checker: ts.TypeChecker,
  options?: MappingOptions,
): string {
  if (options?.useJsDocLabels) {
    const docs = symbol.getDocumentationComment(checker)
    if (docs.length > 0) {
      const text = ts.displayPartsToString(docs).trim()
      const firstLine = text.split('\n').find((line) => line.trim().length > 0)
      if (firstLine) return firstLine.trim()
    }
  }
  return key
}

function getPropertyType(symbol: ts.Symbol, checker: ts.TypeChecker, fallback: ts.Node): ts.Type {
  const location = symbol.valueDeclaration ?? fallback
  return checker.getTypeOfSymbolAtLocation(symbol, location)
}

function getIndexKey(indexType: ts.TypeNode): string | undefined {
  if (ts.isLiteralTypeNode(indexType) && ts.isStringLiteral(indexType.literal)) {
    return indexType.literal.text
  }
  if (ts.isStringLiteral(indexType)) {
    return indexType.text
  }
  if (ts.isIdentifier(indexType)) {
    return indexType.text
  }
  return undefined
}

function findPropertySymbol(
  objectType: ts.Type,
  key: string,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  return objectType.getProperty(key) ?? checker.getPropertyOfType(objectType, key)
}

function isObjectLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(type)
  if (isPrimitiveType(nonNullable, checker)) return false
  if (!(nonNullable.flags & ts.TypeFlags.Object)) return false
  if (checker.isArrayType(nonNullable) || checker.isTupleType(nonNullable)) return false

  if (checker.getPropertiesOfType(nonNullable).length > 0) return true

  const symbol = nonNullable.getSymbol()
  if (symbol) {
    const declared = checker.getDeclaredTypeOfSymbol(symbol)
    return checker.getPropertiesOfType(declared).length > 0
  }

  return false
}

function resolveTypeAtNode(typeNode: ts.TypeNode, checker: ts.TypeChecker): ts.Type {
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    const objectType = checker.getTypeAtLocation(typeNode.objectType)
    const key = getIndexKey(typeNode.indexType)

    if (key) {
      const prop = findPropertySymbol(objectType, key, checker)
      if (prop) {
        const location = prop.valueDeclaration ?? typeNode
        return checker.getTypeOfSymbolAtLocation(prop, location)
      }

      for (const sym of checker.getPropertiesOfType(objectType)) {
        if (propertyKeyFromSymbol(sym) === key) {
          const location = sym.valueDeclaration ?? typeNode
          return checker.getTypeOfSymbolAtLocation(sym, location)
        }
      }
    }

    return normalizeRootType(checker.getTypeAtLocation(typeNode), checker)
  }

  return checker.getTypeAtLocation(typeNode)
}

function isExpandableType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const normalized = normalizeRootType(type, checker)

  if (checker.isArrayType(normalized) || checker.isTupleType(normalized)) return false

  if (normalized.isIntersection()) {
    return normalized.types.every((t) => isObjectLike(t, checker))
  }

  if (normalized.isUnion()) return false

  return isObjectLike(normalized, checker)
}

function resolveObjectType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const normalized = normalizeRootType(type, checker)

  const symbol = normalized.getSymbol()
  if (symbol) {
    const declared = checker.getDeclaredTypeOfSymbol(symbol)
    if (checker.getPropertiesOfType(declared).length > 0) {
      return declared
    }
  }

  if (normalized.isIntersection()) return normalized
  return normalized
}

export function buildNestedMapping(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth = 0,
  options?: MappingOptions,
): Record<string, PropertyMapping> {
  const result: Record<string, PropertyMapping> = {}

  if (depth > MAX_NESTING_DEPTH) return result

  const normalized = normalizeRootType(type, checker)

  if (normalized.isIntersection()) {
    for (const constituent of normalized.types) {
      Object.assign(result, buildNestedMapping(constituent, checker, depth, options))
    }
    return result
  }

  if (isPrimitiveType(normalized, checker)) {
    if (options?.includePrimitives) return primitivePlaceholder(options)
    return {}
  }

  const symbols = checker.getPropertiesOfType(normalized)

  for (const symbol of symbols) {
    const name = propertyKeyFromSymbol(symbol)
    if (name.startsWith('__')) continue

    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0]
    const label = labelForProperty(symbol, name, checker, options)

    if (!decl) {
      result[name] = label
      continue
    }

    const propType = normalizeRootType(getPropertyType(symbol, checker, decl), checker)

    if (options?.expandArrays) {
      const elementType = getArrayElementType(propType, checker)
      if (elementType && isExpandableType(elementType, checker)) {
        const objectType = resolveObjectType(elementType, checker)
        const nested = buildNestedMapping(objectType, checker, depth + 1, options)
        result[name] = Object.keys(nested).length > 0 ? nested : label
        continue
      }
    }

    if (isExpandableType(propType, checker)) {
      const objectType = resolveObjectType(propType, checker)
      const nested = buildNestedMapping(objectType, checker, depth + 1, options)
      result[name] = Object.keys(nested).length > 0 ? nested : label
    } else {
      result[name] = label
    }
  }

  return result
}

export function mappingFromDeclaration(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  options?: MappingOptions,
): Record<string, PropertyMapping> {
  const type = ts.isTypeAliasDeclaration(node)
    ? resolveTypeAtNode(node.type, checker)
    : checker.getTypeAtLocation(node)
  return buildNestedMapping(type, checker, 0, options)
}

export function mappingFromClassImplements(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  options?: MappingOptions,
): Record<string, PropertyMapping> {
  const merged: Record<string, PropertyMapping> = {}
  const implementsClause = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ImplementsKeyword,
  )

  if (!implementsClause) return merged

  for (const typeNode of implementsClause.types) {
    const ifaceType = checker.getTypeAtLocation(typeNode.expression)
    Object.assign(merged, buildNestedMapping(ifaceType, checker, 0, options))
  }

  return merged
}
