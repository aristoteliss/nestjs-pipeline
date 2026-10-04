---
title: "@nestjs-pipeline/job-context"
description: "Μεταφέρει το tenant, correlation id και principal ενός αιτήματος στα queue jobs που τοποθετεί στην ουρά, και παρέχει ρητό context σε εργασίες που εκκινούνται από το σύστημα"
editUrl: false
---

> **Από την έκδοση 0.5.0 αυτό το πακέτο συνεχίζει ως [`@cqrs-ddd/pipeline-job-context`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-job-context).** Ο κώδικας, τα issues και
> τα releases βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-job-context/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/job-context` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις (fixes).

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)

Το context εκτέλεσης ενός αιτήματος μεταφέρεται στα queue jobs που αυτό τοποθετεί στην ουρά: το tenant,
το correlation id και ο principal. Ένα job λαμβάνει τότε τις αποφάσεις που θα λάμβανε το
ίδιο το αίτημα. Εργασίες που εκκινούνται από το σύστημα, όπως ένα cron job, δηλώνουν ρητά
το context τους. Τίποτα δεν καταφεύγει σιωπηρά σε προεπιλεγμένο tenant ή ανώνυμο principal.

Δεν εξαρτάται από κανένα άλλο πακέτο pipeline. Διαβάζει και αποκαθιστά το tenant και το
correlation id μέσω των sources που του παρέχονται, συνήθως το `tenantSource` του
[`@nestjs-pipeline/tenant`](/nestjs-pipeline/packages/nestjs-pipeline/tenant/)
και το `correlationSource` του
[`@nestjs-pipeline/correlation`](/nestjs-pipeline/packages/nestjs-pipeline/correlation/),
ώστε τα pipelines που αποστέλλει ένα job να λαμβάνουν το ίδιο tenant και correlation id.

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-job-context @cqrs-ddd/nestjs @nestjs/common
```

Απαιτεί Node.js 22.12 ή νεότερο και `@nestjs/common` `^12.1.0`.

## Ρύθμιση <a id="setup"></a>

Υλοποιήστε το `IJobPrincipal` πάνω στην κατάσταση ταυτοποίησης της εφαρμογής, και δηλώστε το `JobContextModule.forRoot` (από το `@cqrs-ddd/nestjs`):

Τα `Capability`, `SessionRepository`, `SessionsModule`, `currentPrincipal`,
`runAsPrincipal` και `SessionRevokedError` αντιπροσωπεύουν τον κώδικα ταυτοποίησης της ίδιας
της εφαρμογής.

```typescript
import { Injectable, Module } from '@nestjs/common';
import { JobContextModule } from '@cqrs-ddd/nestjs';
import { correlationSource } from '@cqrs-ddd/pipeline-correlation';
import {
  type IJobPrincipal,
  type PrincipalReference,
} from '@cqrs-ddd/pipeline-job-context';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

@Injectable()
export class SessionJobPrincipal implements IJobPrincipal<Capability> {
  constructor(private readonly sessions: SessionRepository) {}

  capture(): PrincipalReference | undefined {
    const principal = currentPrincipal();
    return principal && { id: principal.id, type: principal.type, sessionId: principal.sid };
  }

  async restore<T>(
    principal: PrincipalReference,
    work: () => Promise<T>,
    grants?: readonly Capability[],
  ): Promise<T> {
    if (grants) return runAsPrincipal({ ...principal, grants }, work);
    const session = await this.sessions.findActive(principal.sessionId, principal.id);
    if (!session) throw new SessionRevokedError();
    return runAsPrincipal(principal, work);
  }
}

@Module({
  imports: [
    JobContextModule.forRoot({
      principal: SessionJobPrincipal,
      tenants: ['tenant_a', 'tenant_b'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      imports: [SessionsModule],
    }),
  ],
})
export class JobsModule {}
```

Το `tenants` είναι μια λίστα, ή μια συνάρτηση που επιστρέφει μία λίστα. Μια συνάρτηση καλείται μία φορά, όταν η
εφαρμογή κατασκευάζει τους providers του module, επομένως η λίστα μπορεί να προέρχεται από ρυθμίσεις που διαβάζονται
κατά την εκκίνηση (`tenants: () => config().tenants`) αντί κατά την εισαγωγή του αρχείου
module. Μια κενή λίστα εγείρει εξαίρεση: μια λίστα στο `forRoot`, μια συνάρτηση κατά την
εκκίνηση της εφαρμογής.

Το `capture` διαβάζει τον τρέχοντα principal όταν ένα job τοποθετείται στην ουρά· διατηρούνται μόνο τα `id`, `type` και
`sessionId` του. Το `restore` εκτελείται όταν εκτελείται το job, μέσα στο tenant και
correlation id του job: πρέπει να επανελέγξει τον principal έναντι της τρέχουσας κατάστασης, να τον συνδέσει όπως
θα έκανε ένα αίτημα, και να εγείρει εξαίρεση για να αρνηθεί το job.

## Χρήση <a id="usage"></a>

Προσθέστε σφραγίδα στο payload κατά την τοποθέτηση στην ουρά, μέσα από το αίτημα ή τον handler, ώστε το tenant,
το correlation id και ο principal να είναι ενήμεροι:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { withJobContext, type WithJobContext } from '@nestjs-pipeline/job-context';
import type { Queue } from 'bullmq';

type WelcomeEmail = { userId: string; email: string };

@EventsHandler(UserRegisteredEvent)
export class EnqueueWelcomeEmail implements IEventHandler<UserRegisteredEvent> {
  constructor(
    @InjectQueue(WELCOME_EMAIL_QUEUE)
    private readonly queue: Queue<WithJobContext<WelcomeEmail>>,
  ) {}

  async handle({ userId, email }: UserRegisteredEvent) {
    await this.queue.add('send', withJobContext({ userId, email }));
  }
}
```

Επαναφέρετέ το στον processor. Τοποθετήστε τον διακοσμητή κάτω από τον διακοσμητή transport:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { CommandBus } from '@nestjs/cqrs';
import { InJobContext, type WithJobContext } from '@nestjs-pipeline/job-context';
import type { Job } from 'bullmq';

@Processor(WELCOME_EMAIL_QUEUE)
export class SendWelcomeEmailProcessor extends WorkerHost {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  @InJobContext()
  async process(job: Job<WithJobContext<WelcomeEmail>>) {
    await this.commandBus.execute(new SendWelcomeEmailCommand(job.data));
  }
}
```

Το `@InJobContext()` διαβάζει το `data.jobContext` από το πρώτο όρισμα (ένα `Job` του BullMQ)· περάστε
`{ path: 'jobContext' }` για ένα transport που παραδίδει απευθείας το payload.

```typescript
@EventPattern('user.registered')
@InJobContext({ path: 'jobContext' })
async onRegistered(@Payload() data: WithJobContext<WelcomeEmail>) {
  await this.commandBus.execute(new SendWelcomeEmailCommand(data));
}
```

Ένα απορριφθέν job εγείρει `MissingJobContextError` ή `InvalidJobContextError` πριν εκτελεστεί η μέθοδος·
αφήστε την ουρά να το επισημάνει ως αποτυχημένο αντί να επιχειρήσει επανάληψη, καθώς το payload δεν θα αλλάξει.

Δήλωση εργασίας που ξεκινά από το σύστημα:

```typescript
import { AsSystem } from '@nestjs-pipeline/job-context';
import { Cron } from '@nestjs/schedule';

@Cron('0 3 * * *')
@AsSystem({
  principal: { id: 'session-cleanup', type: 'service' },
  grants: [{ action: 'delete', subject: 'Auth' }],
})
async purgeSessions() {
  await this.commandBus.execute(new PurgeExpiredSessionsCommand());
}
```

## Συμπεριφορά <a id="behavior"></a>

- **`withJobContext(data)`** επιστρέφει ένα αντίγραφο του `data` με `jobContext`: το tenant και
  το correlation id των ρυθμισμένων sources (ένα νέο από το `create()` του correlation source
  όταν κανένα δεν είναι ενεργό), και τον καταγεγραμμένο principal. Εγείρει `MissingJobContextError` χωρίς ένα
  ενεργό `JobContextModule`, tenant, ή principal, και `TypeError` για ένα payload που
  δεν είναι plain object.
- **`@InJobContext()`** επικυρώνει το context του payload πριν εκτελεστεί η μέθοδος. Απορρίπτει
  ένα απών context (`MissingJobContextError`), ένα κακοδιατυπωμένο, ένα μη ρυθμισμένο
  tenant, ένα correlation id που απορρίπτει το `accepts` του correlation source
  (το `correlationSource` δέχεται το πολύ 128 χαρακτήρες των `A-Z a-z 0-9 . _ ~ : / + = @ -`), ή έναν
  principal που φέρει οποιοδήποτε πεδίο πέρα από τα `id`, `type` και `sessionId`, όπως grants
  (`InvalidJobContextError`). Στη συνέχεια εκτελεί τη μέθοδο μέσα στο tenant, το correlation
  id και το `restore(principal, work)`. Η μέθοδος γίνεται ασύγχρονη.
- **`@AsSystem({ principal, grants })`** εκτελεί τη μέθοδο μία φορά ανά ρυθμισμένο tenant, διαδοχικά,
  το καθένα με ένα νέο correlation id από το `create()` και `restore(principal, work, grants)`. Ένα
  αποτυχημένο tenant δεν διακόπτει τα υπόλοιπα· η μέθοδος τότε απορρίπτεται με ένα
  `AggregateError` των αποτυχιών. Οι τιμές επιστροφής απορρίπτονται.
- **`JobContextModule.forRoot`** δηλώνει το principal port, τα tenants και τα sources όταν αρχικοποιείται το module
  και τα αφαιρεί κατά τον τερματισμό της εφαρμογής. Οι διακοσμητές τυλίγουν μεθόδους
  εκτός dependency injection, επομένως χρησιμοποιούν τη δήλωση της τρέχουσας εφαρμογής·
  χωρίς αυτήν αποτυγχάνουν κλειστά. Δηλώστε το μία φορά ανά εφαρμογή.

## Ασφάλεια <a id="security"></a>

Ένα payload είναι δεδομένα: οποιοσδήποτε μπορεί να γράψει στην ουρά μπορεί να το γράψει. Το πακέτο επομένως
μεταφέρει μόνο μια αναφορά ταυτότητας, ποτέ grants, και το `restore` αποφασίζει τι επιτρέπεται
να κάνει αυτή η ταυτότητα τώρα. Επανελέγξτε τη συνεδρία και τον λογαριασμό ενός χρήστη στο `restore`, ώστε μια ανακληθείσα
συνεδρία ή ένας διαγραμμένος χρήστης να απορρίπτει το job. Τα grants προέρχονται αποκλειστικά από το `@AsSystem`, στον κώδικα.
Το tenant πρέπει να είναι ένα από τα ρυθμισμένα tenants.

## API <a id="api"></a>

| Export | Είδος | Περιγραφή |
| --- | --- | --- |
| `withJobContext(data)` | function | Αντιγράφει το `data` και προσθέτει το τρέχον `jobContext` |
| `InJobContext(options?)` | decorator | Εκτελεί μια μέθοδο job στο context του payload της· το `path` έχει προεπιλογή `'data.jobContext'` |
| `AsSystem(options)` | decorator | Εκτελεί εργασία συστήματος μία φορά ανά tenant ως ο δηλωμένος principal και grants |
| `JobContextModule.forRoot(options)` | module | Δηλώνει το `principal` (κλάση), `tenants` (λίστα, ή συνάρτηση κατά την εκκίνηση), `sources` και προαιρετικά `imports` |
| `ContextSource`, `CorrelationSource`, `JobContextSources` | type | `{ current, run }`· το correlation source προσθέτει `create()` και `accepts(id)`· και το ζεύγος `{ tenantId, correlationId }` που δέχεται το `sources` |
| `IJobPrincipal<TGrant>` | interface | Application port: `capture()` και `restore(principal, work, grants?)` |
| `PrincipalReference` | type | `{ id, type, sessionId? }` |
| `JobContext`, `WithJobContext<T>` | type | Το μεταφερόμενο context, και ένα payload μαζί με αυτό |
| `MissingJobContextError`, `InvalidJobContextError` | error | Ανεξάρτητα από πλαίσιο (framework-neutral)· αντιστοιχίστε τα στον καταναλωτή εάν χρειάζεται |

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPL-3.0-or-later** ή **Εμπορική Άδεια (Commercial License)**. Δείτε τα
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
στη ρίζα του repository.
