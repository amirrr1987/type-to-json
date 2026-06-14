# vite-plugin-ts-types-to-json

Vite plugin and CLI that reads TypeScript source files, follows imported DTO types, and generates JSON maps for **exported type aliases and interfaces** from the input file.

## Install

```bash
npm install -D vite-plugin-ts-types-to-json
```

## Vite plugin (recommended)

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { tsTypesToJson } from 'vite-plugin-ts-types-to-json'

export default defineConfig({
  plugins: [
    tsTypesToJson({
      entries: [
        {
          input: 'src/interfaces/auth.interface.ts',
          output: 'src/locales/interfaces/auth.fa.json',
        },
      ],
      watch: ['src/api/data-contracts.ts'],
    }),
  ],
  resolve: {
    alias: {
      '@': '/absolute/path/to/src',
    },
  },
})
```

### Plugin options

| Option | Description |
| --- | --- |
| `entries` | `{ input, output }[]` relative to Vite root |
| `watch` | Extra files that trigger regeneration |
| `aliases` | Extra path aliases merged with Vite `resolve.alias` |
| `cleanNames` | `IAuthLoginReq` → `AuthLoginRequest` |
| `includeAllInterfaces` | Include imported interfaces too |
| `buildOnly` | Skip generation during dev |
| `verbose` | Log updated files |

The plugin:
- runs on `dev` and `build`
- uses Vite `resolve.alias` automatically (`@/` supported)
- watches source files and optional dependency files

## CLI

```bash
npx vite-plugin-ts-types-to-json src/interfaces/auth.interface.ts \
  -o src/locales/interfaces/auth.fa.json \
  --alias @/=./src
```

## Output example

Input:

```typescript
export type IAuthLoginReq = ILoginRequestDTO
export type IAuthLoginRes = ILoginResponseResultDTO['data']
```

Output:

```json
{
  "IAuthLoginReq": {
    "branchCode": "branchCode",
    "username": "username",
    "password": "password"
  },
  "IAuthLoginRes": {
    "access_token": "access_token",
    "expires_in": "expires_in"
  }
}
```

## Behavior

- Only **exported** type aliases and interfaces from the **input file**
- Imported files are parsed only to resolve field shapes
- Supports `type Foo = IBar` and `type Foo = IBar['data']`
- Primitive `data` fields (e.g. `boolean`) are skipped

## Development

```bash
npm install
npm run build
npm run dev -- src/auth.interface.ts -o output.json --alias @/=./src -v
```

## License

MIT
