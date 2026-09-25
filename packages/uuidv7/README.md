# @cqrs-ddd/uuidv7

Generates and validates UUID version 7 identifiers as defined by
[RFC 9562](https://www.rfc-editor.org/rfc/rfc9562). It has no runtime dependencies and
no framework: it uses Node's built-in `crypto.randomBytes()` only.

UUIDv7 puts a millisecond Unix timestamp in the leading bits, so identifiers created in
different milliseconds sort by creation time as plain strings. That makes them a good
fit for database primary keys, event identifiers and correlation IDs.

## Installation

```bash
npm install @cqrs-ddd/uuidv7
# or
pnpm add @cqrs-ddd/uuidv7
```

Requires Node.js 22 or later.

## API

```typescript
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';

const id = uuidv7(); // e.g. '01923456-789a-7c3d-9e4f-0123456789ab'

isUuidV7(id); // true
isUuidV7(`  ${id}\n`); // true: surrounding whitespace is ignored
isUuidV7('00000000-0000-4000-8000-000000000000'); // false: version 4
isUuidV7(42); // false
```

| Export | Signature | Description |
| --- | --- | --- |
| `uuidv7` | `() => string` | A new UUIDv7 in the canonical lowercase 8-4-4-4-12 form |
| `isUuidV7` | `(value: unknown) => value is string` | `true` for a string that is a UUIDv7 once trimmed, in either case |

## Format guarantees

Each identifier is 128 bits, written as 36 lowercase hexadecimal characters and hyphens:

| Bits | Field | Content |
| --- | --- | --- |
| 0–47 | `unix_ts_ms` | `Date.now()`, the Unix time in milliseconds |
| 48–51 | `ver` | `0111` (version 7) |
| 52–63 | `rand_a` | cryptographically random |
| 64–65 | `var` | `10` (the RFC 9562 variant) |
| 66–127 | `rand_b` | cryptographically random |

- Identifiers from different milliseconds sort by creation time when compared as strings.
- Identifiers from the same millisecond differ only in their random bits, so their order
  is random: this implementation does not add a monotonic counter.
- The timestamp comes from the system clock. If the clock moves backwards, later
  identifiers sort before earlier ones.
- `isUuidV7` checks the textual form, the version and the variant. It does not check that
  the timestamp is plausible.

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
for details.
