# @nestjs-pipeline/opentelemetry

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-opentelemetry`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-opentelemetry).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-opentelemetry/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/opentelemetry` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/opentelemetry.svg)](https://www.npmjs.com/package/@nestjs-pipeline/opentelemetry)

OpenTelemetry **tracing & metrics** behaviors for `@nestjs-pipeline/core` — auto-create spans **and** record duration/throughput/error metrics for every command, query, and event pipeline invocation, with rich attributes and error recording.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/opentelemetry/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/opentelemetry/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/opentelemetry @opentelemetry/api
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0`, `@nestjs-pipeline/core` `^0.4.2`
and `@opentelemetry/api` `^1.9.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

```bash
pnpm add @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.
