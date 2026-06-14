export class TypeToJsonError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'TypeToJsonError'
  }
}

export const Errors = {
  FILE_NOT_FOUND: (p: string) => new TypeToJsonError(`File not found: ${p}`, 'FILE_NOT_FOUND'),
  PARSE_FAILED: (p: string) => new TypeToJsonError(`Parse failed: ${p}`, 'PARSE_FAILED'),
  CONFIG_NOT_FOUND: () => new TypeToJsonError('Config file not found', 'CONFIG_NOT_FOUND'),
  INTERFACE_NOT_FOUND: (name: string, file: string) =>
    new TypeToJsonError(`Interface not found: ${name} in ${file}`, 'INTERFACE_NOT_FOUND'),
  EXTENDS_UNRESOLVED: (child: string, parent: string) =>
    new TypeToJsonError(`Could not resolve extends ${parent} for ${child}`, 'EXTENDS_UNRESOLVED'),
  REEXPORT_UNRESOLVED: (name: string, from: string) =>
    new TypeToJsonError(`Could not resolve re-export ${name} from ${from}`, 'REEXPORT_UNRESOLVED'),
  TYPE_ALIAS_NOT_FOUND: (name: string, file: string) =>
    new TypeToJsonError(`Type alias not found: ${name} in ${file}`, 'TYPE_ALIAS_NOT_FOUND'),
  INTERSECTION_RESOLVE_FAILED: (name: string) =>
    new TypeToJsonError(`Could not resolve intersection type: ${name}`, 'INTERSECTION_RESOLVE_FAILED'),
  NAMESPACE_NOT_FOUND: (name: string, file: string) =>
    new TypeToJsonError(`Namespace not found: ${name} in ${file}`, 'NAMESPACE_NOT_FOUND'),
  CLASS_IMPLEMENTS_UNRESOLVED: (name: string) =>
    new TypeToJsonError(`Could not resolve implements clause for class: ${name}`, 'CLASS_IMPLEMENTS_UNRESOLVED'),
}

export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function warn(message: string): void {
  console.warn(`[type-to-json] Warning: ${message}`)
}
