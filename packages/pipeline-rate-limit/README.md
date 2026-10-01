# @nestjs-pipeline/rate-limit

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/rate-limit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/rate-limit)

Rate-limiting behavior for `@nestjs-pipeline/core` — consumes points from a bucket before a command, query, or event handler runs, and throws `RateLimitExceededError` (→ HTTP `429`) when the bucket is exhausted.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/rate-limit/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/rate-limit/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/rate-limit rate-limiter-flexible
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` and `@nestjs/core` `^12.1.0`, and `@nestjs-pipeline/core` `^0.4.1`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
