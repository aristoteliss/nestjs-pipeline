# @nestjs-pipeline/correlation

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-correlation`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-correlation).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-correlation/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/correlation` stay on npm unchanged, and 0.4.x receives fixes only.

Standalone correlation ID propagation for NestJS applications. Works with HTTP,
Bull/BullMQ, RabbitMQ, Kafka, NATS, gRPC, cron jobs, and any custom transport.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/correlation/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/correlation/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/correlation @nestjs/common
```

Requires Node.js 22.12 or later and `@nestjs/common` `^12.1.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
