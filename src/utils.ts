import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/** Strip surrounding single/double quotes from TS symbol or AST property names */
export function normalizePropertyName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

/**
 * Parse --alias flag values like "@/=./src" into AliasMap entries
 */
export function parseAliasArg(aliasArg: string): { key: string; value: string } | null {
  const eqIdx = aliasArg.indexOf('=')
  if (eqIdx === -1) return null
  const key = aliasArg.slice(0, eqIdx).trim()
  const value = aliasArg.slice(eqIdx + 1).trim()
  return { key, value }
}

/**
 * Deduplicate array by key function
 */
export function dedupe<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const key = keyFn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Format file path for display (shorten long paths)
 */
export function shortPath(filePath: string, maxLen = 60): string {
  if (filePath.length <= maxLen) return filePath
  return '...' + filePath.slice(filePath.length - maxLen + 3)
}

/** Read package version from package.json next to dist/cli.js */
export function readPackageVersion(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url))
    const packageJsonPath = join(currentDir, '..', 'package.json')
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
