# @nestjs-pipeline/idempotency

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-idempotency`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-idempotency).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-idempotency/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/idempotency` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/idempotency.svg)](https://www.npmjs.com/package/@nestjs-pipeline/idempotency)

Idempotency behavior for `@nestjs-pipeline/core` — atomically deduplicates concurrent requests sharing an idempotency key and **replays the stored response** after a successful execution. With the default `releaseOnError: true`, failed executions release the key so a later retry may execute the handler again.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/idempotency/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/idempotency/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/idempotency
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` and `@nestjs/core` `^12.1.0`, and `@nestjs-pipeline/core` `^0.4.2`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**.
See [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt).
