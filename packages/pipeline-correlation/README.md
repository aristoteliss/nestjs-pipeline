# @nestjs-pipeline/correlation

> ## The main repository is [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). You can use [`@cqrs-ddd/pipeline-correlation`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation) and [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs) directly.
>
> **This package has no code of its own.** From 0.6.1 it re-exports `@cqrs-ddd/pipeline-correlation` and
> `@cqrs-ddd/nestjs/correlation` at the same version. The code, the issues and the releases are in
> [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). The documentation is at
> [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/).
>
> **This package is not deprecated.** An application can keep the `@nestjs-pipeline/correlation` name, or
> replace it with the `@cqrs-ddd` packages. The import paths change, and the code stays
> the same. Versions 0.1 to 0.4 stay on npm unchanged.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/correlation.svg)](https://www.npmjs.com/package/@nestjs-pipeline/correlation)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/correlation.svg)](https://www.npmjs.com/package/@nestjs-pipeline/correlation)

Correlation ID propagation for NestJS applications: HTTP, Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs and custom transports.

**Documentation:** [@cqrs-ddd/pipeline-correlation](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-correlation/) · [@cqrs-ddd/nestjs/correlation](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/#correlation-id-middleware) · [from @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/correlation @cqrs-ddd/pipeline-correlation \
  @cqrs-ddd/pipeline @cqrs-ddd/core @nestjs/common @nestjs/core @nestjs/cqrs
```

Requires Node.js 22.12 or later and NestJS 12.

## Exports

- Everything of `@cqrs-ddd/pipeline-correlation`: `getCorrelationId`, `runWithCorrelationId`, `@WithCorrelation`, `httpCorrelation`, `correlationSource` and the `CorrelationFrom` presets.
- Everything of `@cqrs-ddd/nestjs/correlation`: `CorrelationMiddleware`.

## Example

```typescript
import { CorrelationMiddleware } from '@nestjs-pipeline/correlation';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
```

## Upgrade from 0.4.x

The API of 0.6.1 is the API of `@cqrs-ddd` 0.6.1. The guide
[From @nestjs-pipeline 0.4.x](https://aristoteliss.github.io/ddd-cqrs/guides/from-nestjs-pipeline/) gives all the changes. The changes for this package:

- `HttpCorrelationMiddleware` is `CorrelationMiddleware`. It reads the `x-correlation-id` header. For other options, make a middleware from `httpCorrelation(options)`.
- `CORRELATION_OPTIONS` is not exported.
- The package requires the peers of `@cqrs-ddd/nestjs`: `@cqrs-ddd/core`, `@cqrs-ddd/pipeline`, `@nestjs/core` and `@nestjs/cqrs`.

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
