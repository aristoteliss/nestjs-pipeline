# @nestjs-pipeline/job-context

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-job-context`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-job-context).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-job-context/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/job-context` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)

The execution context of a request, carried into the queue jobs it enqueues: the tenant,
the correlation id and the principal. A job then makes the decisions the request would
have made. System-started work, such as a cron job, declares its context explicitly
instead. Nothing falls back to a default tenant or an anonymous principal.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/job-context/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/job-context/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/job-context @nestjs/common
```

Requires Node.js 22.12 or later and `@nestjs/common` `^12.1.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
