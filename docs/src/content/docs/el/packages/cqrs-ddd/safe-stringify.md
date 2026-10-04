---
title: "@cqrs-ddd/safe-stringify"
description: "Ντετερμινιστικό JSON για ταυτότητα (κλειδιά cache, αποτυπώματα) και ασφαλές, redacting JSON για logs, χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
---

> **Από την έκδοση 0.5.0 το `@cqrs-ddd/safe-stringify` αναπτύσσεται και δημοσιεύεται από το [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs)**, με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/safe-stringify/). Αυτός ο ιστότοπος τεκμηριώνει τη σειρά 0.4.x· οι εκδόσεις 0.1 έως 0.4 παραμένουν στο npm αμετάβλητες.

Δύο serializers JSON με αντίθετους στόχους, καθώς και τα βοηθητικά εργαλεία key-segment που κατασκευάζουν κλειδιά ταυτότητας. Χωρίς runtime εξαρτήσεις και χωρίς framework.

| | Αυστηρός (Strict): `stableStringify`, `toStrictJsonValue` | Ασφαλής (Safe): `safeStringify`, `safeSanitize`, `redactValue` |
| --- | --- | --- |
| Χρήση για | ταυτότητα: κλειδιά cache, αποτυπώματα idempotency, αποθηκευμένα snapshots | εμφάνιση: logs, payloads audit και dead-letter |
| Output | ντετερμινιστικό JSON, ταξινομημένα κλειδιά αντικειμένων σε κάθε επίπεδο, σταθερό μεταξύ εκδόσεων | αναγνώσιμο JSON κατά σειρά εισαγωγής· η μορφή μπορεί να εξελιχθεί |
| Μη υποστηριζόμενη είσοδος | πετά `TypeError` | δεν πετά ποτέ σφάλμα |
| Μυστικά (Secrets) | δεν αποκρύπτει ποτέ, επειδή ένα κλειδί δεν πρέπει να αλλάζει | εξαιρεί και αποκρύπτει (redacts) κατόπιν αιτήματος |

**Χρησιμοποιήστε τον αυστηρό serializer για οτιδήποτε ταυτοποιεί δεδομένα. Μην χρησιμοποιείτε ποτέ το `safeStringify` για κλειδί ή αποτύπωμα:** το output του δεν είναι ταξινομημένο, αντικαθιστά τιμές που δεν μπορεί να αναπαραστήσει, και η μορφή του ενδέχεται να αλλάξει.

## Εγκατάσταση <a id="installation"></a>

```bash
npm install @cqrs-ddd/safe-stringify
# or
pnpm add @cqrs-ddd/safe-stringify
```

Απαιτεί Node.js 22.12 ή νεότερο.

Δημοσιεύεται ως ES module· μια εφαρμογή CommonJS το φορτώνει με `require()`. Εάν προέρχεστε από την έκδοση 0.3.x, δείτε [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

## Αυστηρός serializer (Strict serializer) <a id="strict-serializer"></a>

```typescript
import { stableStringify, toStrictJsonValue } from '@cqrs-ddd/safe-stringify';

stableStringify({ z: 1, a: { d: 2, c: new Date(0) } });
// '{"a":{"c":"1970-01-01T00:00:00.000Z","d":2},"z":1}'

toStrictJsonValue({ b: 2, a: 1 }, true); // { a: 1, b: 2 }, a null-prototype object
```

- Συμβολοσειρές (strings), booleans, `null` και πεπερασμένοι αριθμοί διατηρούνται. Τα Dates γίνονται ISO-8601 strings. Ένα αντικείμενο με `toJSON()` αντικαθίσταται από αυτό που επιστρέφει η μέθοδος.
- Οτιδήποτε άλλο πετά `TypeError`: `undefined`, συναρτήσεις, `bigint`, σύμβολα και ιδιότητες με κλειδί σύμβολο, μη πεπερασμένοι αριθμοί, μη έγκυρες ημερομηνίες, κυκλικές αναφορές, αραιοί πίνακες (sparse arrays), `Map`, `Set`, `WeakMap`, `WeakSet`, `Error`, `RegExp`, `Promise`, `ArrayBuffer` και typed arrays.
- Το `stableStringify` τυλίγει αυτή την αποτυχία σε ένα `TypeError` του οποίου το `cause` είναι το αρχικό σφάλμα.
- Δομικά ισοδύναμες τιμές παράγουν πανομοιότυπες συμβολοσειρές byte προς byte, ανεξάρτητα από τη σειρά εισαγωγής των ιδιοτήτων τους. Τα κλειδιά ταξινομούνται κατά UTF-16 code unit, όπως κάνει το `Array.prototype.sort`.

## Ασφαλής serializer (Safe serializer) <a id="safe-serializer"></a>

```typescript
import {
  DEFAULT_REDACT_KEYS,
  redactValue,
  safeStringify,
} from '@cqrs-ddd/safe-stringify';

const payload: Record<string, unknown> = { user: 'jane', password: 'secret', amount: 10n };
payload.self = payload;

safeStringify(payload);
// '{"user":"jane","password":"secret","amount":"[bigint]","self":"[Circular]"}'

safeStringify(payload, { redactKeys: DEFAULT_REDACT_KEYS });
// '{"user":"jane","password":"[REDACTED]","amount":"[bigint]","self":"[Circular]"}'

redactValue(payload); // a deep clone with DEFAULT_REDACT_KEYS masked
```

- Τα `safeStringify(value, options?, indent?)` και `safeSanitize(value, options?)` δεν πετούν ποτέ σφάλμα. Οι κυκλικές αναφορές γίνονται `"[Circular]"`, τα σφάλματα αναπτύσσονται σε `name`, `message`, `stack` και στις δικές τους απαριθμήσιμες ιδιότητες, και οι τιμές που δεν μπορούν να αναπαρασταθούν σε JSON αντικαθίστανται από ευανάγνωστο δείκτη (`"[bigint]"`, `"[Function]"`, `"[Invalid Date]"`, `"[Binary Data]"`, `"[Stream]"`). Ένα `Set<string>` στη θέση των `options` διαβάζεται ως `excludeKeys`. Το `safeStringify(undefined)` επιστρέφει τη συμβολοσειρά `'undefined'`.
- **Δεν αποκρύπτουν τίποτα εκτός αν περάσετε `redactKeys`.** Το `redactValue(value, keys?)` εφαρμόζει τα `DEFAULT_REDACT_KEYS` από προεπιλογή και διατηρεί πλούσιους τύπους (`mode: 'clone'`).
- `SanitizeOptions`:

  | Επιλογή | Αποτέλεσμα |
  | --- | --- |
  | `excludeKeys` | κλειδιά ή dot-paths που αφαιρούνται από το output· ακριβής ταύτιση με διάκριση πεζών/κεφαλαίων |
  | `redactKeys` | κλειδιά ή dot-paths που αποκρύπτονται· ταυτίζονται αγνοώντας πεζά/κεφαλαία, `_` και `-`, επομένως το `refreshToken` αποκρύπτει επίσης το `refresh_token` |
  | `redactReplacement` | η μάσκα απόκρυψης· προεπιλογή `REDACTED` (`"[REDACTED]"`) |
  | `mode` | `'json'` (προεπιλογή) μετατρέπει πλούσιους τύπους σε JSON-friendly τιμές· `'clone'` εκτελεί deep clone διατηρώντας τις κλάσεις τους |

- Εξαίρεση και απόκρυψη (redaction), με ένα κλειδί να ταιριάζει σε οποιοδήποτε βάθος ή ένα dot-path να ταιριάζει σε μία συγκεκριμένη θέση:

  ```typescript
  safeStringify(
    { user: { profile: { email: 'x' }, token: 't' } },
    { excludeKeys: ['user.profile'], redactKeys: ['token'], redactReplacement: '***' },
  );
  // '{"user":{"token":"***"}}'

  safeStringify({ when: new Date(0), tags: new Set(['a']), limits: new Map([['k', 1]]) });
  // '{"when":"1970-01-01T00:00:00.000Z","tags":["a"],"limits":{"k":1}}'
  ```

- Το `DEFAULT_REDACT_KEYS` παραθέτει κοινά ονόματα μυστικών (passwords, tokens, API keys, authorization headers, cookies, δεδομένα καρτών). Καμία λίστα δεν αναγνωρίζει κάθε μυστικό: προσθέστε τα ονόματα της δικής σας εφαρμογής.

## Τμήματα κλειδιών (Key segments) <a id="key-segments"></a>

```typescript
import {
  ABSENT_SEGMENT,
  escapeKeySegment,
  joinKeySegments,
} from '@cqrs-ddd/safe-stringify';

joinKeySegments(['cache', 'tenant:a', undefined, 'user']);
// 'cache:tenant\\:a:\\-:user'
```

- Το `joinKeySegments(segments)` διαφεύγει (escapes) κάθε τμήμα και τα ενώνει με `:`.
  Τα `undefined` και `null` γίνονται `ABSENT_SEGMENT` (`\-`), επομένως τα `['a', undefined]` και `['a', '']` παράγουν διαφορετικά κλειδιά.
- Το `escapeKeySegment(value)` διαφεύγει πρώτα το `\` και μετά το `:`. Ένα τμήμα που είναι κυριολεκτικά `\-` γράφεται ως `\\-`, ώστε να μην συγκρούεται ποτέ με ένα απόν τμήμα.

Κατασκευή κλειδιού cache από ένα tenant, ένα όνομα αιτήματος και ένα αυστηρό αποτύπωμα του payload:

```typescript
import { joinKeySegments, stableStringify } from '@cqrs-ddd/safe-stringify';
import { createHash } from 'node:crypto';

function cacheKey(tenantId: string | undefined, name: string, payload: unknown): string {
  const fingerprint = createHash('sha256').update(stableStringify(payload)).digest('hex');
  return joinKeySegments(['cache', tenantId, name, fingerprint]);
}
```

Το output του strict serializer και αυτές οι μορφές κλειδιών αποτελούν μέρος του συμβολαίου του πακέτου: η αλλαγή τους θα καθιστούσε ορφανή κάθε αποθηκευμένη εγγραφή cache, bucket ορίου ρυθμού και αποτύπωμα idempotency. Οι προδιαγραφές golden-output του πακέτου τις διατηρούν σταθερές.

## Μετάβαση από το @nestjs-pipeline/core 0.1.x <a id="migrating-from-nestjs-pipelinecore-01x"></a>

Το `@nestjs-pipeline/core` 0.1.x δεν εξήγαγε κανέναν serializer ή helper για τμήματα κλειδιών από το entry point του: τα `safeStringify` και `safeSanitize` βρίσκονταν στο εσωτερικό του module `dist/helpers/safeStringify`, και τα `stableStringify`, `toStrictJsonValue`, `redactValue`, `DEFAULT_REDACT_KEYS`, `REDACTED` καθώς και οι helpers τμημάτων κλειδιών δεν υπήρχαν. Κώδικας που εισήγαγε απευθείας από το εσωτερικό module μεταβαίνει σε αυτό το πακέτο:

```typescript
// Πριν (0.1.x, εσωτερικό μονοπάτι)
import { safeSanitize, safeStringify } from '@nestjs-pipeline/core/dist/helpers/safeStringify';

safeStringify(value, new Set(['token', 'ctx.sessionUser']), 2);

// Μετά (0.2.0)
import { safeSanitize, safeStringify } from '@cqrs-ddd/safe-stringify';

safeStringify(value, { excludeKeys: ['token', 'ctx.sessionUser'] }, 2);
```

- Το δεύτερο όρισμα `Set<string>` εξακολουθεί να γίνεται δεκτό και σημαίνει `excludeKeys`.
- Το `safeStringify(undefined)` πλέον επιστρέφει `'undefined'` αντί για `undefined`.
- Χρησιμοποιήστε το `stableStringify`, όχι το `safeStringify`, για οποιοδήποτε κλειδί ή αποτύπωμα κατασκευάζετε.

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository για λεπτομέρειες.
