# @nestjs-pipeline/core

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline`](https://www.npmjs.com/package/@cqrs-ddd/pipeline).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/core` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/core.svg)](https://www.npmjs.com/package/@nestjs-pipeline/core)

Pipeline behaviors for **NestJS CQRS** — wrap every command, query, and event handler with reusable cross-cutting concerns using a clean middleware-like chain.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/core/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/core/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/core
```

Requires Node.js 22.12 or later.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

```bash
pnpm add @nestjs/common @nestjs/core @nestjs/cqrs reflect-metadata rxjs

# Optional: use pino as Nest logger
pnpm add nestjs-pino pino-http pino-pretty
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
