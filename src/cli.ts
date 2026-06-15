#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { loadConfig } from './config.js'
import { exportInterfaceEntries, resolveConfigOptions, runExport } from './core.js'
import { parseAliasArg, readPackageVersion, shortPath } from './utils.js'
import type { AliasMap, SkippedExport } from './types.js'

const program = new Command()
const packageVersion = readPackageVersion()

function printSkippedSummary(skipped: SkippedExport[]): void {
  if (skipped.length === 0) return
  console.log()
  console.log(chalk.yellow(`  ⚠ Skipped ${skipped.length} export(s):`))
  for (const item of skipped) {
    console.log(chalk.yellow(`    • ${item.name} (${item.resolvedType})`))
  }
  console.log()
}

async function runFromConfig(): Promise<void> {
  const config = await loadConfig()
  const spinner = ora({
    text: `Generating ${config.entries.length} JSON mapping(s)...`,
    color: 'cyan',
  }).start()

  try {
    const { skipped } = exportInterfaceEntries(config.entries, {
      ...resolveConfigOptions(config),
      aliases: config.aliases,
      resolvePaths: config.resolvePaths,
    })
    spinner.succeed(chalk.green('JSON mappings generated'))
    printSkippedSummary(skipped)
    console.log()
    for (const entry of config.entries) {
      console.log(chalk.bold.green(`  ✔ ${entry.output}`))
    }
    console.log()
  } catch (err) {
    spinner.fail(chalk.red('Generation failed'))
    console.error(chalk.red(`  ${(err as Error).message}`))
    process.exit(1)
  }
}

async function runSingleFile(inputArg: string, options: {
  output: string
  resolvePaths?: string
  alias?: string[]
  flatten?: boolean
  mergeExisting?: boolean
  includePrimitives?: boolean
  expandArrays?: boolean
}): Promise<void> {
  console.log()
  console.log(chalk.bold.cyan('  type-to-json') + chalk.gray(` v${packageVersion}`))
  console.log(chalk.gray('  ─────────────────────────────────'))
  console.log()

  const inputFile = resolve(inputArg)
  if (!existsSync(inputFile)) {
    console.error(chalk.red(`  ✖ Input file not found: ${inputFile}`))
    process.exit(1)
  }

  const aliasMap: AliasMap = {}
  const rawAliases: string[] = Array.isArray(options.alias) ? options.alias : []
  for (const aliasStr of rawAliases) {
    const parsed = parseAliasArg(aliasStr)
    if (parsed) {
      aliasMap[parsed.key] = parsed.value
      console.log(chalk.gray(`  alias: ${chalk.yellow(parsed.key)} → ${parsed.value}`))
    } else {
      console.warn(chalk.yellow(`  ⚠ Could not parse alias: "${aliasStr}" (expected format: alias=path)`))
    }
  }

  const resolvePaths: string[] = options.resolvePaths
    ? options.resolvePaths.split(',').map((p: string) => p.trim()).filter(Boolean)
    : []

  console.log(chalk.gray(`  input:  ${shortPath(inputFile)}`))
  console.log(chalk.gray(`  output: ${options.output}`))
  console.log()

  const spinner = ora({ text: 'Generating JSON mapping...', color: 'cyan' }).start()

  try {
    const { mapping, skipped } = runExport(inputArg, options.output, {
      aliases: aliasMap,
      resolvePaths,
      flatten: options.flatten,
      mergeExisting: options.mergeExisting,
      includePrimitives: options.includePrimitives,
      expandArrays: options.expandArrays,
    })

    printSkippedSummary(skipped)

    const entryCount = Object.keys(mapping).length
    spinner.succeed(chalk.green('JSON mapping generated'))

    if (entryCount === 0) {
      console.log()
      console.log(chalk.yellow('  ⚠ No mappings generated. Check exports in the input file.'))
    }

    console.log()
    console.log(chalk.bold.green(`  ✔ Output written to ${options.output}`))
    console.log()
  } catch (err) {
    spinner.fail(chalk.red('Generation failed'))
    console.error(chalk.red(`  ${(err as Error).message}`))
    process.exit(1)
  }
}

program
  .name('type-to-json')
  .description('Generate i18n label maps from exported TypeScript interfaces and types')
  .version(packageVersion)
  .argument('[input]', 'TypeScript input file (optional when using type-to-json.config.ts)')
  .option('-o, --output <file>', 'Output JSON file path', 'output.json')
  .option('--resolve-paths <paths>', 'Comma-separated additional paths to search for imports', '')
  .option(
    '--alias <alias>',
    'Path alias mapping (e.g. @/=./src). Can be used multiple times.',
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .option('--flatten', 'Dot-path keys (data.id) instead of nested objects')
  .option('--merge-existing', 'Preserve translated values already in the output file')
  .option('--include-primitives', 'Emit _value key for boolean/string/number-only exports')
  .option('--expand-arrays', 'Expand ItemDTO[] into item field keys')
  .action(async (inputArg: string | undefined, options) => {
    if (inputArg) {
      await runSingleFile(inputArg, options)
      return
    }

    console.log()
    console.log(chalk.bold.cyan('  type-to-json') + chalk.gray(` v${packageVersion}`))
    console.log(chalk.gray('  ─────────────────────────────────'))
    console.log()

    await runFromConfig()
  })

program.parseAsync().catch((err: Error) => {
  console.error(chalk.red(err.message))
  process.exit(1)
})

