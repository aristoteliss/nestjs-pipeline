---
title: "@cqrs-ddd/untyped"
description: "Μια typed αντικατάσταση για το `as any`: διαβάζει μη δηλωμένες ιδιότητες ως unknown. Χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
---

> **Από την έκδοση 0.5.0 το `@cqrs-ddd/untyped` αναπτύσσεται και δημοσιεύεται από το [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs)**, με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/untyped/). Αυτός ο ιστότοπος τεκμηριώνει τη σειρά 0.4.x· οι εκδόσεις 0.1 έως 0.4 παραμένουν στο npm αμετάβλητες.

Μια typed αντικατάσταση για το `as any` όταν ο κώδικας πρέπει να διαβάσει μια ιδιότητα που δεν δηλώνει ο τύπος, όπως metadata του framework σε ένα wrapper object. Το `untyped(value)` επιστρέφει την ίδια τιμή πληκτρολογημένη (typed) ως `T & Record<string | symbol, unknown>`: οι δηλωμένες ιδιότητες διατηρούν τους τύπους τους, και κάθε άλλη ιδιότητα διαβάζεται ως `unknown`, επομένως ο καλών πρέπει να περιορίσει τον τύπο της (narrowing). Ικανοποιεί τον κανόνα `noExplicitAny` του Biome χωρίς καταστολή του κανόνα.

## Εγκατάσταση <a id="installation"></a>

```bash
npm install @cqrs-ddd/untyped
# or
pnpm add @cqrs-ddd/untyped
```

Απαιτεί Node.js 22.12 ή νεότερο. Χωρίς εξαρτήσεις, χωρίς framework.

Δημοσιεύεται ως ES module· μια εφαρμογή CommonJS το φορτώνει με `require()`. Εάν προέρχεστε από την έκδοση 0.3.x, δείτε [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

## API <a id="api"></a>

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const scope = untyped(wrapper).scope; // unknown: περιορίστε τον τύπο πριν από τη χρήση
if (typeof scope === 'number') {
  // ...
}
```

| Export | Υπογραφή | Περιγραφή |
| --- | --- | --- |
| `untyped` | `<T>(value: T) => T & Record<string \| symbol, unknown>` | Η ίδια τιμή, με τις μη δηλωμένες ιδιότητες να έχουν τύπο `unknown` |

Αλλάζει μόνο τον τύπο· η τιμή επιστρέφεται ως έχει.

## Παραδείγματα <a id="examples"></a>

Ανάγνωση ιδιότητας με κλειδί σύμβολο (symbol-keyed property) που θέτει μια βιβλιοθήκη σε ένα αντικείμενο που σας παραδίδει:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const TRACE = Symbol.for('app.trace');

function traceOf(request: object): string | undefined {
  const trace = untyped(request)[TRACE];
  return typeof trace === 'string' ? trace : undefined;
}
```

Οι δηλωμένες ιδιότητες διατηρούν τους τύπους τους, επομένως μόνο η μη δηλωμένη ανάγνωση χρειάζεται type narrowing:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

interface Command {
  readonly id: string;
}

function describe(command: Command): string {
  const view = untyped(command);
  const source = view.source; // unknown
  return typeof source === 'string' ? `${view.id} from ${source}` : view.id; // view.id is string
}
```

## Μετάβαση από το @nestjs-pipeline/core 0.1.x <a id="migrating-from-nestjs-pipelinecore-01x"></a>

Το `untyped` εξαγόταν από το `@nestjs-pipeline/core` 0.1.x και δεν εξάγεται πλέον εκεί στην έκδοση 0.2.0.

```typescript
// Πριν (0.1.x)
import { untyped } from '@nestjs-pipeline/core';

// Μετά (0.2.0)
import { untyped } from '@cqrs-ddd/untyped';
```

Η υπογραφή παραμένει αμετάβλητη. Προσθέστε το `@cqrs-ddd/untyped` στα δικά σας `dependencies`.

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository για λεπτομέρειες.
