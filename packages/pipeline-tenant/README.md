# @nestjs-pipeline/tenant

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)

`TenantScopeBehavior` connects the tenant of a
[`@nestjs-pipeline/core`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline#readme)
pipeline to the tenant scope of
[`@cqrs-ddd/core`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/ddd-core#readme).
It runs each pipeline invocation inside `runWithTenant(context.tenantId, next)`, so
tenant-scoped helpers such as `filterCacheKey` and `cacheKeyTemplate` find the tenant
without it being passed at every call site.

## Installation

```bash
pnpm add @nestjs-pipeline/tenant @nestjs-pipeline/core @cqrs-ddd/core @nestjs/common reflect-metadata
```

Requires Node.js 22 or later.

`@cqrs-ddd/core` is a peer dependency, not a dependency, and the application must resolve
exactly one copy of it. Its tenant scope is a module-level `AsyncLocalStorage`: with two
copies, the behavior would set the tenant in one scope while `filterCacheKey` reads the
other, and every tenant-scoped key would fail closed.

## Setup

Register the behavior **first** in the global `'all'` `before` list, so the whole chain
and the handler run inside the tenant scope. The pipeline's own tenant comes from
`tenantIdFactory`, and nested dispatches inherit it.

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { TenantScopeBehavior } from '@nestjs-pipeline/tenant';

@Module({
  imports: [
    PipelineModule.forRootAsync({
      imports: [TenantModule],
      inject: [TenantContext],
      globalBehaviors: [
        {
          scope: 'all',
          before: [TenantScopeBehavior /* , then the other global behaviors */],
        },
      ],
      useFactory: (tenant: TenantContext) => ({
        tenantIdFactory: () => tenant.currentTenantId,
      }),
    }),
  ],
})
export class AppModule {}
```

`TenantModule` and `TenantContext` stand for the application's own tenant resolution,
for example from the authenticated request.

## Tenant resolution

With the behavior registered, a tenant-scoped helper in `@cqrs-ddd/core` resolves the
tenant in this order:

1. an explicit tenant id string passed to it;
2. the `tenantId` of an object passed to it, such as a pipeline context;
3. the tenant of the running scope, which this behavior sets from the pipeline;
4. otherwise it throws `MissingTenantContextError`.

A pipeline invocation without a tenant runs with none, so tenant-scoped keys fail closed
instead of falling back to a shared namespace. Code outside a pipeline, such as a queue
consumer that does not dispatch through one, sets the scope itself with
`runWithTenant(tenantId, fn)` from `@cqrs-ddd/core/application`.

## API

| Export | Kind | Description |
| --- | --- | --- |
| `TenantScopeBehavior` | class | Pipeline behavior that runs the rest of the chain and the handler inside `runWithTenant(context.tenantId, next)` |

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
