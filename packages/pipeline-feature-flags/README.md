# @nestjs-pipeline/feature-flags

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/feature-flags.svg)](https://www.npmjs.com/package/@nestjs-pipeline/feature-flags)

Feature-flag **gating** behavior for `@nestjs-pipeline/core` — wrap any command, query, or event handler behind a boolean flag and short-circuit (or fall back) when it's off.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/feature-flags/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/feature-flags/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/feature-flags @openfeature/server-sdk
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` and `@nestjs/core` `^12.1.0`,
`@nestjs-pipeline/core` `^0.4.2` and `@openfeature/server-sdk` `^1.13.0`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

```bash
pnpm add @openfeature/unleash-provider
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
