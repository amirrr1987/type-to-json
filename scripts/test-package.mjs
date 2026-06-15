#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync } from 'child_process'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const cli = join(root, 'dist', 'cli.js')
const indexJs = join(root, 'dist', 'index.js')

const results = []
let passed = 0
let failed = 0
let warnings = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    results.push({ status: 'PASS', name, detail })
  } else {
    failed++
    results.push({ status: 'FAIL', name, detail })
  }
}

function warn(name, detail) {
  warnings++
  results.push({ status: 'WARN', name, detail })
}

function runCli(args, cwd = root) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── 1. Build artifacts ──────────────────────────────────────────────
for (const file of ['index.js', 'cli.js', 'index.d.ts', 'cli.d.ts']) {
  assert(`build: dist/${file} exists`, existsSync(join(root, 'dist', file)))
}

const cliContent = readFileSync(cli, 'utf-8')
assert('build: cli.js has shebang', cliContent.startsWith('#!/usr/bin/env node'))

// ── 2. API import ───────────────────────────────────────────────────
const indexUrl = pathToFileURL(indexJs).href
const api = await import(indexUrl)
assert('api: exportInterfaceToJson exported', typeof api.exportInterfaceToJson === 'function')
assert('api: exportInterfaceEntries exported', typeof api.exportInterfaceEntries === 'function')
assert('api: defineConfig exported', typeof api.defineConfig === 'function')
assert('api: loadConfig exported', typeof api.loadConfig === 'function')
assert('api: CONFIG_FILENAME = type-to-json.config.ts', api.CONFIG_FILENAME === 'type-to-json.config.ts')
assert('api: NPM_SCRIPT_NAME = type-json', api.NPM_SCRIPT_NAME === 'type-json')

// ── 3. Example fixture (swagger indexed-access pattern) ─────────────
const exampleOut = join(root, 'examples', 'output', 'test-auth.labels.json')
mkdirSync(dirname(exampleOut), { recursive: true })
const exampleResult = api.exportInterfaceToJson(
  'examples/interfaces/auth.interface.ts',
  'examples/output/test-auth.labels.json',
  { basePath: root },
)
const expected = JSON.parse(readFileSync(join(root, 'examples', 'expected', 'auth.labels.json'), 'utf-8'))

assert('example: output matches expected', deepEqual(exampleResult, expected))
assert('example: IAuthLoginRes unwrapped from optional data', !!exampleResult.IAuthLoginRes?.access_token)

// ── 4. Import-based DTO pattern ─────────────────────────────────────
const importOut = join(root, 'test-fixtures', 'output', 'import-based.json')
mkdirSync(dirname(importOut), { recursive: true })
const importResult = api.exportInterfaceToJson(
  'test-fixtures/import-based/auth.interface.ts',
  'test-fixtures/output/import-based.json',
  { basePath: root, aliases: { '@/': join(root, 'test-fixtures/import-based') } },
)

assert('import-based: IAuthLoginReq resolved', !!importResult.IAuthLoginReq)
assert('import-based: IAuthLoginReq has username', importResult.IAuthLoginReq?.username === 'username')
assert('import-based: IAuthLoginReq has password', importResult.IAuthLoginReq?.password === 'password')
assert('import-based: IAuthProfile exported', !!importResult.IAuthProfile)
assert('import-based: IInternalOnly excluded', !importResult.IInternalOnly)
assert('import-based: INonExportedAlias excluded', !importResult.INonExportedAlias)

// ── 5. Indexed access pattern ───────────────────────────────────────
const indexedResult = api.exportInterfaceToJson(
  'test-fixtures/indexed-access/main.ts',
  'test-fixtures/output/indexed.json',
  { basePath: root },
)
assert('indexed-access: IUnwrapped has token', indexedResult.IUnwrapped?.token === 'token')
assert('indexed-access: IUnwrapped has userId', indexedResult.IUnwrapped?.userId === 'userId')

// ── 5b. Optional indexed access (swagger data?: T pattern) ──────────
const optionalIndexedResult = api.exportInterfaceToJson(
  'test-fixtures/indexed-access-optional/main.ts',
  'test-fixtures/output/indexed-optional.json',
  { basePath: root },
)
const optionalExpected = JSON.parse(
  readFileSync(join(root, 'test-fixtures/indexed-access-optional/expected.json'), 'utf-8'),
)
assert('indexed-access-optional: matches expected', deepEqual(optionalIndexedResult, optionalExpected))

// ── 5c. Primitive indexed access — skipped with warning ─────────────
const originalWarn = console.warn
const primitiveWarnLogs = []
console.warn = (...args) => {
  primitiveWarnLogs.push(args.join(' '))
  originalWarn(...args)
}
const primitiveResult = api.exportInterfaceToJson(
  'test-fixtures/indexed-access-primitive/main.ts',
  'test-fixtures/output/indexed-primitive.json',
  { basePath: root },
)
console.warn = originalWarn
assert('indexed-access-primitive: IBooleanUnwrapped skipped', !primitiveResult.IBooleanUnwrapped)
assert(
  'indexed-access-primitive: emits skip warning',
  primitiveWarnLogs.some((line) => line.includes('IBooleanUnwrapped') && line.includes('skipped')),
)

const primitiveWithOption = api.exportInterfaceToJson(
  'test-fixtures/indexed-access-primitive/main.ts',
  'test-fixtures/output/indexed-primitive-with-option.json',
  { basePath: root, includePrimitives: true },
)
assert(
  'indexed-access-primitive: includePrimitives emits _value',
  primitiveWithOption.IBooleanUnwrapped?._value === '_value',
)

// ── 5d. Quoted swagger property names ───────────────────────────────
const quotedResult = api.exportInterfaceToJson(
  'test-fixtures/quoted-property-names/main.ts',
  'test-fixtures/output/quoted.json',
  { basePath: root },
)
assert(
  'quoted-property-names: unquoted key',
  Object.prototype.hasOwnProperty.call(quotedResult.IKeycloakSettings ?? {}, 'not-before-policy'),
)
assert(
  'quoted-property-names: no escaped quotes in key',
  !Object.keys(quotedResult.IKeycloakSettings ?? {}).some((key) => key.includes('"')),
)

// ── 6. Inline type aliases and interfaces ───────────────────────────
const inlineResult = api.exportInterfaceToJson(
  'test-fixtures/inline-types/main.ts',
  'test-fixtures/output/inline.json',
  { basePath: root },
)
assert('inline: IInlineIface works', !!inlineResult.IInlineIface?.email)
assert('inline: IInlineReq works', !!inlineResult.IInlineReq?.username)
assert('inline: IInlineReq has password', inlineResult.IInlineReq?.password === 'password')

// ── 7. Missing import file warning ──────────────────────────────────
const warnLogs = []
console.warn = (...args) => {
  warnLogs.push(args.join(' '))
  originalWarn(...args)
}

api.exportInterfaceToJson(
  'test-fixtures/missing-import/main.ts',
  'test-fixtures/output/missing.json',
  { basePath: root },
)

console.warn = originalWarn

if (warnLogs.some((line) => line.includes('[type-to-json] Warning:'))) {
  assert('missing-import: emits warning', true)
} else {
  warn(
    'missing-import: no warning for unresolved import',
    'resolveImport returns null silently when ./does-not-exist cannot be resolved',
  )
}

// ── 7b. ESM .js extension imports (TypeScript convention) ─────────────
const esmJsResult = api.exportInterfaceToJson(
  'test-fixtures/esm-js-extension/main.ts',
  'test-fixtures/output/esm-js.json',
  { basePath: root },
)
assert('esm-js-extension: resolves .js suffix imports', !!esmJsResult.IEsmStyleImport?.username)

// ── 8. CLI single-file mode ─────────────────────────────────────────
const cliSingle = runCli([
  'test-fixtures/import-based/auth.interface.ts',
  '-o', 'test-fixtures/output/cli-single.json',
  '--alias', `@/=${join(root, 'test-fixtures/import-based')}`,
])
assert('cli: single-file exits 0', cliSingle.status === 0, cliSingle.stderr || cliSingle.stdout)
const cliSingleOut = JSON.parse(readFileSync(join(root, 'test-fixtures/output/cli-single.json'), 'utf-8'))
assert('cli: single-file generates IAuthLoginReq', !!cliSingleOut.IAuthLoginReq)

// ── 9. CLI missing input ────────────────────────────────────────────
const cliMissing = runCli(['nonexistent/file.ts'])
assert('cli: missing input exits non-zero', cliMissing.status !== 0)
assert('cli: missing input shows error', (cliMissing.stderr + cliMissing.stdout).includes('not found'))

// ── 10. CLI config mode ─────────────────────────────────────────────
const configDir = mkdtempSync(join(tmpdir(), 'type-to-json-test-'))
writeFileSync(
  join(configDir, 'type-to-json.config.ts'),
  `import { defineConfig } from '${indexUrl}'\n` +
    `export default defineConfig({ entries: [{ input: '${join(root, 'test-fixtures/import-based/auth.interface.ts').replace(/\\/g, '/')}', output: 'out.json' }], aliases: { '@/': '${join(root, 'test-fixtures/import-based').replace(/\\/g, '/')}/' } })\n`,
)
const cliConfig = runCli([], configDir)
assert('cli: config mode exits 0', cliConfig.status === 0, cliConfig.stderr || cliConfig.stdout)
assert('cli: config mode writes output', existsSync(join(configDir, 'out.json')))

// ── 11. CLI no config ───────────────────────────────────────────────
const noConfigDir = mkdtempSync(join(tmpdir(), 'type-to-json-noconfig-'))
writeFileSync(join(noConfigDir, 'package.json'), '{}')
const cliNoConfig = runCli([], noConfigDir)
assert('cli: no config exits non-zero', cliNoConfig.status !== 0)
assert('cli: no config shows error', (cliNoConfig.stderr + cliNoConfig.stdout).toLowerCase().includes('config'))

// ── 12. Postinstall script ──────────────────────────────────────────
const postinstallDir = mkdtempSync(join(tmpdir(), 'type-to-json-postinstall-'))
writeFileSync(join(postinstallDir, 'package.json'), JSON.stringify({ name: 'test-consumer', version: '1.0.0', scripts: {} }, null, 2))
const postinstall = spawnSync(process.execPath, [join(root, 'scripts', 'postinstall.mjs')], {
  cwd: root,
  encoding: 'utf-8',
  env: { ...process.env, INIT_CWD: postinstallDir },
})
const consumerPkg = JSON.parse(readFileSync(join(postinstallDir, 'package.json'), 'utf-8'))
assert('postinstall: creates type-to-json.config.ts', existsSync(join(postinstallDir, 'type-to-json.config.ts')))
assert('postinstall: adds type-json script', consumerPkg.scripts?.['type-json'] === 'type-to-json')
assert('postinstall: exits 0', postinstall.status === 0)

// cleanup temp dirs
rmSync(configDir, { recursive: true, force: true })
rmSync(noConfigDir, { recursive: true, force: true })
rmSync(postinstallDir, { recursive: true, force: true })

// ── 13. v2.0 — nested object expansion ──────────────────────────────
const nestedOut = join(root, 'test-fixtures', 'output', 'v2-nested.json')
mkdirSync(dirname(nestedOut), { recursive: true })
const nestedResult = api.exportInterfaceToJson(
  'test-fixtures/v2.0/nested.ts',
  'test-fixtures/output/v2-nested.json',
  { basePath: root },
)

assert('v2.0 nested: IAdminResponse exported', !!nestedResult.IAdminResponse)
assert(
  'v2.0 nested: data expands to object',
  typeof nestedResult.IAdminResponse?.data === 'object' && nestedResult.IAdminResponse?.data?.id === 'id',
)
assert(
  'v2.0 nested: intersection fields merged in data',
  nestedResult.IAdminResponse?.data?.adminLevel === 'adminLevel',
)
assert(
  'v2.0 nested: generic IApiResponse keeps opaque data',
  nestedResult.IApiResponse?.data === 'data',
)
assert(
  'v2.0 nested: arrays stay flat',
  nestedResult.IUser?.permissionList === 'permissionList',
)
assert(
  'v2.0 class: UserService uses implements fields',
  nestedResult.UserService?.fullName === 'fullName' && nestedResult.UserService?.id === 'id',
)

// ── 14. v2.0 — namespace scoping ────────────────────────────────────
const nsResult = api.exportInterfaceToJson(
  'test-fixtures/v2.0/namespace.ts',
  'test-fixtures/output/v2-namespace.json',
  { basePath: root, namespace: 'API' },
)

assert('v2.0 namespace: IUser from API namespace', !!nsResult.IUser?.fullName)
assert('v2.0 namespace: IProduct from API namespace', !!nsResult.IProduct?.title)
assert('v2.0 namespace: outside types excluded', !nsResult.IOutsideNamespace)

// ── 15. v2.1 — flatten output ───────────────────────────────────────
const flattenResult = api.exportInterfaceToJson(
  'test-fixtures/v2.1/flatten.ts',
  'test-fixtures/output/v2-flatten.json',
  { basePath: root, flatten: true },
)
assert('v2.1 flatten: data.id key', flattenResult.INestedRes?.['data.id'] === 'data.id')
assert('v2.1 flatten: message key', flattenResult.INestedRes?.message === 'message')

// ── 16. v2.1 — expandArrays ─────────────────────────────────────────
const arraysResult = api.exportInterfaceToJson(
  'test-fixtures/v2.1/arrays.ts',
  'test-fixtures/output/v2-arrays.json',
  { basePath: root, expandArrays: true },
)
assert('v2.1 arrays: items expanded', arraysResult.IOrderList?.items?.productId === 'productId')

// ── 17. v2.1 — mergeExisting preserves translations ─────────────────
const mergeOut = join(root, 'test-fixtures/output/v2-merge.json')
writeFileSync(
  mergeOut,
  readFileSync(join(root, 'test-fixtures/v2.1/merge-existing.json'), 'utf-8'),
)
const mergeResult = api.exportInterfaceToJson(
  'test-fixtures/v2.1/merge.ts',
  'test-fixtures/output/v2-merge.json',
  { basePath: root, mergeExisting: true },
)
assert('v2.1 merge: keeps translated username', mergeResult.IAuthLoginReq?.username === 'نام کاربری')
assert('v2.1 merge: adds scaffold password', mergeResult.IAuthLoginReq?.password === 'password')

// ── Report ──────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
console.log('  type-to-json — Test Report')
console.log('══════════════════════════════════════════\n')

for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}

console.log('\n──────────────────────────────────────────')
console.log(`  PASS: ${passed}  FAIL: ${failed}  WARN: ${warnings}`)
console.log('──────────────────────────────────────────\n')

process.exit(failed > 0 ? 1 : 0)
