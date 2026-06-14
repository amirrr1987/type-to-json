export interface CLIOptions {
  output?: string
  resolvePaths?: string
  alias?: string[]
  verbose?: boolean
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
}

export interface TypeAliasDefinition {
  name: string
  referencedInterface: string
  fieldAccessor?: string // for Interface['field'] pattern
  sourceFile: string
  isExported: boolean
}

export interface ParseResult {
  interfaces: Map<string, InterfaceDefinition>
  typeAliases: Map<string, TypeAliasDefinition>
}

export interface OutputMapping {
  [interfaceName: string]: {
    [propertyName: string]: string
  }
}

export interface ParserContext {
  inputFile: string
  visitedFiles: Set<string>
  interfaces: Map<string, InterfaceDefinition>
  typeAliases: Map<string, TypeAliasDefinition>
  config: ResolverConfig
}
