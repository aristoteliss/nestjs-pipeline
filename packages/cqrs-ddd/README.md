# @nestjs-pipeline/cqrs-ddd

> ## The main repository is [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). You can use [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs) directly.
>
> **This package has no code of its own.** It re-exports `@cqrs-ddd/nestjs` at the same
> version, 0.6.1. The code, the issues and the releases are in
> [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs). The documentation is at
> [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/).
>
> **This package is not deprecated.** An application can keep the `@nestjs-pipeline/cqrs-ddd`
> name, or replace it with `@cqrs-ddd/nestjs`. The import paths change, and the code stays
> the same.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/cqrs-ddd.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cqrs-ddd)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/cqrs-ddd.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cqrs-ddd)

The NestJS adapter of the `@cqrs-ddd` packages under its `@nestjs-pipeline` name. Every
entry point (`.`, `./correlation`, `./job-context`) re-exports the same entry point of
[`@cqrs-ddd/nestjs`](https://aristoteliss.github.io/ddd-cqrs/packages/nestjs/), which it
depends on. Read the guide of that package for what it does.

## Installation

```bash
pnpm add @nestjs-pipeline/cqrs-ddd @cqrs-ddd/pipeline @cqrs-ddd/core \
  @nestjs/common @nestjs/core @nestjs/cqrs
```

Requires Node.js 22.12 or later and NestJS 12. The behavior packages
(`@cqrs-ddd/pipeline-zod`, `-casl`, `-feature-flags`, `-rate-limit`, `-idempotency`,
`-correlation`, `-job-context`) are optional peers.

## Other `@nestjs-pipeline` names at 0.6.1

| Package | Re-exports |
| --- | --- |
| `@nestjs-pipeline/core` | `@cqrs-ddd/pipeline` and `@cqrs-ddd/nestjs` |
| `@nestjs-pipeline/correlation` | `@cqrs-ddd/pipeline-correlation` and `@cqrs-ddd/nestjs/correlation` |
| `@nestjs-pipeline/job-context` | `@cqrs-ddd/pipeline-job-context` and `@cqrs-ddd/nestjs/job-context` |

## Upgrade from 0.5.0

0.6.1 requires the `@cqrs-ddd` 0.6 packages: `@cqrs-ddd/core` and `@cqrs-ddd/pipeline`
`^0.6.1`, and the same range for each optional peer that the application installs. The
changes of `@cqrs-ddd` from 0.5 to 0.6 are in its
[CHANGELOG](https://github.com/aristoteliss/ddd-cqrs/blob/master/CHANGELOG.md).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
