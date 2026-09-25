# @cqrs-ddd/safe-stringify

Two JSON serializers with opposite goals, and the key-segment helpers that build
identity keys. No runtime dependencies and no framework.

| | Strict: `stableStringify`, `toStrictJsonValue` | Safe: `safeStringify`, `safeSanitize`, `redactValue` |
| --- | --- | --- |
| Use for | identity: cache keys, idempotency fingerprints, stored snapshots | display: logs, audit and dead-letter payloads |
| Output | deterministic JSON, object keys sorted at every level, stable across releases | readable JSON in insertion order; the format may evolve |
| Unsupported input | throws a `TypeError` | never throws |
| Secrets | never redacts, because a key must not change | excludes and redacts on request |

**Use the strict serializer for anything that identifies data. Never use `safeStringify`
for a key or a fingerprint:** its output is not sorted, it replaces values it cannot
represent, and its format may change.

## Installation

```bash
npm install @cqrs-ddd/safe-stringify
# or
pnpm add @cqrs-ddd/safe-stringify
```

Requires Node.js 22 or later.

## Strict serializer

```typescript
import { stableStringify, toStrictJsonValue } from '@cqrs-ddd/safe-stringify';

stableStringify({ z: 1, a: { d: 2, c: new Date(0) } });
// '{"a":{"c":"1970-01-01T00:00:00.000Z","d":2},"z":1}'

toStrictJsonValue({ b: 2, a: 1 }, true); // { a: 1, b: 2 }, a null-prototype object
```

- Strings, booleans, `null` and finite numbers are kept. Dates become ISO-8601 strings.
  An object with `toJSON()` is replaced by what that method returns.
- Everything else throws a `TypeError`: `undefined`, functions, `bigint`, symbols and
  symbol-keyed properties, non-finite numbers, invalid dates, cycles, sparse arrays,
  `Map`, `Set`, `WeakMap`, `WeakSet`, `Error`, `RegExp`, `Promise`, `ArrayBuffer` and
  typed arrays.
- `stableStringify` wraps that failure in a `TypeError` whose `cause` is the original.
- Structurally equal values produce byte-identical strings, whatever their property
  insertion order. Keys sort by UTF-16 code unit, as `Array.prototype.sort` does.

## Safe serializer

```typescript
import {
  DEFAULT_REDACT_KEYS,
  redactValue,
  safeStringify,
} from '@cqrs-ddd/safe-stringify';

const payload = { user: 'jane', password: 'secret', amount: 10n };
payload.self = payload;

safeStringify(payload);
// '{"user":"jane","password":"secret","amount":"[bigint]","self":"[Circular]"}'

safeStringify(payload, { redactKeys: DEFAULT_REDACT_KEYS });
// '{"user":"jane","password":"[REDACTED]","amount":"[bigint]","self":"[Circular]"}'

redactValue(payload); // a deep clone with DEFAULT_REDACT_KEYS masked
```

- `safeStringify(value, options?, indent?)` and `safeSanitize(value, options?)` never
  throw. Cycles become `"[Circular]"`, errors are expanded, and values JSON cannot hold
  are replaced by a readable marker.
- **They redact nothing unless you pass `redactKeys`.** `redactValue(value, keys?)`
  applies `DEFAULT_REDACT_KEYS` by default and keeps rich types (`mode: 'clone'`).
- `SanitizeOptions`:

  | Option | Effect |
  | --- | --- |
  | `excludeKeys` | keys or dot-paths removed from the output; exact, case-sensitive match |
  | `redactKeys` | keys or dot-paths masked; matched ignoring case, `_` and `-`, so `refreshToken` also masks `refresh_token` |
  | `redactReplacement` | the mask; default `REDACTED` (`"[REDACTED]"`) |
  | `mode` | `'json'` (default) turns rich types into JSON-friendly values; `'clone'` deep-clones them keeping their classes |

- `DEFAULT_REDACT_KEYS` lists common secret names (passwords, tokens, API keys,
  authorization headers, cookies, card data). No list recognizes every secret: add your
  application's own names.

## Key segments

```typescript
import {
  ABSENT_SEGMENT,
  escapeKeySegment,
  joinKeySegments,
} from '@cqrs-ddd/safe-stringify';

joinKeySegments(['cache', 'tenant:a', undefined, 'user']);
// 'cache:tenant\\:a:\\-:user'
```

- `joinKeySegments(segments)` escapes each segment and joins them with `:`.
  `undefined` and `null` become `ABSENT_SEGMENT` (`\-`), so `['a', undefined]` and
  `['a', '']` produce different keys.
- `escapeKeySegment(value)` escapes `\` first, then `:`. A segment that is literally
  `\-` is written `\\-`, so it never collides with an absent segment.

The strict serializer's output and these key formats are part of the package contract:
changing them would orphan every stored cache entry, rate-limit bucket and idempotency
fingerprint. The package's golden-output specs pin them.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
for details.
