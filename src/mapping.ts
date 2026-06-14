import ts from 'typescript'
import type { PropertyMapping } from './types.js'

const MAX_NESTING_DEPTH = 10

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
): Record<string, PropertyMapping> {
  const result: Record<string, PropertyMapping> = {}

  if (depth > MAX_NESTING_DEPTH) return result

  if (type.isIntersection()) {
    for (const constituent of type.types) {
      Object.assign(result, buildNestedMapping(constituent, checker, depth))
    }
    return result
  }

  const symbols = checker.getPropertiesOfType(type)

  for (const symbol of symbols) {
    const name = symbol.getName()
    if (name.startsWith('__')) continue

    const decl = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!decl) {
      result[name] = name
      continue
    }

    const propType = getPropertyType(symbol, checker, decl)

    if (isExpandableType(propType, checker)) {
      const objectType = resolveObjectType(propType, checker)
      const nested = buildNestedMapping(objectType, checker, depth + 1)
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
): Record<string, PropertyMapping> {
  const type = checker.getTypeAtLocation(node)
  return buildNestedMapping(type, checker)
}

export function mappingFromClassImplements(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): Record<string, PropertyMapping> {
  const merged: Record<string, PropertyMapping> = {}
  const implementsClause = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ImplementsKeyword,
  )

  if (!implementsClause) return merged

  for (const typeNode of implementsClause.types) {
    const ifaceType = checker.getTypeAtLocation(typeNode.expression)
    Object.assign(merged, buildNestedMapping(ifaceType, checker))
  }

  return merged
}
