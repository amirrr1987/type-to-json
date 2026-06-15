import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import ts from 'typescript'
import type { AliasMap } from './types.js'

function pathsToAliases(paths: Record<string, string[]>, baseUrl: string): AliasMap {
  const aliases: AliasMap = {}

  for (const [pattern, targets] of Object.entries(paths)) {
    const aliasKey = pattern.endsWith('/*') ? pattern.slice(0, -1) : `${pattern}/`
    const target = targets[0]
    if (!target) continue

    const targetBase = target.endsWith('/*') ? target.slice(0, -2) : target.replace(/\/\*$/, '')
    aliases[aliasKey] = resolve(baseUrl, targetBase)
  }

  return aliases
}

export function loadTsConfigAliases(basePath: string, configPath?: string): AliasMap {
  if (!configPath) return {}

  const resolvedPath = resolve(basePath, configPath)
  if (!existsSync(resolvedPath)) return {}

  const configFile = ts.readConfigFile(resolvedPath, (path) => readFileSync(path, 'utf-8'))
  if (configFile.error) return {}

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(resolvedPath),
  )

  const baseUrl = parsed.options.baseUrl
    ? resolve(dirname(resolvedPath), parsed.options.baseUrl)
    : dirname(resolvedPath)

  if (!parsed.options.paths) return {}

  return pathsToAliases(parsed.options.paths, baseUrl)
}

export function mergeAliasMaps(...maps: AliasMap[]): AliasMap {
  return Object.assign({}, ...maps)
}
