#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { exportInterfaceToJson } from './core.js'
import { parseAliasArg, readPackageVersion, shortPath } from './utils.js'
import type { AliasMap } from './types.js'

const program = new Command()
const packageVersion = readPackageVersion()

program
  .name('ts-export-to-json')
  .description('Generate JSON field maps from exported TypeScript type aliases')
  .version(packageVersion)
  .argument('<input>', 'TypeScript input file to parse')
  .option('-o, --output <file>', 'Output JSON file path', 'output.json')
  .option('--resolve-paths <paths>', 'Comma-separated additional paths to search for imports', '')
  .option(
    '--alias <alias>',
    'Path alias mapping (e.g. @/=./src). Can be used multiple times.',
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .option('--all-interfaces', 'Include all discovered interfaces from imports, not just input-file exports', false)
  .option('--clean-names', 'Transform export keys (IAuthLoginReq -> AuthLoginRequest)', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .action((inputArg: string, options) => {
    console.log()
    console.log(chalk.bold.cyan('  ts-export-to-json') + chalk.gray(` v${packageVersion}`))
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
      ? (options.resolvePaths as string).split(',').map((p: string) => p.trim()).filter(Boolean)
      : []

    console.log(chalk.gray(`  input:  ${shortPath(inputFile)}`))
    console.log(chalk.gray(`  output: ${options.output}`))
    console.log()

    const spinner = ora({ text: 'Generating JSON mapping...', color: 'cyan' }).start()

    try {
      const mapping = exportInterfaceToJson(inputArg, options.output as string, {
        aliases: aliasMap,
        resolvePaths,
        cleanNames: !!options.cleanNames,
        includeAllInterfaces: !!options.allInterfaces,
      })

      const entryCount = Object.keys(mapping).length
      spinner.succeed(chalk.green('JSON mapping generated'))

      if (entryCount === 0) {
        console.log()
        console.log(chalk.yellow('  ⚠ No mappings generated. Check exports in the input file.'))
      } else if (options.verbose) {
        console.log()
        console.log(chalk.bold(`  Mappings generated: `) + chalk.cyan(entryCount.toString()))
        for (const [name, props] of Object.entries(mapping)) {
          console.log(
            chalk.gray(`    • ${chalk.white(name)} `) +
              chalk.gray(`(${Object.keys(props).length} properties)`),
          )
        }
      }

      console.log()
      console.log(chalk.bold.green(`  ✔ Output written to ${options.output}`))
      console.log()
    } catch (err) {
      spinner.fail(chalk.red('Generation failed'))
      console.error(chalk.red(`  ${(err as Error).message}`))
      process.exit(1)
    }
  })

program.parse()
