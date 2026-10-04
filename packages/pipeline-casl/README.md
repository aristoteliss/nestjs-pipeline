# @nestjs-pipeline/casl

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-casl`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-casl).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-casl/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/casl` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/casl.svg)](https://www.npmjs.com/package/@nestjs-pipeline/casl)

CASL authorization for `@nestjs-pipeline/core`, in two stages:

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/casl/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/casl/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/casl @nestjs-pipeline/core @casl/ability @nestjs/common @nestjs/core reflect-metadata
```

Peers: `@casl/ability` `^7.0.0`, `@nestjs/common` `^12.1.0`, `@nestjs/core` `^12.1.0`,
`@nestjs-pipeline/core` `^0.4.2`, `reflect-metadata`. Node.js 22.12 or later.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

See [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt).
