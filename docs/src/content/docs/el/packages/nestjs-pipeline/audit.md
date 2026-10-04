---
title: "@nestjs-pipeline/audit"
description: "Audit-trail behavior για το NestJS pipeline — καταγράφει ποιος έκανε τι (με έκβαση, διάρκεια και redacted payload) σε ένα pluggable sink (console από προεπιλογή, Postgres drop-in ή δικό σας AuditSink)."
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-audit`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-audit).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-audit/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/audit` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/audit.svg)](https://www.npmjs.com/package/@nestjs-pipeline/audit)

Audit-trail behavior για το `@nestjs-pipeline/core` — καταγράφει **ποιος έκανε τι, πότε και με ποια έκβαση** για κάθε command (και, όταν ορίζεται στο `captureKinds`, για κάθε query ή event handler), και προωθεί την εγγραφή σε ένα pluggable **audit sink**. Οι τιμές της εφαρμογής που καταγράφονται πρέπει να ικανοποιούν τις απαιτήσεις serialization αυτού του sink.

Ανεξάρτητο από το sink (sink-agnostic): εξαρτάται μόνο από ένα μικρό interface `AuditSink`. Ένα console sink μηδενικών εξαρτήσεων (zero-dependency) αποτελεί την προεπιλογή· το **Postgres** είναι ένα πλήρες drop-in υποκατάστατο, και το δικό σας sink (event store, Kafka, HTTP collector, …) απαιτεί αλλαγή μίας γραμμής — οι handlers δεν αλλάζουν ποτέ. Οι εγγραφές καταγράφονται **τόσο σε επιτυχία όσο και σε αποτυχία**, τα ευαίσθητα πεδία του payload υφίστανται **redaction** από προεπιλογή, και ο actor μπορεί να επιλυθεί από το pipeline context.

---

## Πίνακας Περιεχομένων <a id="table-of-contents"></a>

- [Γιατί ένα behavior (έναντι ιδιοκατασκευής)](#why-a-behavior-vs-hand-rolling)
- [Εγκατάσταση](#installation)
- [Ρύθμιση](#setup)
- [Η εγγραφή audit](#the-audit-record)
- [Sinks](#sinks)
  - [Console (προεπιλογή)](#console-default)
  - [Postgres (drop-in)](#postgres-drop-in)
  - [Προσαρμοσμένο sink](#custom-sink)
- [Συμπεριφορά](#behavior)
- [Αρχιτεκτονική και εγγυήσεις παράδοσης](#architecture-and-delivery-guarantees)
- [Ατομική καταγραφή της εγγραφής audit με την επιχειρησιακή εγγραφή](#recording-the-audit-row-atomically-with-the-business-write)
- [Ρύθμιση παραμέτρων](#configuration)
- [Redaction](#redaction)
- [Επίλυση του actor](#resolving-the-actor)
- [Tenant και correlation](#tenant-and-correlation)
- [Fail-open έναντι fail-closed](#fail-open-vs-fail-closed)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Γιατί ένα behavior (έναντι ιδιοκατασκευής) <a id="why-a-behavior-vs-hand-rolling"></a>

Ένα audit trail είναι μια κλασική οριζόντια ανησυχία (cross-cutting concern): η ίδια λογική του "κατέγραψε ποιος έκανε τι" απαιτείται σε δεκάδες handlers. Η συγγραφή της εντός των handlers συνδέει κάθε handler άμεσα με το μέσο αποθήκευσης του audit και είναι εύκολο να οδηγήσει σε λάθη (παράλειψη αποτυχιών, διαρροή κωδικών πρόσβασης, απουσία του actor). Αυτό το behavior την συγκεντρώνει:

- **Επιτυχία *και* αποτυχία** — καταγράφονται επίσης οι απορριφθείσες/αποτυχημένες προσπάθειες (το κομμάτι που παραλείπουν οι περισσότερες ιδιοκατασκευές). Με την προεπιλογή `failOpen: true`, μια αποτυχία του handler επανεκπέμπεται (re-thrown) αμετάβλητη ακόμη και αν αποτύχει το audit sink.
- **Ενσωματωμένο redaction** — τα `password`, `token`, `secret`, … καλύπτονται με μάσκα προτού αποθηκευτεί οτιδήποτε.
- **Επίλυση actor** — ανάκτηση του ενεργούντος principal από το `context.items` που έχει συμπληρωθεί από ένα προγενέστερο auth behavior.
- **Μία ενιαία διεπαφή (one seam)** — το interface `AuditSink`. Console σήμερα, Postgres ή το event store σας αύριο, χωρίς καμία αλλαγή στους handlers.

Γενικεύει το παράδειγμα [Audit-Trail](/nestjs-pipeline/guides/custom-behaviors/#example-audit-trail-behavior-with-options) από το κεντρικό README σε ένα επαναχρησιμοποιήσιμο πακέτο με επίγνωση redaction και αποτελεσμάτων (outcome-aware).

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-audit @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` `^12.1.0`.

Τα ενσωματωμένα sinks έχουν τυπικά δομικούς τύπους (structurally typed), επομένως αυτό το πακέτο δεν προσθέτει **καμία βαριά εξάρτηση**. Για το Postgres sink, προσθέστε ένα `pg` `Pool`/`Client` στην εφαρμογή σας (`pnpm add pg`)· το log sink δεν χρειάζεται τίποτα επιπλέον.

---

## Ρύθμιση <a id="setup"></a>

Στο module εφαρμογής ή παρατηρησιμότητας (observability module), δημιουργήστε ένα `AuditSink` και δηλώστε το `AuditBehavior` ως singleton provider:

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  AuditBehavior,
  LogAuditSink,
} from '@cqrs-ddd/pipeline-audit';

@Module({
  imports: [
    PipelineModule.forRoot({
      globalBehaviors: [
        { scope: 'all', before: [AuditBehavior] },
      ],
    }),
  ],
  providers: [
    {
      provide: AuditBehavior,
      useFactory: () => {
        const logger = new Logger(AuditBehavior.name);
        return new AuditBehavior(
          new LogAuditSink({ logger }),
          undefined, // Global default options
          logger,
        );
      },
    },
  ],
})
export class ObservabilityModule {}
```

Στη συνέχεια, συσχετίστε ενέργειες audit συγκεκριμένες για κάθε handler χρησιμοποιώντας το `@UsePipeline` και το `audit()`:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { audit } from '@cqrs-ddd/pipeline-audit';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  audit({ action: 'user.create', severity: 'medium' }),
)
export class CreateUserHandler {
  // ...
}
```

> **Σειρά εκτέλεσης (Ordering):** τοποθετήστε το `AuditBehavior` κοντά στην **εξωτερική πλευρά** της αλυσίδας ώστε η διάρκειά του να καλύπτει ολόκληρο τον handler, και **μετά** από οποιοδήποτε auth behavior που τροφοδοτεί το `context.items` για το factory του [`actor`](#resolving-the-actor).

---

## Η εγγραφή audit <a id="the-audit-record"></a>

Κάθε εκτέλεση που ελέγχεται παράγει ένα `AuditRecord`, το οποίο προωθείται στο sink:

```jsonc
{
  "id": "0197…",                       // UUIDv7 ανά εγγραφή
  "correlationId": "019728a3-…",
  "tenantId": "acme",                  // context.tenantId, όταν υπάρχει
  "action": "user.create",             // προεπιλογή το requestName
  "severity": "medium",                // 'low' | 'medium' | 'high' | 'critical'
  "outcome": "success",                // ή 'failure'
  "actor": { "id": "admin-1" },        // επιλύεται από το context (προαιρετικό)
  "requestKind": "command",
  "requestName": "CreateUserCommand",
  "handlerName": "CreateUserHandler",
  "payload": { "username": "jane", "password": "[REDACTED]" },
  "response": undefined,               // μόνο όταν captureResponse: true
  "error": undefined,                  // παρόν σε περίπτωση αποτυχίας
  "durationMs": 12.3,
  "timestamp": "2026-03-01T12:00:00.000Z",
  "metadata": { "tenantId": "acme" }   // έξοδος metadata factory, συν το tenantId όταν υπάρχει
}
```

---

## Sinks <a id="sinks"></a>

Ένα sink υλοποιεί το `AuditSink`: τη μέθοδο `write`, και προαιρετικά τη μέθοδο `begin`:

```typescript
interface AuditSink {
  write(record: AuditRecord): Promise<void> | void;
  begin?(record: AuditStartRecord): Promise<void> | void;
}
```

Η `begin` λαμβάνει μια εκκρεμή (pending) εγγραφή πριν εκτελεστεί ο handler· η `write` λαμβάνει την τελική εγγραφή υπό το ίδιο `id` και πρέπει να την αντικαταστήσει. Ένα ανθεκτικό (durable) sink θα πρέπει να υλοποιεί και τα δύο (δείτε [Αρχιτεκτονική και εγγυήσεις παράδοσης](#architecture-and-delivery-guarantees)).

### Console (προεπιλογή) <a id="console-default"></a>

Μηδενικών εξαρτήσεων· γράφει κάθε εγγραφή ως γραμμή JSON. Οι επιτυχίες καταγράφονται στο `log`, οι αποτυχίες στο `warn`. Χρησιμοποιείται αυτόματα όταν δεν μεταβιβάζεται κάποιο `sink`.

```typescript
import { Logger } from '@nestjs/common';
import { LogAuditSink } from '@nestjs-pipeline/audit';

AuditModule.forRoot({
  sink: new LogAuditSink({ logger: new Logger('Audit'), pretty: true }),
});
```

### Postgres (drop-in) <a id="postgres-drop-in"></a>

Υλοποιεί τις `begin` και `write`: εισάγει μια γραμμή `pending` όταν ξεκινά ένα command και ολοκληρώνει αυτή τη γραμμή (`INSERT … ON CONFLICT (id) DO UPDATE`) όταν ολοκληρώνεται. Δημιουργήστε τον πίνακα μία φορά με το `createAuditTableSql`.

```typescript
import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import {
  AuditModule,
  PostgresAuditSink,
  createAuditTableSql,
} from '@nestjs-pipeline/audit';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(createAuditTableSql()); // → table "audit_log"

@Module({
  imports: [
    AuditModule.forRoot({
      sink: new PostgresAuditSink(pool, { table: 'audit_log' }),
    }),
  ],
})
export class AppModule {}
```

Ή κατασκευάστε το από ένα pool που διαχειρίζεται το DI μέσω του `forRootAsync`:

```typescript
AuditModule.forRootAsync({
  inject: [PG_POOL],
  useFactory: (pool: Pool) => new PostgresAuditSink(pool),
});
```

> Το όνομα του πίνακα επικυρώνεται ως απλό SQL identifier (παρεμβάλλεται, δεν παραμετροποιείται)· κάθε τιμή εγγραφής μεταβιβάζεται ως **bound parameter**.
>
> Το PostgreSQL `jsonb` δεν μπορεί να περιέχει χαρακτήρα NUL ή μεμονωμένο UTF-16 surrogate, και απορρίπτει ολόκληρο το `INSERT` όταν μια τιμή περιέχει κάτι τέτοιο. Το sink αποθηκεύει κάθε τέτοιο χαρακτήρα ως U+FFFD (``), ώστε η εγγραφή να διατηρείται.
>
> Μια γραμμή που παραμένει `pending` πολύ μετά την εκκίνησή της αντιστοιχεί σε μια προσπάθεια που διακόπηκε από τερματισμό της διεργασίας· η έκβασή της είναι άγνωστη. Τα πεδία `duration_ms` και `completed_at` παραμένουν null:
>
> ```sql
> SELECT * FROM audit_log
> WHERE outcome = 'pending' AND occurred_at < now() - interval '1 hour';
> ```

### Προσαρμοσμένο sink <a id="custom-sink"></a>

Οτιδήποτε συμφωνεί με το `AuditSink` λειτουργεί κανονικά — ένα event store, το Kafka, ένας HTTP collector, ή το domain repository σας:

```typescript
import type { AuditRecord, AuditSink } from '@nestjs-pipeline/audit';

export class KafkaAuditSink implements AuditSink {
  constructor(private readonly producer: Producer) {}

  async write(record: AuditRecord): Promise<void> {
    await this.producer.send({
      topic: 'audit',
      messages: [{ key: record.correlationId, value: JSON.stringify(record) }],
    });
  }
}

AuditModule.forRoot({ sink: new KafkaAuditSink(producer) });
```

---

## Συμπεριφορά <a id="behavior"></a>

Το `AuditBehavior` χρονομετρά τον handler, κατασκευάζει ένα `AuditRecord` και το καταγράφει στο sink. Σε περίπτωση επιτυχίας επιστρέφει την απάντηση του handler μετά την εγγραφή στο sink. Σε περίπτωση αποτυχίας του handler, επιχειρεί να καταγράψει την εγγραφή αποτυχίας και στη συνέχεια επανεκπέμπει το αρχικό σφάλμα του handler εφόσον η εγγραφή στο sink πέτυχε ή το `failOpen: true` κατέστειλε την αποτυχία του sink. Εάν το sink εγείρει εξαίρεση με `failOpen: false`:
- στη διαδρομή επιτυχίας, το σφάλμα του sink διαδίδεται, αποτυγχάνοντας το αίτημα·
- στη διαδρομή αποτυχίας του handler, ο καλών λαμβάνει το σφάλμα του ίδιου του handler, αμετάβλητο, και το σφάλμα του sink καταγράφεται στα logs.
Η παραγόμενη εγγραφή αποθηκεύεται επίσης στο `context.items` υπό το `AUDIT_RECORD_ITEM` ώστε να μπορεί να αναγνωστεί από οποιοδήποτε μεταγενέστερο behavior.

Όταν το sink υλοποιεί τη μέθοδο `begin` (και το `recordStart` δεν είναι `false`), μια εκκρεμής εγγραφή έναρξης καταγράφεται **πριν** εκτελεστεί ο handler και αποθηκεύεται υπό το `AUDIT_START_RECORD_ITEM_TOKEN`· η τελική εγγραφή επαναχρησιμοποιεί το `id` της.

Ενεργοποίηση ανά handler με επιλογές:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { audit } from '@nestjs-pipeline/audit';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  audit({
    action: 'user.delete',
    severity: 'high',
    actor: (c) => ({ id: c.items.get('currentUserId') as string }),
  }),
)
export class DeleteUserHandler { /* ... */ }
```

> Η ακατέργαστη μορφή tuple `@UsePipeline([AuditBehavior, { ... }])` εξακολουθεί να υποστηρίζεται ως escape hatch.

---

## Αρχιτεκτονική και εγγυήσεις παράδοσης <a id="architecture-and-delivery-guarantees"></a>

Το `AuditBehavior` είναι ένα βήμα του pipeline γύρω από τον handler. Δεν έχει ποτέ ορατότητα στη συναλλαγή βάσης δεδομένων (database transaction) του handler: κάθε κλήση του sink είναι μια ξεχωριστή λειτουργία.

Για κάθε ελεγχόμενο αίτημα (μόνο commands, εκτός αν το `captureKinds` περιλαμβάνει περισσότερα):

1. **Έναρξη (Start)** — όταν το sink υλοποιεί τη `begin`, κατασκευάζει το εκκρεμές `AuditStartRecord` (actor, action, redacted payload, `outcome: 'pending'`) και καλεί `sink.begin(record)`. Το αποθηκεύει υπό το `AUDIT_START_RECORD_ITEM_TOKEN`.
2. **Handler** — το `next()` εκτελεί το υπόλοιπο pipeline και τον handler, ο οποίος κάνει commit τις δικές του αλλαγές.
3. **Ολοκλήρωση (Finish)** — κατασκευάζει το τελικό `AuditRecord` υπό το ίδιο `id` (`success` ή `failure`, διάρκεια, προαιρετική απάντηση, σφάλμα) και καλεί `sink.write(record)`. Το αποθηκεύει υπό το `AUDIT_RECORD_ITEM`.

Τι επιβιώνει από έναν τερματισμό της διεργασίας σε κάθε σημείο:

| Ο τερματισμός συμβαίνει | Sink με `begin` (Postgres) | Sink χωρίς `begin` (console) |
|---|---|---|
| πριν ολοκληρωθεί το βήμα 1 | καμία γραμμή, και ο handler δεν εκτελέστηκε | καμία γραμμή, και ο handler δεν εκτελέστηκε |
| κατά το βήμα 2 ή πριν ολοκληρωθεί το βήμα 3 | μια γραμμή `pending`: η απόπειρα είναι γνωστή, η έκβασή της όχι | τίποτα: η απόπειρα χάνεται |
| μετά το βήμα 3 | η τελική γραμμή | η τελική γραμμή |

Από αυτό προκύπτουν δύο συνέπειες:

- Μια γραμμή `pending` **δεν** σημαίνει ότι οι αλλαγές του handler έγιναν commit. Αντιμετωπίστε την ως "άγνωστη έκβαση" και κάντε συμφωνία (reconciliation) έναντι των επιχειρησιακών δεδομένων.
- Με `failOpen: false`, μια αποτυχημένη `begin` σταματά το αίτημα **πριν** εκτελεστεί ο handler: κανένα audit, καμία ενέργεια. Μια αποτυχημένη τελική `write` αποτυγχάνει ένα επιτυχές αίτημα, αλλά οι αλλαγές του handler έχουν ήδη γίνει commit· η γραμμή παραμένει `pending`.

Αυτές οι εγγυήσεις ισχύουν για οποιοδήποτε sink και οποιαδήποτε βάση δεδομένων, επειδή το behavior δεν χρειάζεται να ενταχθεί στη συναλλαγή του handler. Αυτό που δεν παρέχουν είναι μια γραμμή audit που γίνεται commit **μαζί** με την επιχειρησιακή αλλαγή. Αυτό απαιτεί τη συνεργασία της εφαρμογής, όπως περιγράφεται παρακάτω.

---

## Ατομική καταγραφή της εγγραφής audit με την επιχειρησιακή εγγραφή <a id="recording-the-audit-row-atomically-with-the-business-write"></a>

Ο μόνος τρόπος να εξασφαλιστεί ότι "μια επιβεβαιωμένη αλλαγή (committed change) έχει πάντα τη γραμμή audit της, και μια ακυρωμένη (rolled-back) δεν έχει καμία" είναι η εισαγωγή της γραμμής audit **στην ίδια συναλλαγή βάσης δεδομένων** με την επιχειρησιακή αλλαγή. Ένα pipeline behavior δεν μπορεί να το κάνει αυτό αυτόνομα: εκτελείται έξω από τον handler και δεν μπορεί να δει το unit of work του. Η εφαρμογή πρέπει να το πραγματοποιήσει στο επίπεδο persistence της.

**Το μοτίβο (μια συναλλαγματική εγγραφή audit):**

1. Χρησιμοποιήστε ένα sink του οποίου η `begin` δεν αποθηκεύει τίποτα και η `write` ολοκληρώνει μια γραμμή βάσει `id` (ένα upsert, όπως το `PostgresAuditSink.write`). Η `begin` πρέπει να υπάρχει ώστε η εκκρεμής εγγραφή να κατασκευαστεί και να αποθηκευτεί.
2. Στο repository του handler, μέσα στη συναλλαγή που καταγράφει την επιχειρησιακή αλλαγή, διαβάστε την εκκρεμή εγγραφή με `getPipelineItem(context, AUDIT_START_RECORD_ITEM_TOKEN)` (ή περάστε την από τον handler) και εισαγάγετέ την στον πίνακα audit.
3. Αφού επιστρέψει ο handler, η `write` του behavior ολοκληρώνει αυτή τη γραμμή με την έκβαση. Εάν η συναλλαγή έγινε rollback, η `write` εισάγει μια γραμμή `failure`· εάν η διεργασία τερματιστεί πριν από τη `write`, η γραμμή που έγινε commit παραμένει `pending`, αλλά η επιχειρησιακή της αλλαγή είναι γνωστό ότι έγινε commit.

```typescript
import {
  type AuditRecord,
  type AuditSink,
  PostgresAuditSink,
} from '@nestjs-pipeline/audit';

class TransactionalAuditSink implements AuditSink {
  constructor(private readonly completing: PostgresAuditSink) {}

  begin(): void {
    // Το repository εισάγει την pending γραμμή στη δική του συναλλαγή.
  }

  write(record: AuditRecord): Promise<void> {
    return this.completing.write(record); // upsert βάσει id
  }
}
```

Μέσα στο repository, η εκκρεμής εγγραφή διαβάζεται από το pipeline context:

```typescript
import { getPipelineItem } from '@nestjs-pipeline/core';
import { AUDIT_START_RECORD_ITEM_TOKEN } from '@nestjs-pipeline/audit';

const pending = getPipelineItem(context, AUDIT_START_RECORD_ITEM_TOKEN);
if (pending) {
  await tx.query(
    'INSERT INTO audit_log (id, correlation_id, action, severity, outcome, request_kind, request_name, handler_name, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [pending.id, pending.correlationId, pending.action, pending.severity, pending.outcome,
     pending.requestKind, pending.requestName, pending.handlerName, pending.timestamp],
  );
}
```

**Λίστα ελέγχου για ορθή εφαρμογή:**

- Ο πίνακας audit βρίσκεται στην **ίδια βάση δεδομένων** με τα επιχειρησιακά δεδομένα, και η εισαγωγή εκτελείται στην **ίδια σύνδεση και συναλλαγή** με την επιχειρησιακή εγγραφή.
- Η ολοκλήρωση είναι **idempotent βάσει `id`** (ένα upsert), οπότε μια επαναληπτική `write`, ή μια `write` χωρίς προηγουμένως αποθηκευμένη γραμμή έναρξης, είναι ασφαλής.
- Η γραμμή υπόκειται σε **redaction πριν από την αποθήκευση**: χρησιμοποιήστε την εγγραφή από το token, ποτέ το ανεπεξέργαστο αίτημα.
- Μια **εργασία συμφωνίας (reconciliation job)** διαχειρίζεται γραμμές που παραμένουν `pending` (σύγκριση με τα επιχειρησιακά δεδομένα και έπειτα σήμανσή τους).
- Εάν ένας message broker πρέπει επίσης να λάβει το audit event, δημοσιεύστε το από την αποθηκευμένη γραμμή (transactional outbox), όχι απευθείας από τη διαδρομή του αιτήματος.

**Περιορισμός με autocommit-only repositories:** ορισμένες πλευρές εγγραφής αρνούνται να εκτελεστούν μέσα σε μια εξωτερική συναλλαγή, επειδή επιβεβαιώνουν την εγγραφή (αυξάνουν μια έκδοση, ενημερώνουν μια cache) αμέσως μόλις πετύχει η εντολή τους, κάτι που θα ήταν εσφαλμένο μετά από ένα rollback το οποίο δεν μπορούν να παρατηρήσουν. Ένα τέτοιο repository δεν μπορεί να μοιραστεί μια συναλλαγή με την εισαγωγή του audit μέχρι να αποκτήσει commit hooks (όπου η επιβεβαίωση και η ενημέρωση της cache εκτελούνται μετά το commit). Μέχρι τότε, βασιστείτε στις εγγυήσεις δύο φάσεων που αναφέρθηκαν παραπάνω.

---

## Ρύθμιση παραμέτρων <a id="configuration"></a>

Οι επιλογές ανά handler (`AuditBehaviorOptions`) συγχωνεύονται επιφανειακά (shallow-merge) πάνω από τις προεπιλογές του module που έχουν δοθεί στο `AuditModule.forRoot({ defaults })`:

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
|---|---|---|---|
| `action` | `string` | `context.requestName` | Λογικό όνομα ενέργειας στην εγγραφή |
| `severity` | `'low' \| 'medium' \| 'high' \| 'critical'` | `'medium'` (`'low'` για queries) | Σημαντικότητα, για φιλτράρισμα/ειδοποιήσεις |
| `actor` | `(ctx) => AuditActor \| undefined` | — | Επίλυση του ενεργούντος principal |
| `captureRequest` | `boolean` | `true` | Καταγραφή του (redacted) payload του αιτήματος |
| `captureResponse` | `boolean` | `false` | Καταγραφή της (redacted) απάντησης του handler |
| `recordStart` | `boolean` | `true` | Εγγραφή εκκρεμούς αρχικής εγγραφής πρώτα, όταν το sink υλοποιεί τη `begin` |
| `captureKinds` | `AuditRequestKind[]` | `['command']` | Είδη αιτημάτων προς καταγραφή· δηλώστε `'query'` ή `'event'` για να καταγράφονται επίσης |
| `redactKeys` | `string[]` | — | Πρόσθετα ονόματα πεδίων προς απόκρυψη (συνδυάζονται με τα προεπιλεγμένα) |
| `redact` | `(value) => unknown` | — | Πλήρης προσαρμοσμένος redactor (αντικαθιστά το key-masking) |
| `metadata` | `(ctx) => object` | — | Πρόσθετα metadata που συγχωνεύονται στην εγγραφή |
| `includeStack` | `boolean` | `true` | Συμπερίληψη του error stack στις εγγραφές αποτυχίας |
| `failOpen` | `boolean` | `true` | Καταγραφή/παράβλεψη αποτυχιών του sink (`true`) ή διάδοση του σφάλματος του sink (`false`) |

---

## Redaction <a id="redaction"></a>

Πριν αποθηκευτεί ένα payload ή μια απάντηση, οι τιμές των ευαίσθητων κλειδιών αντικαθίστανται με `'[REDACTED]'`. Τα ενσωματωμένα `DEFAULT_REDACT_KEYS` καλύπτουν συνήθη μυστικά (`password`, `pwd`, `token`, `accessToken`, `refreshToken`, `secret`, `apiKey`, `authorization`, `cookie`, `ssn`, `creditCard`, `cardNumber`, `cvv`). Η αντιστοίχιση είναι **case-insensitive** και αναδρομική σε ένθετα αντικείμενα και πίνακες.

```typescript
// Προσθήκη ειδικών κλειδιών εφαρμογής (συγχωνεύονται με τα προεπιλεγμένα):
@UsePipeline([AuditBehavior, { redactKeys: ['pin', 'iban'] }])

// Ή ανάληψη πλήρους ελέγχου:
@UsePipeline([AuditBehavior, {
  redact: (payload) => ({ summary: summarize(payload) }),
}])
```

Μη απλές τιμές (non-plain values) κλωνοποιούνται αντί να επιστρέφονται κατ' αναφορά. Οι καταχωρίσεις `Map`, οι τιμές `Set` και οι απαριθμήσιμες ιδιότητες `Error` διατρέχονται αναδρομικά, επομένως ένα ευαίσθητο string key όπως το `token` αποκρύπτεται και εκεί. Ημερομηνίες, κανονικές εκφράσεις (RegExp), buffers, array buffers και typed views διατηρούν την τιμή τους στον κλώνο. Οι κυκλικές αναφορές αποδίδονται ως `'[Circular]'`.

Τα ενσωματωμένα JSON sinks κωδικοποιούν τιμές που το εγγενές `JSON.stringify()` θα απλοποιούσε, χρησιμοποιώντας αντικείμενα με ετικέτα όπως `{ "$type": "Map", "entries": [...] }`, `{ "$type": "Set", "values": [...] }`, και ρητές αναπαραστάσεις για `RegExp`, `Error`, binary, μη πεπερασμένους αριθμούς και κενές θέσεις πινάκων (array holes). Τα console και Postgres sinks διατηρούν επομένως τις ίδιες πληροφορίες μετά το redaction.

---

## Επίλυση του actor <a id="resolving-the-actor"></a>

Το ίδιο το behavior δεν γνωρίζει *ποιος* είναι ο καλών — επιλύστε τον από ένα αξιόπιστο session context ή pipeline context.

### Προεπιλογές έμπιστου actor σε επίπεδο module <a id="module-wide-trusted-actor-defaults"></a>

Ρυθμίστε ένα trusted actor factory μία φορά στο `AuditModule.forRoot({ defaults: { actor: ... } })` ώστε οι handlers να μην χρειάζεται να επαναλαμβάνουν την επίλυση του actor:

```typescript
AuditModule.forRoot({
  defaults: {
    actor: (ctx) => {
      const principal = getSessionPrincipal();
      if (!principal) return { authenticated: false };
      return {
        id: principal.id,
        authenticated: true,
        principalType: principal.type,
        email: principal.email,
      };
    },
  },
});
```

### Απαιτήσεις ασφαλείας για την επίλυση του actor <a id="security-requirements-for-actor-resolution"></a>

- **Μην εμπιστεύεστε ποτέ πεδία request body που παρέχονται από τον καλούντα:** Ένα actor factory πρέπει να επιλύει τον principal από έμπιστο session context, tokens, ή το `context.items` που έχει οριστεί από ένα προγενέστερο authentication behavior/interceptor. Η χρήση πεδίου του request body (όπως το `req.email`) επιτρέπει σε μη επαληθευμένες ταυτότητες να μολύνουν το audit trail.
- **Ρητή κατάσταση μη ταυτοποιημένου (unauthenticated):** Όταν δεν υπάρχει principal εντός εμβέλειας, επιστρέψτε `{ authenticated: false }` (ή παραλείψτε το `id`) αντί να κατασκευάζετε μια `'anonymous'` ταυτότητα που θα μπορούσε να εκληφθεί εσφαλμένα ως ταυτοποιημένος principal.
- **Παράκαμψη ανά handler:** Μεμονωμένοι handlers μπορούν να παρακάμψουν το actor factory εάν μια συγκεκριμένη λειτουργία έχει διαφορετική σημασιολογία principal.

---

## Tenant και correlation <a id="tenant-and-correlation"></a>

Κάθε εγγραφή φέρει το `correlationId` και, όταν το pipeline διαθέτει ένα, το `tenantId`, αμφότερα αναγνωσμένα από το pipeline context. Το pipeline τα λαμβάνει από τις πηγές (sources) που έχουν διαμορφωθεί στο `PipelineModule.forRoot()`:

```typescript
import { Module } from '@nestjs/common';
import { PipelineModule } from '@nestjs-pipeline/core';
import { correlationSource } from '@nestjs-pipeline/correlation';
import { tenantSource } from '@nestjs-pipeline/tenant';
import { AuditBehavior, AuditModule } from '@nestjs-pipeline/audit';

@Module({
  imports: [
    AuditModule.forRoot(),
    PipelineModule.forRoot({
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      globalBehaviors: { scope: 'all', before: [AuditBehavior] },
    }),
  ],
})
export class AppModule {}
```

Το πακέτο audit δεν εισάγει ούτε το `@nestjs-pipeline/tenant` ούτε το `@nestjs-pipeline/correlation`. Το tenant συγχωνεύεται επίσης στο `metadata` ως `tenantId`· το `PostgresAuditSink` δεν διαθέτει στήλη tenant και το αποθηκεύει εκεί (`metadata->>'tenantId'`).

---

## Fail-open έναντι fail-closed <a id="fail-open-vs-fail-closed"></a>

Όταν το **ίδιο το sink** εγείρει σφάλμα (π.χ. η βάση δεδομένων του audit είναι εκτός λειτουργίας):

- **`failOpen: true`** (προεπιλογή) — η αποτυχία καταγράφεται ως προειδοποίηση και αγνοείται. Ένας επιτυχής handler εξακολουθεί να επιστρέφει την απάντησή του, και εάν ο handler είχε αποτύχει, το αρχικό του σφάλμα παραμένει το σφάλμα που βλέπει ο καλών. Ευνοεί τη διαθεσιμότητα (availability).
- **`failOpen: false`** — επιβάλλει αυστηρά την ανθεκτική αποθήκευση του audit:
  - Εάν ο handler πέτυχε, το σφάλμα του sink διαδίδεται, απορρίπτοντας το αίτημα επειδή το απαιτούμενο audit trail δεν μπόρεσε να καταγραφεί.
  - Εάν ο handler είχε ήδη αποτύχει, το `AuditBehavior` επανεκπέμπει το σφάλμα του ίδιου του handler, αμετάβλητο, και καταγράφει το σφάλμα του sink. Το αντικείμενο σφάλματος δεν τροποποιείται ποτέ.

Τόσο η κατασκευή της εγγραφής όσο και οι αποτυχίες του sink ακολουθούν το `failOpen`. Κατά τη διαχείριση ενός αιτήματος που έχει ήδη αποτύχει, το αρχικό σφάλμα του αιτήματος διατηρείται.

Η αρχική εγγραφή (start record) ακολουθεί τον ίδιο κανόνα, ένα βήμα νωρίτερα: όταν η κατασκευή της ή η μέθοδος `sink.begin` αποτυγχάνει, το `failOpen: true` καταγράφει την αποτυχία και εκτελεί τον handler, ενώ το `failOpen: false` απορρίπτει το αίτημα **πριν εκτελεστεί ο handler**.

Η διαγνωστική καταγραφή μιας αποτυχίας audit είναι η ίδια fail-open: ένας logger που αποτυγχάνει δεν αντικαθιστά ποτέ το αποτέλεσμα ή το σφάλμα του handler.

Οι παράμετροι `actor`, `metadata` και `redact` πρέπει να είναι συναρτήσεις. Μια μη συναρτησιακή τιμή αποτυγχάνει κατά το application bootstrap με `PipelineConfigurationError`. Οι προεπιλογές module ενός request-scoped `AuditBehavior` δεν έχουν στιγμιότυπο κατά το bootstrap· μια μη έγκυρη προεπιλογή εκεί απορρίπτεται πριν εκτελεστεί ο handler (καταγράφεται και αγνοείται με `failOpen: true`).

---

## Αναφορά API <a id="api-reference"></a>

| Export | Είδος | Περιγραφή |
|---|---|---|
| `AuditBehavior` | class | Το pipeline behavior |
| `audit` | fn | Type-safe intent builder που επιστρέφει `[AuditBehavior, options]` |
| `AuditIntentOptions` | type | Επιλογές για το `audit(...)` |
| `AuditModule` | class | Δήλωση `forRoot` / `forRootAsync` |
| `AUDIT_RECORD_ITEM` | symbol | Μοναδικό κλειδί Symbol εξαγόμενο στο `context.items` που κρατά την παραγόμενη εγγραφή |
| `AUDIT_RECORD_ITEM_TOKEN` | `PipelineItemToken<AuditRecord>` | Typed token πάνω στο ίδιο κλειδί, για το `getPipelineItem` |
| `AUDIT_START_RECORD_ITEM_TOKEN` | `PipelineItemToken<AuditStartRecord>` | Η εκκρεμής αρχική εγγραφή, που ορίζεται πριν την εκτέλεση του handler |
| `AUDIT_SINK` / `AUDIT_DEFAULT_OPTIONS` | token | DI tokens |
| `AUDIT_SEVERITY` / `AUDIT_OUTCOMES` / `AUDIT_REQUEST_KINDS` | const | Ονομαστικές τιμές για severities, outcomes (συμπεριλαμβανομένου του `pending`) και είδη αιτημάτων |
| `LogAuditSink` | class | Προεπιλεγμένο sink μηδενικών εξαρτήσεων |
| `PostgresAuditSink` | class | Postgres drop-in sink |
| `createAuditTableSql` | fn | `CREATE TABLE` DDL για το Postgres sink |
| `buildAuditRecord` / `buildAuditStartRecord` | fn | Pure builders της τελικής και της εκκρεμούς εγγραφής (χρησιμοποιούνται από το behavior) |
| `redactValue` / `DEFAULT_REDACT_KEYS` / `REDACTED` | fn/const | Βοηθητικά εργαλεία redaction |
| `AuditSink`, `AuditRecord`, `AuditStartRecord`, `AuditBehaviorOptions`, `AuditModuleOptions`, `AuditModuleAsyncOptions`, `LogAuditSinkOptions`, `PostgresAuditSinkOptions`, `PostgresQueryableLike`, `BuildAuditRecordInput`, … | type | Δημόσιοι τύποι |

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPL-3.0-or-later** ή **Εμπορική Άδεια (Commercial License)**. Δείτε τα αρχεία
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
στη ρίζα του repository.
