# @nestjs-pipeline/tenant

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)

The current tenant for applications built on
[`@nestjs-pipeline/core`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline#readme):
`currentTenantId()` returns the tenant of the running pipeline, or of a `runWithTenant`
scope, so code deep inside a handler can read the tenant without it being passed at every
call site.

## Installation

```bash
pnpm add @nestjs-pipeline/tenant @nestjs-pipeline/core
```

Requires Node.js 22 or later. There is nothing to register: the package reads and writes
the execution scope that `@nestjs-pipeline/core` already carries.

## Usage

```typescript
import { currentTenantId, runWithTenant } from '@nestjs-pipeline/tenant';

// Where work enters the application, such as HTTP middleware or a queue job:
await runWithTenant(req.headers['x-tenant'], () => next());

// Anywhere below it, including inside a handler:
const tenant = currentTenantId();
```

The tenant lives in the execution scope of `@nestjs-pipeline/core`. A pipeline started
inside `runWithTenant` takes that tenant as its write-once `context.tenantId` and runs its
behaviors and handler with it, so nested dispatches inherit it. A `runWithTenant` inside a
handler changes the tenant for its own callback only, and a pipeline dispatched there takes
the new tenant. `runWithTenant(undefined, fn)` runs `fn` with no tenant. Outside any scope,
`currentTenantId()` returns `undefined`: code that needs a tenant must then fail rather
than fall back to a shared one, as the tenant-scoped behaviors do.

To hand the tenant to a library that asks for a function returning the current tenant,
pass `currentTenantId` itself.

## API

| Export | Kind | Description |
| --- | --- | --- |
| `currentTenantId()` | function | The tenant of the innermost pipeline execution or `runWithTenant` scope, or `undefined` |
| `runWithTenant(tenantId, fn)` | function | Runs `fn` with `tenantId` as the current tenant and returns its result |

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
