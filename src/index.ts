export { exportInterfaceToJson, exportInterfaceEntries, resolveConfigOptions } from './core.js'
export type { ExportInterfaceOptions } from './core.js'
export { flattenOutput, mergeOutputWithExisting } from './output.js'

export {
  defineConfig,
  loadConfig,
  CONFIG_FILENAME,
  NPM_SCRIPT_NAME,
} from './config.js'
export type { ExportEntry, TypeToJsonConfig } from './config.js'
