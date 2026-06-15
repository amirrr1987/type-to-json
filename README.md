# type-to-json

Turn exported TypeScript interfaces and types into **i18n label keys**.

Reads your source files, follows imported DTO types, and generates JSON label maps for **exported type aliases, interfaces, and classes** — ready for locale files (form field names, table columns, API response labels).

## Install

```bash
npm install -D type-to-json
```

On install, `type-to-json` automatically:

- creates `type-to-json.config.ts` in your project root (if missing)
- adds a `"type-json": "type-to-json"` script to your `package.json`

## Quick example

This repo includes a working sample under [`examples/`](examples/):

```
examples/
├── data-contracts.ts          # Swagger-generated DTOs (optional `data?` wrapper)
├── interfaces/
│   └── auth.interface.ts      # Your public types — only exports from here go to JSON
└── expected/
    └── auth.labels.json       # Expected output
```

### Input — `examples/interfaces/auth.interface.ts`

```typescript
import type { LoginRequestDTO, LoginResponseResultDTO } from '../data-contracts'

export type IAuthLoginReq = LoginRequestDTO
export type IAuthLoginRes = LoginResponseResultDTO['data']  // unwraps optional data?: T

export interface IAuthProfile {
  id: string
  fullName: string
  email: string
}
```

The tool follows imports to resolve fields, but only **exports from the input file** appear in the output.

**v2.0.2+:** Indexed access on optional swagger wrappers (`data?: T`) is unwrapped correctly — `ResultDTO['data']` resolves to `T`, not an empty map.

### Output — `auth.labels.json`

```json
{
  "IAuthLoginReq": {
    "username": "username",
    "password": "password"
  },
  "IAuthLoginRes": {
    "access_token": "access_token",
    "expires_in": "expires_in",
    "refresh_token": "refresh_token"
  },
  "IAuthProfile": {
    "id": "id",
    "fullName": "fullName",
    "email": "email"
  }
}
```

Each key maps a property name to itself — ready to swap values with translated labels in your locale files.

When a property resolves to an object type (e.g. `IApiResponse<IAdmin>`), v2.0 expands it into a nested map:

```json
{
  "IAdminResponse": {
    "data": {
      "id": "id",
      "fullName": "fullName",
      "adminLevel": "adminLevel"
    },
    "message": "message",
    "statusCode": "statusCode"
  }
}
```

Unions, arrays, primitives, and unresolved generics stay flat (`"data": "data"`).

**Primitive indexed access** (`IBooleanResultDTO['data']` → `boolean | undefined`) has no object properties. By default the export is **skipped with a warning**. Set `includePrimitives: true` to emit `{ "_value": "_value" }`.

**Skipped exports:** When an exported type resolves to an empty property map, the CLI logs a warning with the resolved type string.

**Regenerating locales:** Set `mergeExisting: true` to keep translated values (any value that differs from its key) when re-running after API changes.

## Configuration

`type-to-json.config.ts` in your project root:

```typescript
import { defineConfig } from 'type-to-json'

export default defineConfig({
  extendsTsConfig: './tsconfig.app.json',
  mergeExisting: true,
  entries: [
    {
      input: 'src/interfaces/auth.interface.ts',
      output: 'src/locales/labels/auth.fa.json',
    },
    {
      input: 'src/interfaces/api.ts',
      namespace: 'API',
      output: 'src/locales/labels/api.fa.json',
    },
  ],
  aliases: {
    '@/': './src',
  },
})
```

| Option | Description |
| --- | --- |
| `entries` | `{ input, output, namespace? }[]` — TypeScript sources and JSON output paths |
| `entries[].namespace` | Only export types from this `namespace Foo { ... }` block |
| `entries[].flatten` | Dot-path keys (`data.id`) instead of nested objects |
| `entries[].mergeExisting` | Deprecated — use `mergeStrategy: 'merge-labels'` |
| `entries[].mergeStrategy` | `'overwrite'` (default) or `'merge-labels'` to keep translated values |
| `entries[].includePrimitives` | Placeholder key for boolean/string/number-only exports (default: skip + warn) |
| `entries[].expandArrays` | Expand `ItemDTO[]` into item field keys |
| `entries[].strict` | Exit with error if any export is skipped |
| `entries[].skippedInOutput` | Include `__meta.skipped` in JSON when exports are skipped |
| `mergeStrategy` | Global default (`merge-labels` preserves Persian/translation values) |
| `strict` | Fail the run when any exported type resolves to an empty map |
| `warnOnSkip` | Log skipped exports with resolved TS type (default: `true`) |
| `skippedInOutput` | Write `__meta.skipped` array into output JSON |
| `flatten` | Global default for `entries[].flatten` |
| `includePrimitives` | Global default for primitive-only exports |
| `expandArrays` | Global default for array element expansion |
| `primitiveKey` | Key for primitive-only types (default: `_value`) |
| `extendsTsConfig` | Reuse `paths` from a tsconfig (e.g. `./tsconfig.app.json`) |
| `aliases` | Path aliases for resolving imports |
| `resolvePaths` | Extra search paths for imports |
| `useJsDocLabels` | Use JSDoc summary as label value when present on DTO fields |

```bash
npm run type-json
```

Or run a single file without config:

```bash
npx type-to-json src/interfaces/auth.interface.ts \
  -o src/locales/labels/auth.fa.json \
  --alias @/=./src
```

| Flag | Description |
| --- | --- |
| `-o, --output` | Output JSON path (default: `output.json`) |
| `--alias` | Path alias, e.g. `@/=./src` (repeatable) |
| `--resolve-paths` | Extra comma-separated search paths for imports |

## Behavior

- Only **exported** type aliases, interfaces, and classes from the **input file** become top-level JSON keys
- Imported files are parsed only to resolve field shapes
- Supports `type Foo = IBar` and indexed access like `type Foo = IBar['data']`
- **Nested expansion (v2.0):** object-typed properties become nested JSON objects
- **Namespace (v2.0):** set `namespace: 'API'` on an entry to scope exports to `namespace API { ... }`
- **Class implements (v2.0):** exported classes use fields from their `implements` clause, not the class body
- Union, array, enum, and opaque generic fields stay as flat label keys

## Roadmap

| Version | Status | Features |
| --- | --- | --- |
| v1.1 | ✅ | `extends`, optional/readonly fields |
| v1.2 | ✅ | `Pick` / `Omit` / `Partial`, re-exports |
| v1.3 | ✅ | Generics (opaque), intersections, enums |
| v2.0 | ✅ | Nested object expansion, namespace, class `implements` |
| v2.0.2 | ✅ | Optional indexed access (`data?: T`), skip warnings, quoted property names |
| v2.1 | ✅ | `flatten`, `mergeExisting`, `includePrimitives`, `expandArrays`, `extendsTsConfig` |
| v2.2 | ✅ | `mergeStrategy`, `strict`, `skippedInOutput`, quoted keys fix, nullable union unwrap, banking fixtures |

## Project structure

```
type-to-json/
├── src/
│   ├── index.ts          # Public API exports
│   ├── cli.ts            # CLI entry
│   ├── config.ts         # Config loader and types
│   ├── core.ts           # File I/O orchestration
│   ├── parser.ts         # TypeScript AST parsing
│   ├── generator.ts      # JSON mapping generation
│   ├── mapping.ts        # Nested property mapping (TypeChecker)
│   ├── resolver.ts       # Import / alias resolution
│   ├── utils.ts          # Helpers
│   └── types.ts          # Shared types
├── scripts/
│   └── postinstall.mjs   # Setup script on install
├── examples/             # Sample input/output (see Quick example)
├── dist/                 # Build output (published to npm)
└── tsup.config.ts        # Build tooling only
```

## Development

```bash
npm install
npm test
```

Or manually:

```bash
npm run build
npx tsx src/cli.ts examples/interfaces/auth.interface.ts \
  -o examples/output/auth.labels.json
```

## License

MIT
