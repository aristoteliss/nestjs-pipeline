# @cqrs-ddd/untyped

A typed replacement for `as any` when code must read a property the type does not
declare, such as framework metadata on a wrapper object. `untyped(value)` returns the
same value typed as `T & Record<string | symbol, unknown>`: declared properties keep
their types, and every other property reads as `unknown`, so the caller must narrow it.
It satisfies Biome's `noExplicitAny` without suppressing the rule.

**Documentation:** [guide](https://aristoteliss.github.io/nestjs-pipeline/packages/cqrs-ddd/untyped/) · [API reference](https://aristoteliss.github.io/nestjs-pipeline/api/cqrs-ddd/untyped/) · [all packages](https://aristoteliss.github.io/nestjs-pipeline/)

## Installation

```bash
npm install @cqrs-ddd/untyped
# or
pnpm add @cqrs-ddd/untyped
```

Requires Node.js 22.12 or later. No dependencies, no framework.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from 0.3.x, see [Upgrading from 0.3.x](https://aristoteliss.github.io/nestjs-pipeline/upgrading/from-0-3/).

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
for details.
