import { resolve } from 'path'
import type { Plugin, ResolvedConfig } from 'vite'
import { exportInterfaceEntries } from './core.js'
import type { AliasMap } from './types.js'

export interface ExportEntry {
  input: string
  output: string
}

export interface TsExportToJsonPluginOptions {
  /** Interface source files and their JSON output paths (relative to Vite root) */
  entries: ExportEntry[]
  /** Extra path aliases merged on top of Vite resolve.alias */
  aliases?: AliasMap
  resolvePaths?: string[]
  cleanNames?: boolean
  includeAllInterfaces?: boolean
  /** Additional files that trigger regeneration when changed */
  watch?: string[]
  /** Generate only for production builds, not during dev */
  buildOnly?: boolean
  /** Log generated files to the console */
  verbose?: boolean
}

function aliasesFromViteConfig(config: ResolvedConfig): AliasMap {
  const map: AliasMap = {}
  const { alias } = config.resolve

  const entries = Array.isArray(alias)
    ? alias
    : alias
      ? Object.entries(alias).map(([find, replacement]) => ({ find, replacement }))
      : []

  for (const item of entries) {
    if (!item || typeof item !== 'object' || !('find' in item)) continue

    const { find, replacement } = item
    if (typeof find !== 'string' || typeof replacement !== 'string') continue

    const key = find === '@' || find === '@/' ? '@/' : find.endsWith('/') ? find : `${find}/`
    map[key] = replacement
  }

  return map
}

function samePath(a: string, b: string): boolean {
  return resolve(a) === resolve(b)
}

export function tsExportToJson(options: TsExportToJsonPluginOptions): Plugin {
  let root = process.cwd()
  let viteAliases: AliasMap = {}

  const runGeneration = (label: string): void => {
    const mergedAliases = { ...viteAliases, ...options.aliases }
    exportInterfaceEntries(options.entries, {
      basePath: root,
      aliases: mergedAliases,
      resolvePaths: options.resolvePaths,
      cleanNames: options.cleanNames,
      includeAllInterfaces: options.includeAllInterfaces,
    })

    if (options.verbose) {
      console.log(`[ts-export-to-json] ${label}: ${options.entries.length} file(s) updated`)
    }
  }

  return {
    name: 'vite-plugin-ts-export-to-json',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
      viteAliases = aliasesFromViteConfig(config)
      runGeneration('config')
    },

    buildStart() {
      for (const entry of options.entries) {
        this.addWatchFile(resolve(root, entry.input))
      }

      for (const watched of options.watch ?? []) {
        this.addWatchFile(resolve(root, watched))
      }
    },

    watchChange(file) {
      if (options.buildOnly) return

      const shouldRun = options.entries.some((entry) => samePath(file, resolve(root, entry.input)))
        || (options.watch ?? []).some((watched) => samePath(file, resolve(root, watched)))

      if (shouldRun) {
        runGeneration('watch')
      }
    },

    configureServer(server) {
      if (options.buildOnly) return

      const watched = [
        ...options.entries.map((entry) => resolve(root, entry.input)),
        ...(options.watch ?? []).map((watchedPath) => resolve(root, watchedPath)),
      ]

      server.watcher.on('change', (file) => {
        if (watched.some((target) => samePath(file, target))) {
          runGeneration('dev-watch')
        }
      })
    },
  }
}
