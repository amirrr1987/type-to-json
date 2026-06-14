export interface CLIOptions {
  output?: string
  resolvePaths?: string
  alias?: string[]
}

export interface AliasMap {
  [alias: string]: string
}

export interface ResolverConfig {
  basePath: string
  resolvePaths: string[]
  aliases: AliasMap
}

export interface InterfaceProperty {
  name: string
  isOptional: boolean
  type: string
}

export interface InterfaceDefinition {
  name: string
  properties: InterfaceProperty[]
  sourceFile: string
  isExported: boolean
  extends?: string[]
  typeParameters?: string[]
  isGeneric?: boolean
}

export interface TypeAliasDefinition {
  name: string
  sourceFile: string
  isExported: boolean
  properties: InterfaceProperty[]
}

export interface ClassDefinition {
  name: string
  sourceFile: string
  isExported: boolean
  implements: string[]
  properties: InterfaceProperty[]
}

/** Leaf label string or nested object of labels */
export type PropertyMapping = string | { [key: string]: PropertyMapping }

export interface OutputMapping {
  [exportName: string]: {
    [propertyName: string]: PropertyMapping
  }
}

export interface ParseResult {
  interfaces: Map<string, InterfaceDefinition>
  typeAliases: Map<string, TypeAliasDefinition>
}

export interface ParserContext {
  inputFile: string
  visitedFiles: Set<string>
  interfaces: Map<string, InterfaceDefinition>
  typeAliases: Map<string, TypeAliasDefinition>
  classes: Map<string, ClassDefinition>
  config: ResolverConfig
  namespace?: string
  program: import('typescript').Program | null
  checker: import('typescript').TypeChecker | null
}

export interface ParseFileOptions {
  namespace?: string
}
