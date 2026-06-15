export { exportInterfaceToJson, exportInterfaceEntries, resolveConfigOptions, runExport } from './core.js'
export type { ExportInterfaceOptions } from './core.js'
export { flattenOutput, mergeOutputWithExisting, stripOutputMeta } from './output.js'
export type { MergeStrategy } from './output.js'
export { normalizePropertyName } from './utils.js'

export {
  defineConfig,
  loadConfig,
  CONFIG_FILENAME,
  NPM_SCRIPT_NAME,
} from './config.js'
export type { ExportEntry, TypeToJsonConfig } from './config.js'
export type {
  MappingOptions,
  OutputMapping,
  PropertyMapping,
  SkippedExport,
  GenerationResult,
} from './types.js'
export { OUTPUT_META_KEY } from './types.js'
