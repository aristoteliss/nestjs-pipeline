# @nestjs-pipeline/deadletter

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/deadletter.svg)](https://www.npmjs.com/package/@nestjs-pipeline/deadletter)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/deadletter.svg)](https://www.npmjs.com/package/@nestjs-pipeline/deadletter)

Dead-letter capture behavior for `@nestjs-pipeline/core` — when a command, query, or event handler fails (after any retries), it forwards a record of the failed request to a **dead-letter transport** for inspection and replay.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/deadletter/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/deadletter/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/deadletter
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0` and `@nestjs-pipeline/core` `^0.4.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
