---
title: "@nestjs-pipeline/tenant"
description: "The current tenant for @nestjs-pipeline/core applications: the running pipeline's tenant, or the tenant of a runWithTenant scope"
editUrl: false
---

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-tenant`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-tenant).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-tenant/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/tenant` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)

The current tenant of an execution: `currentTenantId()` returns the tenant of the
innermost `runWithTenant` scope, so code deep inside a handler can read the tenant without
it being passed at every call site. It has no dependencies; `tenantSource` connects it to
[`@nestjs-pipeline/core`](/nestjs-pipeline/packages/nestjs-pipeline/core/)
pipelines and to `@nestjs-pipeline/job-context`.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-tenant @cqrs-ddd/nestjs
```

Requires Node.js 22.12 or later. To give pipelines the tenant, pass `tenantSource` to
`PipelineModule.forRoot`:

```typescript
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

PipelineModule.forRoot({ sources: { tenantId: tenantSource } });
```

## Usage

```typescript
import { currentTenantId, runWithTenant } from '@nestjs-pipeline/tenant';

// Where work enters the application:
await runWithTenant('tenant_a', () => this.commandBus.execute(command));

// Anywhere below it, including inside a handler:
const tenant = currentTenantId(); // 'tenant_a'
```

### HTTP middleware

Resolve the tenant from something the application trusts, such as a verified token claim
or a host name, and check it against the known tenants. A raw client header is shown here
only for brevity.

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { runWithTenant } from '@nestjs-pipeline/tenant';

const TENANTS = new Set(['tenant_a', 'tenant_b']);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    const header = req.headers['x-tenant'];
    const tenant = typeof header === 'string' && TENANTS.has(header) ? header : undefined;
    runWithTenant(tenant, next);
  }
}
```

Register it with `consumer.apply(TenantMiddleware).forRoutes('*')`.

### Queue job

```typescript
@Processor('reports')
export class ReportProcessor extends WorkerHost {
  async process(job: Job<{ tenantId: string; reportId: string }>) {
    await runWithTenant(job.data.tenantId, () =>
      this.commandBus.execute(new BuildReportCommand(job.data.reportId)),
    );
  }
}
```

To carry the tenant, correlation id and principal of the enqueuing request, with
validation, use `withJobContext` and `@InJobContext` of
[`@nestjs-pipeline/job-context`](/nestjs-pipeline/packages/nestjs-pipeline/job-context/),
configured with `tenantSource`.

### Changing the tenant for part of a handler

```typescript
for (const tenant of ['tenant_a', 'tenant_b']) {
  await runWithTenant(tenant, () => this.commandBus.execute(new RecalculateCommand()));
}
```

### Reading the tenant in a library

```typescript
import { currentTenantId } from '@nestjs-pipeline/tenant';

function tenantKey(key: string): string {
  const tenant = currentTenantId();
  if (tenant === undefined) throw new Error('No tenant in scope.');
  return `${tenant}:${key}`;
}
```

The package owns the tenant store. With `tenantSource` configured, a pipeline started
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
| `tenantSource` | object | `{ current, run }` over the same store, for `PipelineModule.forRoot({ sources })` and `JobContextModule.forRoot` |

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
