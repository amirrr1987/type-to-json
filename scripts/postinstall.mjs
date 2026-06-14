import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const PACKAGE_NAME = 'type-to-json'
const CONFIG_FILENAME = 'type-to-json.config.ts'
const NPM_SCRIPT_NAME = 'type-json'
const CLI_COMMAND = 'type-to-json'

const DEFAULT_CONFIG_TEMPLATE = `import { defineConfig } from 'type-to-json'

export default defineConfig({
  entries: [
    {
      input: 'src/interfaces/example.interface.ts',
      output: 'src/locales/labels/example.json',
    },
  ],
  aliases: {
    '@/': './src',
  },
})
`

function getProjectRoot() {
  return process.env.INIT_CWD ?? null
}

function isSelfInstall(root) {
  try {
    const pkgPath = join(root, 'package.json')
    if (!existsSync(pkgPath)) return false
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.name === PACKAGE_NAME
  } catch {
    return false
  }
}

function createConfigFile(root) {
  const configPath = join(root, CONFIG_FILENAME)
  if (existsSync(configPath)) return false
  writeFileSync(configPath, DEFAULT_CONFIG_TEMPLATE, 'utf-8')
  return true
}

function addNpmScript(root) {
  const pkgPath = join(root, 'package.json')
  if (!existsSync(pkgPath)) return false

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  if (pkg.scripts?.[NPM_SCRIPT_NAME]) return false

  pkg.scripts = {
    ...pkg.scripts,
    [NPM_SCRIPT_NAME]: CLI_COMMAND,
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
  return true
}

const root = getProjectRoot()
if (root && !isSelfInstall(root)) {
  const createdConfig = createConfigFile(root)
  const addedScript = addNpmScript(root)

  if (createdConfig || addedScript) {
    const messages = []
    if (createdConfig) messages.push(CONFIG_FILENAME)
    if (addedScript) messages.push(`"${NPM_SCRIPT_NAME}" script`)
    console.log(`[type-to-json] Created ${messages.join(' and ')}`)
  }
}
