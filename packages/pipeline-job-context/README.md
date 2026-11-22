# @nestjs-pipeline/job-context

> ## The main repository is [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). You can use [`@cqrs-ddd/pipeline-job-context`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-job-context) and [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs) directly.
>
> **This package has no code of its own.** From 0.6.1 it re-exports `@cqrs-ddd/pipeline-job-context` and
> `@cqrs-ddd/nestjs/job-context` at the same version. The code, the issues and the releases are in
> [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). The documentation is at
> [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/).
>
> **This package is not deprecated.** An application can keep the `@nestjs-pipeline/job-context` name, or
> replace it with the `@cqrs-ddd` packages. The import paths change, and the code stays
> the same. Versions 0.1 to 0.4 stay on npm unchanged.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)

The execution context of a request, carried into the queue jobs that it enqueues: the tenant, the correlation id and the principal. A job then makes the decisions that the request makes. System-started work, such as a cron job, declares its context explicitly. Nothing falls back to a default tenant or an anonymous principal.

**Documentation:** [@cqrs-ddd/pipeline-job-context](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-job-context/) · [@cqrs-ddd/nestjs/job-context](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/#background-jobs-with-jobcontextmodule) · [from @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/job-context @cqrs-ddd/pipeline-job-context \
  @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/common @nestjs/core @nestjs/cqrs
```

Requires Node.js 22.12 or later and NestJS 12.

## Exports

- Everything of `@cqrs-ddd/pipeline-job-context`: `withJobContext`, `@InJobContext`, `@AsSystem`, `registerJobContext` and the job context errors.
- Everything of `@cqrs-ddd/nestjs/job-context`: `JobContextModule`.

## Example

```typescript
import { JobContextModule } from '@nestjs-pipeline/job-context';
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { Module } from '@nestjs/common';
import { SessionJobPrincipal } from './session-job-principal.service.js';

@Module({
  imports: [
    JobContextModule.forRoot({
      principal: SessionJobPrincipal,
      tenants: ['tenant_primary', 'tenant_secondary'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
    }),
  ],
})
export class BackgroundJobModule {}
```

## Upgrade from 0.4.x

The API of 0.6.1 is the API of `@cqrs-ddd` 0.6.1. The guide
[From @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/) gives all the changes. The changes for this package:

- `JobContextModule` keeps its options. `withJobContext`, `@InJobContext` and `@AsSystem` keep their names.
- The package requires the peers of `@cqrs-ddd/nestjs`: `@cqrs-ddd/core`, `@cqrs-ddd/pipeline`, `@nestjs/core` and `@nestjs/cqrs`.

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
