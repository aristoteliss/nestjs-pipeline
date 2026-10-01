# @nestjs-pipeline/cache

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/cache.svg)](https://www.npmjs.com/package/@nestjs-pipeline/cache)

Caching behavior for `@nestjs-pipeline/core`, powered by [cache-manager](https://www.npmjs.com/package/cache-manager) v7 on top of [Keyv](https://keyv.org/). Transparently cache query results — declaratively, with zero changes to your handler code — and choose any backend: **memory** (default), **redis**, **memcache**, **sqlite**, or **postgres**.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/cache/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/cache/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/cache cache-manager keyv
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0`, `@nestjs-pipeline/core` `^0.4.0`,
`cache-manager` `^7.0.0` and `keyv` `^5.0.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

**Optional store adapters** — install only the one(s) you use:

```bash
pnpm add @keyv/redis      # type: 'redis'
pnpm add @keyv/memcache   # type: 'memcache'
pnpm add @keyv/sqlite     # type: 'sqlite'
pnpm add @keyv/postgres   # type: 'postgres'
```

## License

Distributed under a dual license: **AGPLv3** (open source) or a **Commercial
License**. See [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt), or contact
aristotelis@ik.me.
