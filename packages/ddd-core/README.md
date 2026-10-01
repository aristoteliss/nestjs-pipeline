# @cqrs-ddd/core

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/core.svg)](https://www.npmjs.com/package/@cqrs-ddd/core)

Framework-neutral building blocks for domain-driven design in TypeScript: aggregates with
versioned mutations, detached domain events, a command handler that publishes those
events, repository contracts, persistence lifecycle decorators, a revision-fenced
repository cache, tenant-scoped cache keys and HTTP status mapping for its errors.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/core/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/cqrs-ddd/core/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @cqrs-ddd/core
# or
npm install @cqrs-ddd/core
```

Requires Node.js 22.12 or later. It installs `@cqrs-ddd/uuidv7` and
`@cqrs-ddd/safe-stringify`, which have no dependencies. To persist with MikroORM, add
`@cqrs-ddd/mikro-orm` and `@mikro-orm/core` 7.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
