# type-to-json

CLI that reads TypeScript source files, follows imported DTO types, and generates JSON field maps for **exported type aliases and interfaces** from the input file.

Typical use case: turn API request/response types into label keys for i18n (e.g. form field names, table columns).

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
├── interfaces/
│   └── auth.interface.ts      # Your public types — only exports from here go to JSON
└── expected/
    └── auth.labels.json       # Expected output
```

### Input — `examples/interfaces/auth.interface.ts`

```typescript
import type { LoginRequestDTO, LoginResponseResultDTO } from '@/api/data-contracts'

export type IAuthLoginReq = LoginRequestDTO
export type IAuthLoginRes = LoginResponseResultDTO['data']

export interface IAuthProfile {
  id: string
  fullName: string
  email: string
}
```

The tool follows `@/api/data-contracts` to resolve fields, but only **exports from the input file** appear in the output.

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

## Configuration

`type-to-json.config.ts` in your project root:

```typescript
import { defineConfig } from 'type-to-json'

export default defineConfig({
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
| `aliases` | Path aliases for resolving imports |
| `resolvePaths` | Extra search paths for imports |

## CLI

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
| v2.1 | Planned | `flatten` output mode (dot-path keys like `data.id` instead of nested objects) |

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
npm run build
npx tsx src/cli.ts examples/interfaces/auth.interface.ts \
  -o examples/output/auth.labels.json \
  --alias @/=./examples
```

## License

MIT
