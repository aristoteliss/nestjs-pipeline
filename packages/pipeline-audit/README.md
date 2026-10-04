# @nestjs-pipeline/audit

> **From 0.5.0 this package continues as [`@cqrs-ddd/pipeline-audit`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-audit).** Its code, issues and
> releases are in [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), documented at [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-audit/).
> NestJS applications add [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Versions 0.1 to 0.4 of
> `@nestjs-pipeline/audit` stay on npm unchanged, and 0.4.x receives fixes only.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)

Audit-trail behavior for `@nestjs-pipeline/core` — records **who did what, when, and with what outcome** for every command (and, when listed in `captureKinds`, every query or event handler), and forwards the record to a pluggable **audit sink**. Captured application values must satisfy that sink's serialization requirements.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/audit/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/audit/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/audit
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common reflect-metadata
```

Requires Node.js 22.12 or later, `@nestjs/common` `^12.1.0` and `@nestjs-pipeline/core` `^0.4.2`.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
