import { existsSync } from 'fs'
import { resolve, dirname, join, extname, isAbsolute } from 'path'
import type { AliasMap, ResolverConfig } from './types.js'

const TS_EXTENSIONS = ['.ts', '.tsx', '.d.ts']

/**
 * Resolve a TypeScript import specifier to an absolute file path.
 * Handles:
 *  - Relative imports (./foo, ../bar)
 *  - Path aliases (@/foo -> ./src/foo)
 *  - Bare module imports (returns null - can't follow into node_modules)
 */
export function resolveImport(
  importSpecifier: string,
  fromFile: string,
  config: ResolverConfig,
): string | null {
  // Step 1: Apply alias substitution
  const dealiased = applyAliases(importSpecifier, config.aliases, config.basePath)

  if (!dealiased) {
    // Not a relative or aliased path → node_modules, skip
    return null
  }

  const candidates = isAbsolute(dealiased)
    ? [dealiased]
    : [resolve(dirname(fromFile), dealiased), resolve(config.basePath, dealiased)]

  for (const candidate of candidates) {
    const resolved = tryResolveFile(candidate)
    if (resolved) return resolved
  }

  // Try with extra resolvePaths as base
  for (const extraBase of config.resolvePaths) {
    const fromBase = resolve(config.basePath, extraBase, dealiased)
    const resolvedFromBase = tryResolveFile(fromBase)
    if (resolvedFromBase) return resolvedFromBase
  }

  return null
}

function applyAliases(
  specifier: string,
  aliases: AliasMap,
  basePath: string,
): string | null {
  // Already relative
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return specifier
  }

  // Check each alias (targets are normalized to absolute paths in buildResolverConfig)
  for (const [alias, target] of Object.entries(aliases)) {
    if (specifier.startsWith(alias)) {
      const remainder = specifier.slice(alias.length)
      return join(target, remainder)
    }
  }

  // Default: treat @/ as <basePath>/src/
  if (specifier.startsWith('@/')) {
    const remainder = specifier.slice(2)
    const srcDir = resolve(basePath, 'src')
    return join(srcDir, remainder)
  }

  // Not resolvable (bare module)
  return null
}

function tryResolveFile(candidate: string): string | null {
  // Already has extension
  if (extname(candidate) && existsSync(candidate)) {
    return candidate
  }

  // Try appending extensions
  for (const ext of TS_EXTENSIONS) {
    const full = candidate + ext
    if (existsSync(full)) return full
  }

  // Try as directory index
  for (const ext of TS_EXTENSIONS) {
    const idx = join(candidate, `index${ext}`)
    if (existsSync(idx)) return idx
  }

  return null
}

/**
 * Build a ResolverConfig from CLI options.
 * basePath is the project root (cwd) so path aliases like @/=./src resolve correctly.
 */
export function buildResolverConfig(
  inputFile: string,
  aliases: AliasMap,
  resolvePaths: string[],
  basePath: string = process.cwd(),
): ResolverConfig {
  const normalizedAliases: AliasMap = {}

  for (const [key, target] of Object.entries(aliases)) {
    normalizedAliases[key] = resolve(basePath, target)
  }

  return {
    basePath,
    resolvePaths: resolvePaths.map((p) => resolve(basePath, p)),
    aliases: normalizedAliases,
  }
}
