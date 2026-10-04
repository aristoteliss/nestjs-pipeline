# @cqrs-ddd/mikro-orm

> **From 0.5.0 `@cqrs-ddd/mikro-orm` is developed and published from [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs)**, documented at
> [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/mikro-orm/). This folder keeps its 0.4.x source; versions 0.1 to
> 0.4 stay on npm unchanged.

[![npm version](https://img.shields.io/npm/v/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)
[![License](https://img.shields.io/npm/l/@cqrs-ddd/mikro-orm.svg)](https://www.npmjs.com/package/@cqrs-ddd/mikro-orm)

MikroORM 7 adapters for [`@cqrs-ddd/core`](https://www.npmjs.com/package/@cqrs-ddd/core):
authoritative aggregate loading, version-conditioned writes, the persistence dialect
that maps unique violations and transient failures, a revision-fenced cache stored in
the database, and the `EntitySchema` mapping of `RootEntity`.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/mikro-orm/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/cqrs-ddd/mikro-orm/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @cqrs-ddd/mikro-orm @cqrs-ddd/core @mikro-orm/core
```

Requires Node.js 22.17 or later, as MikroORM 7 does. `@cqrs-ddd/core` `^0.4.2` and `@mikro-orm/core` `^7.2.1` are peer
dependencies; add the MikroORM driver you use, such as `@mikro-orm/postgresql`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
