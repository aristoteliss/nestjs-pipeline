# @nestjs-pipeline/zod

Zod v4 validation and parsing integration for `@nestjs-pipeline/core` — parse commands, queries, and events at the pipeline boundary, validate controller params and bodies through Nest's `StandardSchemaValidationPipe` with the same 400 body (`zodBadRequest`), and catch validation errors with `ZodValidationFilter`.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/nestjs-pipeline/zod/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/nestjs-pipeline/zod/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
pnpm add @nestjs-pipeline/zod zod
```

Requires Zod `^4.3.0`, NestJS `^12.1.0`, `@nestjs-pipeline/core` `^0.4.0` and Node.js 22.12
or later.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
