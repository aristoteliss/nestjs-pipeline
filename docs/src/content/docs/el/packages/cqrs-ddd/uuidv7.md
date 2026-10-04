---
title: "@cqrs-ddd/uuidv7"
description: "Παραγωγή και επαλήθευση UUID έκδοσης 7 κατά RFC 9562, χωρίς εξαρτήσεις και χωρίς framework."
editUrl: false
---

> **Από την έκδοση 0.5.0 το `@cqrs-ddd/uuidv7` αναπτύσσεται και δημοσιεύεται από το [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs)**, με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/uuidv7/). Αυτός ο ιστότοπος τεκμηριώνει τη σειρά 0.4.x· οι εκδόσεις 0.1 έως 0.4 παραμένουν στο npm αμετάβλητες.

Παράγει και επικυρώνει αναγνωριστικά UUID έκδοσης 7 όπως ορίζονται από το
[RFC 9562](https://www.rfc-editor.org/rfc/rfc9562). Δεν έχει runtime εξαρτήσεις και
κανένα framework: χρησιμοποιεί μόνο το ενσωματωμένο `crypto.randomBytes()` της Node.

Το UUIDv7 τοποθετεί ένα Unix timestamp σε χιλιοστά του δευτερολέπτου (milliseconds) στα αρχικά bits, ώστε τα αναγνωριστικά που
δημιουργούνται σε διαφορετικά χιλιοστά του δευτερολέπτου να ταξινομούνται βάσει χρόνου δημιουργίας ως απλές συμβολοσειρές. Αυτό τα καθιστά ιδανικά
για πρωτεύοντα κλειδιά (primary keys) βάσεων δεδομένων, αναγνωριστικά συμβάντων και correlation IDs.

## Εγκατάσταση <a id="installation"></a>

```bash
npm install @cqrs-ddd/uuidv7
# or
pnpm add @cqrs-ddd/uuidv7
```

Απαιτεί Node.js 22.12 ή νεότερο.

Δημοσιεύεται ως ES module· μια εφαρμογή CommonJS το φορτώνει με `require()`. Εάν προέρχεστε από την έκδοση
0.3.x, δείτε [Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

## API <a id="api"></a>

```typescript
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';

const id = uuidv7(); // e.g. '01923456-789a-7c3d-9e4f-0123456789ab'

isUuidV7(id); // true
isUuidV7(`  ${id}\n`); // true: τα κενά γύρω από την τιμή αγνοούνται
isUuidV7('00000000-0000-4000-8000-000000000000'); // false: version 4
isUuidV7(42); // false
```

| Export | Υπογραφή | Περιγραφή |
| --- | --- | --- |
| `uuidv7` | `() => string` | Ένα νέο UUIDv7 στην κανονική πεζή μορφή 8-4-4-4-12 |
| `isUuidV7` | `(value: unknown) => value is string` | `true` για μια συμβολοσειρά που αποτελεί UUIDv7 μετά την αφαίρεση κενών (trim), σε πεζά ή κεφαλαία |

## Εγγυήσεις μορφής (Format guarantees) <a id="format-guarantees"></a>

Κάθε αναγνωριστικό είναι 128 bits, γραμμένο ως 36 δεκαεξαδικοί πεζοί χαρακτήρες και ενωτικά:

| Bits | Πεδίο | Περιεχόμενο |
| --- | --- | --- |
| 0–47 | `unix_ts_ms` | `Date.now()`, η ώρα Unix σε χιλιοστά του δευτερολέπτου |
| 48–51 | `ver` | `0111` (έκδοση 7) |
| 52–63 | `rand_a` | κρυπτογραφικά τυχαίο |
| 64–65 | `var` | `10` (η παραλλαγή RFC 9562) |
| 66–127 | `rand_b` | κρυπτογραφικά τυχαίο |

- Αναγνωριστικά από διαφορετικά χιλιοστά του δευτερολέπτου ταξινομούνται βάσει χρόνου δημιουργίας όταν συγκρίνονται ως συμβολοσειρές.
- Αναγνωριστικά από το ίδιο χιλιοστό του δευτερολέπτου διαφέρουν μόνο στα τυχαία bits τους, επομένως η σειρά τους
  είναι τυχαία: αυτή η υλοποίηση δεν προσθέτει μονοτονικό απαριθμητή (monotonic counter).
- Το timestamp προέρχεται από το ρολόι του συστήματος. Εάν το ρολόι κινηθεί προς τα πίσω, μεταγενέστερα
  αναγνωριστικά ταξινομούνται πριν από προγενέστερα.
- Το `isUuidV7` ελέγχει την κειμενική μορφή, την έκδοση και την παραλλαγή (variant). Δεν ελέγχει αν
  το timestamp είναι εύλογο.

## Παραδείγματα <a id="examples"></a>

Επικύρωση ενός εισερχόμενου αναγνωριστικού πριν από τη χρήση του, και παραγωγή νέου σε αντίθετη περίπτωση:

```typescript
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';

function requestId(header: string | undefined): string {
  return isUuidV7(header) ? header.trim().toLowerCase() : uuidv7();
}
```

Το `isUuidV7` δέχεται κενά διαστήματα γύρω από την τιμή και κεφαλαίους χαρακτήρες, επομένως κανονικοποιήστε μια αποδεκτή τιμή
πριν την αποθηκεύσετε εάν συγκρίνετε αναγνωριστικά ως συμβολοσειρές.

Ανάγνωση του χρόνου δημιουργίας πίσω από τα πρώτα 48 bits:

```typescript
import { uuidv7 } from '@cqrs-ddd/uuidv7';

const id = uuidv7();
const createdAt = new Date(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16));
```

## Μετάβαση από το @nestjs-pipeline/core 0.1.x <a id="migrating-from-nestjs-pipelinecore-01x"></a>

Τα `uuidv7` και `isUuidV7` εξαγονταν από το `@nestjs-pipeline/core` 0.1.x, και το `uuidv7`
επίσης από το `@nestjs-pipeline/correlation` 0.1.x. Κανένα από τα δύο πακέτα δεν τα εξάγει στην έκδοση 0.2.0.

```typescript
// Πριν (0.1.x)
import { isUuidV7, uuidv7 } from '@nestjs-pipeline/core';
import { uuidv7 } from '@nestjs-pipeline/correlation';

// Μετά (0.2.0)
import { isUuidV7, uuidv7 } from '@cqrs-ddd/uuidv7';
```

Οι υπογραφές και η μορφή εξόδου παραμένουν αμετάβλητες. Προσθέστε το `@cqrs-ddd/uuidv7` στα δικά σας
`dependencies`: αποτελεί εξάρτηση των πακέτων pipeline, όχι re-export.

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια υπό **AGPLv3** και **Commercial License**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα του repository για λεπτομέρειες.
