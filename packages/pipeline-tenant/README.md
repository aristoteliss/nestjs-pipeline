# @nestjs-pipeline/tenant

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/tenant.svg)](https://www.npmjs.com/package/@nestjs-pipeline/tenant)

The current tenant of an execution: `currentTenantId()` returns the tenant of the
innermost `runWithTenant` scope, so code deep inside a handler can read the tenant without
it being passed at every call site. It has no dependencies; `tenantSource` connects it to
[`@nestjs-pipeline/core`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline#readme)
pipelines and to `@nestjs-pipeline/job-context`.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/tenant/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/tenant/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/tenant
```

Requires Node.js 22.12 or later. To give pipelines the tenant, pass `tenantSource` to
`PipelineModule.forRoot`:

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
