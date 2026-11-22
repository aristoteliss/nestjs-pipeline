# @nestjs-pipeline/core

> ## The main repository is [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). You can use [`@cqrs-ddd/pipeline`](https://www.npmjs.com/package/@cqrs-ddd/pipeline) and [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs) directly.
>
> **This package has no code of its own.** From 0.6.1 it re-exports `@cqrs-ddd/pipeline` and
> `@cqrs-ddd/nestjs` at the same version. The code, the issues and the releases are in
> [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). The documentation is at
> [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/).
>
> **This package is not deprecated.** An application can keep the `@nestjs-pipeline/core` name, or
> replace it with the `@cqrs-ddd` packages. The import paths change, and the code stays
> the same. Versions 0.1 to 0.4 stay on npm unchanged.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors for **NestJS CQRS**: wrap every command, query and event handler with reusable cross-cutting behaviors in a middleware-like chain.

**Documentation:** [@cqrs-ddd/pipeline](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline/) · [@cqrs-ddd/nestjs](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/) · [from @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/core @cqrs-ddd/pipeline @cqrs-ddd/core \
  @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs
```

Requires Node.js 22.12 or later and NestJS 12.

## Exports

- Everything of `@cqrs-ddd/pipeline`: the engine, `@UsePipeline`, `@SkipPipeline`, `LoggingBehavior`, the pipeline context and its items.
- Everything of the main entry point of `@cqrs-ddd/nestjs`: `PipelineModule`, `PipelineBootstrap`, `ErrorFilter`, `toHttpException` and `httpAnswer`.

## Example

```typescript
import { ErrorFilter, LoggingBehavior, PipelineModule } from '@nestjs-pipeline/core';
import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ErrorFilter },
    {
      provide: LoggingBehavior,
      useFactory: () => new LoggingBehavior(new Logger('Pipeline')),
    },
  ],
})
export class AppModule {}
```

## Upgrade from 0.4.x

The API of 0.6.1 is the API of `@cqrs-ddd` 0.6.1. The guide
[From @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/) gives all the changes. The changes for this package:

- A behavior is a provider of the application. `PipelineModule.forRoot()` has no `behaviors`, `bootstrapLogLevel` or `loggerProvider` option, and the module has no `forRootAsync()` or `forFeature()`.
- `LOGGING_BEHAVIOR_LOGGER` and the metadata keys `PIPELINE_BEHAVIORS_METADATA`, `PIPELINE_BEHAVIORS_OPTIONS_METADATA` and `PIPELINE_SKIPPED_BEHAVIORS_METADATA` are not exported. `pipelineOf(handler)` reads the declaration of a handler.
- The 0.4.x behavior packages (`@nestjs-pipeline/audit`, `cache`, `casl`, `deadletter`, `feature-flags`, `idempotency`, `opentelemetry`, `rate-limit`, `resilience`, `zod`) require `@nestjs-pipeline/core` 0.4.x. With 0.6.1, use their `@cqrs-ddd/pipeline-<name>` packages.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
