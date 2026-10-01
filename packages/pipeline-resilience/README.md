# @nestjs-pipeline/resilience

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)

Resilience and transient-fault-handling for `@nestjs-pipeline/core`, powered by [cockatiel](https://www.npmjs.com/package/cockatiel), in two parts:

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/resilience/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/resilience/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/resilience cockatiel
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0` and `@nestjs-pipeline/core` `^0.4.1`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPLv3** (see [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE)) or a **Commercial License** (see [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)). Contact: aristotelis@ik.me
