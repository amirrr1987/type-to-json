import ts from 'typescript'
import type { PropertyMapping, MappingOptions } from './types.js'
import { warn } from './errors.js'

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

function primitivePlaceholder(
  options?: MappingOptions,
): Record<string, PropertyMapping> {
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
  const nonNullable = checker.getNonNullableType(type)
  return (nonNullable.flags & ts.TypeFlags.Object) !== 0
    && checker.getPropertiesOfType(nonNullable).length > 0
}

export function normalizeRootType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const nonNullable = checker.getNonNullableType(type)

  if (nonNullable.isUnion()) {
    const objectMembers = nonNullable.types.filter((t) => hasObjectProperties(t, checker))
    if (objectMembers.length === 1) {
      return checker.getNonNullableType(objectMembers[0]!)
    }
    if (objectMembers.length > 1) {
      warn(
        `union type resolves to multiple object members (${checker.typeToString(nonNullable)}) — using first object member`,
      )
      return checker.getNonNullableType(objectMembers[0]!)
    }
  }

  return nonNullable
}

function getPropertyKey(symbol: ts.Symbol): string {
  const name = symbol.getName()
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1)
  }
  return name
}

function getPropertyType(symbol: ts.Symbol, checker: ts.TypeChecker, fallback: ts.Node): ts.Type {
  const location = symbol.valueDeclaration ?? fallback
  return checker.getTypeOfSymbolAtLocation(symbol, location)
}

function isObjectLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(type)
  if (!(nonNullable.flags & ts.TypeFlags.Object)) return false
  if (checker.isArrayType(nonNullable) || checker.isTupleType(nonNullable)) return false
  return checker.getPropertiesOfType(nonNullable).length > 0
}

function isExpandableType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(type)

  if (nonNullable.isUnion()) return false
  if (checker.isArrayType(nonNullable) || checker.isTupleType(nonNullable)) return false

  if (nonNullable.isIntersection()) {
    return nonNullable.types.every((t) => isObjectLike(t, checker))
  }

  return isObjectLike(nonNullable, checker)
}

function resolveObjectType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const nonNullable = checker.getNonNullableType(type)
  if (nonNullable.isIntersection()) return nonNullable
  return nonNullable
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

  const symbols = checker.getPropertiesOfType(normalized)

  if (symbols.length === 0 && options?.includePrimitives && isPrimitiveType(normalized, checker)) {
    return primitivePlaceholder(options)
  }

  for (const symbol of symbols) {
    const name = getPropertyKey(symbol)
    if (name.startsWith('__')) continue

    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!decl) {
      result[name] = name
      continue
    }

    const propType = getPropertyType(symbol, checker, decl)

    if (options?.expandArrays) {
      const elementType = getArrayElementType(propType, checker)
      if (elementType && isExpandableType(elementType, checker)) {
        const objectType = resolveObjectType(elementType, checker)
        const nested = buildNestedMapping(objectType, checker, depth + 1, options)
        result[name] = Object.keys(nested).length > 0 ? nested : name
        continue
      }
    }

    if (isExpandableType(propType, checker)) {
      const objectType = resolveObjectType(propType, checker)
      const nested = buildNestedMapping(objectType, checker, depth + 1, options)
      result[name] = Object.keys(nested).length > 0 ? nested : name
    } else {
      result[name] = name
    }
  }

  return result
}

export function mappingFromDeclaration(
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
  checker: ts.TypeChecker,
  options?: MappingOptions,
): Record<string, PropertyMapping> {
  const typeNode = ts.isTypeAliasDeclaration(node) ? node.type : node
  const type = checker.getTypeAtLocation(typeNode)
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
