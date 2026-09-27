# @cqrs-ddd/untyped

A typed replacement for `as any` when code must read a property the type does not
declare, such as framework metadata on a wrapper object. `untyped(value)` returns the
same value typed as `T & Record<string | symbol, unknown>`: declared properties keep
their types, and every other property reads as `unknown`, so the caller must narrow it.
It satisfies Biome's `noExplicitAny` without suppressing the rule.

## Installation

```bash
npm install @cqrs-ddd/untyped
# or
pnpm add @cqrs-ddd/untyped
```

Requires Node.js 22 or later. No dependencies, no framework.

## API

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const scope = untyped(wrapper).scope; // unknown: narrow it before use
if (typeof scope === 'number') {
  // ...
}
```

| Export | Signature | Description |
| --- | --- | --- |
| `untyped` | `<T>(value: T) => T & Record<string \| symbol, unknown>` | The same value, with undeclared properties typed `unknown` |

It changes only the type; the value is returned as is.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
for details.
