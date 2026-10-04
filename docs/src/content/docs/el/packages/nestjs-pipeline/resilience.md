---
title: "@nestjs-pipeline/resilience"
description: "Resilience για το @nestjs-pipeline/core, βασισμένο στο cockatiel — επώνυμες πολιτικές κοινές για εξερχόμενους adapters (retry, circuit breaker, timeout, bulkhead, fallback) και ένα behavior για retry, timeout και bulkhead σε επίπεδο handler."
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-resilience`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-resilience).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-resilience/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/resilience` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/resilience.svg)](https://www.npmjs.com/package/@nestjs-pipeline/resilience)

Ανθεκτικότητα (Resilience) και διαχείριση παροδικών σφαλμάτων για το `@nestjs-pipeline/core`, βασισμένο στο [cockatiel](https://www.npmjs.com/package/cockatiel), σε δύο μέρη:

- **Επώνυμες πολιτικές (Named policies)** για εξερχόμενες εξαρτήσεις — ένα API πληρωμών, έναν SMTP server, ένα partner webhook. Δηλώστε **retry**, **circuit breaker**, **timeout**, **bulkhead** και **fallback** μία φορά στο module· κάθε adapter που καλεί την εξάρτηση μοιράζεται την ίδια πολιτική, οπότε ένας breaker παρακολουθεί μία εξάρτηση.
- **`ResilienceBehavior`** για τα επίπεδα που έχουν νόημα γύρω από έναν ολόκληρο handler: **retry** (επανάληψη ολόκληρου του command), **timeout** και **bulkhead**.

---

## Table of Contents

- [Γιατί](#why)
- [Πού ανήκει κάθε επίπεδο](#where-each-layer-belongs)
- [Εγκατάσταση](#installation)
- [Γρήγορη εκκίνηση](#quick-start)
- [Επώνυμες πολιτικές](#named-policies)
- [Το pipeline behavior](#the-pipeline-behavior)
- [Παραμετροποίηση](#configuration)
  - [Retry](#retry)
  - [Circuit Breaker](#circuit-breaker)
  - [Timeout](#timeout)
  - [Bulkhead](#bulkhead)
  - [Fallback](#fallback)
  - [Επιλογή σφαλμάτων (`handle`)](#error-selection-handle)
  - [Προσαρμοσμένη σειρά](#custom-order)
  - [Telemetry hooks](#telemetry-hooks)
  - [Escape hatch (`policy`)](#escape-hatch-policy)
- [Διαχείριση σφαλμάτων ανθεκτικότητας](#handling-resilience-errors)
- [Custom Logger](#custom-logger)
- [Behavior Contract & Διαγνωστικά Bootstrap](#behavior-contract--bootstrap-diagnostics)
- [Αναφορά API](#api-reference)
- [Άδεια χρήσης](#license)

---

## Γιατί <a id="why"></a>

Τα κατανεμημένα συστήματα αποτυγχάνουν παροδικά: τα δίκτυα παρουσιάζουν διακυμάνσεις, οι εξαρτήσεις καθυστερούν, οι βάσεις δεδομένων οδηγούνται σε deadlocks. Η απευθείας κλήση του cockatiel λειτουργεί, αλλά τότε κάθε adapter κατασκευάζει και διατηρεί τη δική του πολιτική. Αυτό το πακέτο δηλώνει πολιτικές **μία φορά, στο module**, τις επικυρώνει **κατά την εκκίνηση**, τις μοιράζει **μέσω dependency injection**, και τις κατονομάζει στα logs και την τηλεμετρία — διατηρώντας τα επίπεδα του handler δηλωτικά πάνω στον ίδιο τον handler.

---

## Πού ανήκει κάθε επίπεδο <a id="where-each-layer-belongs"></a>

Κάθε επίπεδο προστατεύει είτε **μία εξερχόμενη κλήση** (μια επώνυμη πολιτική που χρησιμοποιείται από έναν adapter) είτε **μία πλήρη εκτέλεση handler** (το pipeline behavior):

| Επίπεδο | Επώνυμη πολιτική (εξερχόμενη κλήση) | Pipeline behavior (ολόκληρος ο handler) |
|---|---|---|
| Circuit breaker | ✔ ένας breaker ανά εξάρτηση, κοινός για κάθε καλούντα | ✘ ένας breaker ανά command θα άνοιγε για ένα command ενώ η εξάρτηση αποτυγχάνει για όλα |
| Fallback | ✔ μια προεπιλεγμένη τιμή για μία κλήση | ✘ ένα έτοιμο αποτέλεσμα για ένα ολόκληρο command αποκρύπτει μια αποτυχημένη εγγραφή |
| Retry | ✔ επαναλαμβάνει μόνο την κλήση | ✔ επαναλαμβάνει ολόκληρο το command, π.χ. για επαναφόρτωση ενός aggregate μετά από παροδική σύγκρουση (`replaySafe` απαιτείται για commands και events) |
| Timeout | ✔ οριοθετεί μία κλήση | ✔ οριοθετεί ολόκληρο τον handler |
| Bulkhead | ✔ περιορίζει τις ταυτόχρονες κλήσεις προς την εξάρτηση | ✔ περιορίζει τις ταυτόχρονες εκτελέσεις του handler |

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-resilience @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs cockatiel
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Node.js 22.12 ή νεότερο, `@nestjs/common` `^12.1.0`.

> **Σημείωση:** Αυτό το πακέτο απαιτεί **cockatiel `^4.0.0`**. Το cockatiel δηλώνει τα σφάλματα που αναφέρουν οι πολιτικές του ως `unknown`, οπότε περιορίστε τους τύπους τους (narrow) πριν διαβάσετε το `message` ή άλλα πεδία.

---

## Γρήγορη εκκίνηση <a id="quick-start"></a>

### 1. Δήλωση του ResilienceBehavior ως provider <a id="1-register-resiliencebehavior-as-a-provider"></a>

Στο module αξιοπιστίας σας (reliability module), δηλώστε το `ResilienceBehavior` ως singleton provider:

```typescript
import { Module, Logger } from '@nestjs/common';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import {
  ResilienceBehavior,
} from '@cqrs-ddd/pipeline-resilience';

@Module({
  imports: [
    PipelineModule.forRoot(),
  ],
  providers: [
    {
      provide: ResilienceBehavior,
      useFactory: () =>
        new ResilienceBehavior(
          undefined, // Προαιρετικές καθολικές προεπιλεγμένες επιλογές
          new Logger(ResilienceBehavior.name),
        ),
    },
  ],
})
export class ReliabilityModule {}
```

### 2. Χρήση της επώνυμης πολιτικής στον outbound adapter <a id="2-use-the-named-policy-in-the-outbound-adapter"></a>

```typescript
import { Injectable } from '@nestjs/common';
import { ResiliencePolicies } from '@nestjs-pipeline/resilience';

@Injectable()
export class PaymentsClient {
  constructor(private readonly policies: ResiliencePolicies) {}

  charge(order: Order): Promise<Receipt> {
    // Το `signal` ακυρώνεται σε συνεταιριστικό timeout: περάστε το στην κλήση HTTP.
    return this.policies.execute('paymentsApi', ({ signal }) =>
      this.http.post('/charges', order, { signal }),
    );
  }
}
```

Κάθε handler που χρεώνει κάρτα περνά από το `PaymentsClient`, οπότε όλοι μοιράζονται έναν breaker `paymentsApi`: όταν το gateway αποτυγχάνει, το κύκλωμα ανοίγει για όλους ταυτόχρονα.

### 3. Προσάρτηση του behavior σε handler (προαιρετικά) <a id="3-attach-the-behavior-to-a-handler-optional"></a>

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { resilience } from '@nestjs-pipeline/resilience';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  resilience({
    // Επανάληψη ολόκληρου του command σε παροδική σύγκρουση persistence: το retry
    // επαναφορτώνει το aggregate και εκτελεί ξανά το domain logic.
    handle: isTransientOperationError,
    retry: { maxAttempts: 3, replaySafe: true, backoff: { type: 'exponential', maxDelay: 100 } },
  }),
)
export class DeleteUserHandler { /* ... */ }
```

> Η απλή μορφή tuple `@UsePipeline([ResilienceBehavior, { ... }])` παραμένει διαθέσιμη ως εναλλακτική λύση διαφυγής.

---

## Επώνυμες πολιτικές <a id="named-policies"></a>

- **Δηλώνονται μία φορά.** Το `ResilienceModule.forRoot({ policies })` δέχεται `Record<string, ResiliencePolicyOptions>`: κάθε επίπεδο, συν `handle`, `order` και `telemetry`.
- **Κατασκευάζονται κατά την εκκίνηση και μοιράζονται.** Το `ResiliencePolicies` κατασκευάζει κάθε πολιτική κατά την εκκίνηση της εφαρμογής και επιστρέφει το ίδιο instance σε κάθε καλούντα, ώστε η κατάσταση του circuit breaker και του bulkhead να ανήκει στην εξάρτηση.
- **Επικυρώνονται κατά την εκκίνηση.** Ένα retry, circuit breaker ή fallback χωρίς `handle` ή `handleAllErrors: true`, ή μια πολιτική χωρίς κανένα επίπεδο, πετάει `ResiliencePolicyConfigurationError` κατά το bootstrap.
- **Δεν απαιτείται `replaySafe`.** Μια επώνυμη πολιτική επαναλαμβάνει μόνο τη συγκεκριμένη κλήση του adapter· το κατά πόσο αυτή η κλήση είναι ασφαλές να επαναληφθεί αποτελεί απόφαση του adapter.
- **Κατονομάζονται στα logs και την τηλεμετρία.** Οι γραμμές καταγραφής αναφέρουν `policy 'paymentsApi'`, και κάθε συμβάν τηλεμετρίας φέρει `policyName`.

Χρησιμοποιήστε το μητρώο (registry), ή κάντε inject μία μεμονωμένη πολιτική:

```typescript
// Το μητρώο: κάθε δηλωμένη πολιτική με το όνομά της.
constructor(private readonly policies: ResiliencePolicies) {}
await this.policies.execute('paymentsApi', ({ signal }) => call(signal));
this.policies.get('paymentsApi'); // το κοινόχρηστο cockatiel IPolicy

// Μία πολιτική, injected με το όνομά της.
constructor(@InjectResiliencePolicy('paymentsApi') private readonly policy: IPolicy) {}
await this.policy.execute(({ signal }) => call(signal));
```

Ένα άγνωστο όνομα πετάει `ResiliencePolicyConfigurationError` αναφέροντας τα δηλωμένα ονόματα.

**Από παραμετροποίηση (configuration).** Το `forRootAsync` κατασκευάζει τις επιλογές από injected εξαρτήσεις. Καταγράψτε τα ονόματα που κάνετε inject με το `@InjectResiliencePolicy` στο `policyNames`· κάθε πολιτική είναι διαθέσιμη μέσω του `ResiliencePolicies` ανεξαρτήτως:

```typescript
ResilienceModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    policies: {
      paymentsApi: {
        handleAllErrors: true,
        timeout: { duration: config.getOrThrow<number>('PAYMENTS_TIMEOUT_MS') },
        bulkhead: { limit: 20 },
      },
    },
  }),
  policyNames: ['paymentsApi'],
});
```

---

## Το pipeline behavior <a id="the-pipeline-behavior"></a>

Το `ResilienceBehavior` περιτυλίγει το `next()` — το υπόλοιπο pipeline και τον handler — σε retry, bulkhead και timeout. Τα ρυθμισμένα επίπεδα συντίθενται από το εξωτερικότερο προς το εσωτερικότερο:

```
retry → bulkhead → timeout → handler
```

Κάθε προσπάθεια retry χρονομετρείται ανεξάρτητα. Οι πολιτικές κατασκευάζονται **καθυστερημένα (lazily) στην πρώτη κλήση και αποθηκεύονται στη μνήμη cache ανά handler**, οπότε ένα bulkhead μοιράζεται κατάσταση σε κάθε αίτημα προς αυτόν τον handler. Όταν δεν επιλύονται επιλογές, αυτό το αποτέλεσμα αποθηκεύεται στη μνήμη και οι επόμενες κλήσεις περνούν απευθείας στο `next()`.

Οι τελικές επιλογές για έναν handler αποτελούν **shallow merge** των `defaults` του module και των επιλογών του ίδιου του handler (υπερισχύουν τα κλειδιά του handler).

Ένα `circuitBreaker` ή `fallback` σε έναν handler απορρίπτεται κατά το bootstrap: δηλώστε το σε μια επώνυμη πολιτική και χρησιμοποιήστε το στον adapter.

---

## Παραμετροποίηση <a id="configuration"></a>

Τα παρακάτω επίπεδα είναι διαθέσιμα σε επώνυμες πολιτικές· το behavior δέχεται retry, timeout και bulkhead.

### Retry <a id="retry"></a>

Σε μια επώνυμη πολιτική, το retry επαναλαμβάνει την εξερχόμενη κλήση. Στο behavior, εκτελεί ξανά όλα τα μεταγενέστερα behaviors και τον handler· τα commands και events απαιτούν τότε `retry.replaySafe: true`, τα queries όχι. Αυτό το flag αποτελεί ρητή αναγνώριση, όχι μηχανισμό idempotency: ορίστε το μόνο όταν κάθε μεταγενέστερο side effect ανέχεται επανάληψη (για παράδειγμα, μια εγγραφή υπό συνθήκη έκδοσης που επαναφορτώνεται, ή μια εξωτερική κλήση που αποτρέπει διπλότυπα με σταθερό αναγνωριστικό λειτουργίας).

```typescript
{
  handle: (error) => error instanceof TransientError,
  retry: {
    replaySafe: true, // μόνο στο behavior, commands και events
    maxAttempts: 3, // προσπάθειες επανάληψης μετά την αρχική κλήση (έως 4 εκτελέσεις συνολικά)
    backoff: { type: 'exponential', initialDelay: 128, maxDelay: 30_000, jitter: 'decorrelated' },
  },
}
```

Στρατηγικές Backoff:

| Στρατηγική | Μορφή | Συμπεριφορά |
|---|---|---|
| `constant` | `{ type: 'constant', delay }` | Σταθερή καθυστέρηση `delay` (ms) μεταξύ προσπαθειών. |
| `exponential` | `{ type: 'exponential', initialDelay?, maxDelay?, exponent?, jitter? }` | Εκθετική αύξηση με jitter. Προεπιλογές: `initialDelay: 128`, `maxDelay: 30_000`, `exponent: 2`. |
| `iterable` | `{ type: 'iterable', delays }` | Διάσχιση ρητής λίστας `delays`· η τελευταία τιμή επαναλαμβάνεται. |

Στρατηγικές Jitter για `exponential`: `decorrelated` (προεπιλογή, συνιστώμενη), `full`, `half`, `none`.

### Circuit Breaker <a id="circuit-breaker"></a>

**Μόνο σε επώνυμες πολιτικές.** Σταματά να καλεί μια εξάρτηση που αποτυγχάνει για να της επιτρέψει να ανακάμψει. Ένας breaker ανά πολιτική, κοινός για κάθε καλούντα.

```typescript
policies: {
  paymentsApi: {
    handle: (error) => error instanceof TransientError,
    circuitBreaker: {
      halfOpenAfter: 10_000, // ms ανοιχτό πριν από δοκιμαστική κλήση
      breaker: { type: 'consecutive', threshold: 5 },
    },
  },
}
```

Στρατηγικές Breaker:

| Στρατηγική | Μορφή | Ανοίγει όταν… |
|---|---|---|
| `consecutive` | `{ type: 'consecutive', threshold }` | Συμβούν `threshold` αποτυχίες στη σειρά. |
| `sampling` | `{ type: 'sampling', threshold, duration, minimumRps? }` | Το ποσοστό αποτυχίας (`0–1`) υπερβεί το `threshold` εντός κυλιόμενου παραθύρου διάρκειας `duration` (ms). |
| `count` | `{ type: 'count', threshold, size, minimumNumberOfCalls? }` | Το ποσοστό αποτυχίας υπερβεί το `threshold` κατά τις τελευταίες `size` κλήσεις. |

### Timeout <a id="timeout"></a>

Σηματοδοτεί timeout όταν μια κλήση ή handler διαρκεί υπερβολικά πολύ. Τα επιθετικά (aggressive) timeouts απορρίπτουν την προσπάθεια αλλά δεν μπορούν να σταματήσουν εργασία που βρίσκεται ήδη σε εξέλιξη· χρησιμοποιήστε συνεταιριστικά (cooperative) timeouts και περάστε το signal σε ακυρώσιμα I/O όταν η εργασία πρέπει να διακοπεί — από το `execute(({ signal }) => …)` σε μια επώνυμη πολιτική, ή από το `getResilienceAbortSignal()` μέσα σε έναν handler.

```typescript
{
  timeout: { duration: 2_000, strategy: 'cooperative' },
}
```

- `aggressive` (προεπιλογή): άμεση απόρριψη με `TaskCancelledError`.
- `cooperative`: σηματοδότηση ακύρωσης και αναμονή τακτοποίησης της εργασίας.

Ένα cooperative timeout μέσα σε έναν handler, μεταβιβάζοντας το signal της προσπάθειας στο `fetch`:

```typescript
import { getResilienceAbortSignal, resilience } from '@nestjs-pipeline/resilience';

@QueryHandler(GetExchangeRatesQuery)
@UsePipeline(resilience({ timeout: { duration: 2_000, strategy: 'cooperative' } }))
export class GetExchangeRatesHandler implements IQueryHandler<GetExchangeRatesQuery> {
  async execute(): Promise<unknown> {
    const response = await fetch(RATES_URL, { signal: getResilienceAbortSignal() });
    return response.json();
  }
}
```

Σε έναν `command` ή `event` handler, ένα `aggressive` timeout αποτελεί διαγνωστικό σφάλμα bootstrap εκτός εάν το επιβεβαιώνει το `timeout.replaySafe: true`: ο καλών λαμβάνει απάντηση ενώ ο handler συνεχίζει να εκτελείται, οπότε ένα εξωτερικό retry, μια απελευθερωμένη δέσμευση idempotency ή μια επανάληψη πελάτη μπορεί να εκτελέσει το ίδιο side effect παράλληλα.

### Bulkhead <a id="bulkhead"></a>

Περιορίζει τις ταυτόχρονες ενεργές εκτελέσεις για να προστατεύσει έναν σπάνιο πόρο. Επαναχρησιμοποιείται μεταξύ κλήσεων.

```typescript
{
  bulkhead: { limit: 10, queue: 5 },
}
```

Όταν εξαντληθεί το όριο (και η προαιρετική ουρά `queue`), οι κλήσεις απορρίπτονται με `BulkheadRejectedError`.

### Fallback <a id="fallback"></a>

**Μόνο σε επώνυμες πολιτικές.** Αντικαθιστά μια τιμή για μία κλήση όταν αποτυγχάνει (αφού εξαντληθούν όλα τα εσωτερικά επίπεδα).

```typescript
policies: {
  exchangeRates: {
    handle: (error) => error instanceof TransientError,
    fallback: { factory: () => lastKnownRates() },
  },
}
```

### Επιλογή σφαλμάτων (`handle`) <a id="error-selection-handle"></a>

Τα retry, circuit breaker και fallback απαιτούν ρητό κατηγόρημα (predicate) `handle` ή `handleAllErrors: true`· η ρύθμιση απορρίπτεται όταν δεν παρέχεται κανένα από τα δύο. Προτιμήστε ένα predicate που επιλέγει μόνο παροδικά σφάλματα υποδομής, ώστε σφάλματα validation, εξουσιοδότησης και domain να μην επαναλαμβάνονται ούτε να υπολογίζονται ως αποτυχίες εξάρτησης:

```typescript
{
  handle: (error) => error instanceof TransientDbError,
  retry: { maxAttempts: 3 },
}
```

### Προσαρμοσμένη σειρά <a id="custom-order"></a>

Παρακάμψτε τη σειρά σύνθεσης. Περιτυλίγονται μόνο τα επίπεδα που αναφέρονται *και* έχουν ρυθμιστεί. Η προεπιλογή είναι `fallback → retry → circuitBreaker → bulkhead → timeout` (το behavior χρησιμοποιεί το τμήμα retry, bulkhead και timeout):

```typescript
{
  handle: (error) => error instanceof TransientError,
  retry: { maxAttempts: 3 },
  timeout: { duration: 1_000 },
  order: ['retry', 'timeout'], // το retry περιτυλίγει το timeout
}
```

### Telemetry hooks <a id="telemetry-hooks"></a>

Παρακολουθήστε συμβάντα πολιτικής. Κάθε hook λαμβάνει ένα event που φέρει `policyName` (απούσα για πολιτική handler):

```typescript
{
  telemetry: {
    onRetry: ({ attempt, policyName }) => metrics.increment('retry', { attempt, policyName }),
    onCircuitOpen: ({ policyName }) => metrics.increment('circuit.open', { policyName }),
    onCircuitClose: ({ policyName }) => metrics.increment('circuit.close', { policyName }),
    onCircuitHalfOpen: ({ policyName }) => metrics.increment('circuit.halfopen', { policyName }),
    onTimeout: ({ policyName }) => metrics.increment('timeout', { policyName }),
    onBulkheadRejected: ({ policyName }) => metrics.increment('bulkhead.rejected', { policyName }),
  },
}
```

Το πακέτο εκπέμπει επίσης γραμμές καταγραφής `debug`/`warn` για αυτά τα συμβάντα.

### Escape hatch (`policy`) <a id="escape-hatch-policy"></a>

Έχετε ήδη μια χειροποίητη πολιτική cockatiel για έναν handler; Περάστε την απευθείας και οι δηλωτικές επιλογές του behavior αγνοούνται. Οι έλεγχοι bootstrap (`handle`, `replaySafe`, επίπεδα εξάρτησης) παρακάμπτονται επίσης, οπότε η πολιτική αποτελεί εξ ολοκλήρου δική σας ευθύνη:

```typescript
import { wrap, retry, handleAll, ExponentialBackoff } from 'cockatiel';

const myPolicy = wrap(retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() }));

@UsePipeline(resilience({ policy: myPolicy }))
```

---

## Διαχείριση σφαλμάτων ανθεκτικότητας <a id="handling-resilience-errors"></a>

Οι πιο χρήσιμοι τύποι σφαλμάτων και enums του cockatiel επανεξάγονται ώστε να μπορείτε να αντιδράτε στα αποτελέσματα resilience χωρίς να εισάγετε απευθείας το `cockatiel`:

```typescript
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  IsolatedCircuitError,
  TaskCancelledError,
  CircuitState,
} from '@nestjs-pipeline/resilience';

try {
  await commandBus.execute(new ChargeCardCommand(/* … */));
} catch (error) {
  if (error instanceof BrokenCircuitError) {
    // Το κύκλωμα είναι ανοιχτό — fail fast / επιστροφή αποθηκευμένης τιμής.
  } else if (error instanceof TaskCancelledError) {
    // Ο handler έληξε λόγω timeout.
  } else if (error instanceof BulkheadRejectedError) {
    // Υπερβολικά πολλές ταυτόχρονες κλήσεις.
  }
}
```

Επανεξάγονται επίσης type guards (`isBrokenCircuitError`, `isBulkheadRejectedError`, `isIsolatedCircuitError`, `isTaskCancelledError`).

Αντιστοιχίστε τα σε αποκρίσεις HTTP μία φορά, με ένα Nest exception filter:

```typescript
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import {
  BrokenCircuitError,
  BulkheadRejectedError,
  TaskCancelledError,
} from '@nestjs-pipeline/resilience';

@Catch(BrokenCircuitError, BulkheadRejectedError, TaskCancelledError)
export class ResilienceErrorFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    const status =
      error instanceof TaskCancelledError
        ? HttpStatus.GATEWAY_TIMEOUT
        : HttpStatus.SERVICE_UNAVAILABLE;
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, message: error.message });
  }
}
```

Παρακολουθήστε την κατάσταση ενός breaker για health check μέσω των telemetry hooks της επώνυμης πολιτικής του:

```typescript
import { CircuitState, ResilienceModule } from '@nestjs-pipeline/resilience';

export const paymentsCircuit = { state: CircuitState.Closed };

ResilienceModule.forRoot({
  policies: {
    paymentsApi: {
      handle: (error) => error instanceof PaymentGatewayUnavailableError,
      circuitBreaker: { halfOpenAfter: 30_000, breaker: { type: 'consecutive', threshold: 5 } },
      telemetry: {
        onCircuitOpen: () => { paymentsCircuit.state = CircuitState.Open; },
        onCircuitHalfOpen: () => { paymentsCircuit.state = CircuitState.HalfOpen; },
        onCircuitClose: () => { paymentsCircuit.state = CircuitState.Closed; },
      },
    },
  },
});
```

---

## Custom Logger <a id="custom-logger"></a>

Το `ResilienceBehavior` και το `ResiliencePolicies` καταγράφουν logs μέσω του `LoggerService` που συνδέεται στο `LOGGING_BEHAVIOR_LOGGER`. Συνδέστε το με την επιλογή `loggerProvider` του `PipelineModule` (χρήσιμο με το `nestjs-pino`):

```typescript
import { Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { LOGGING_BEHAVIOR_LOGGER, PipelineModule } from '@nestjs-pipeline/core';
import { ResilienceBehavior, ResilienceModule } from '@nestjs-pipeline/resilience';

@Module({
  imports: [
    ResilienceModule.forRoot({ policies: { /* ... */ } }),
    PipelineModule.forRoot({
      behaviors: [ResilienceBehavior],
      loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: Logger },
    }),
  ],
})
export class AppModule {}
```

Εάν δεν συνδεθεί logger, καθένα χρησιμοποιεί έναν προεπιλεγμένο Nest `Logger` με scope το όνομα της κλάσης του.

---

## Behavior Contract & Διαγνωστικά Bootstrap <a id="behavior-contract--bootstrap-diagnostics"></a>

Το `ResilienceBehavior` υλοποιεί τα διαγνωστικά συμβολαίου behavior του `@nestjs-pipeline/core`:

### Κανόνες Επικύρωσης (Validation Invariants) <a id="validation-invariants"></a>

- **Κανένα επίπεδο εξάρτησης σε handler**: Τα `circuitBreaker` και `fallback` ανήκουν σε επώνυμες πολιτικές. Η ρύθμιση οποιουδήποτε από τα δύο στο behavior αποτυγχάνει κατά την εκκίνηση, με υπόδειξη διόρθωσης προς το `ResilienceModule.forRoot({ policies })`.
- **Απαιτείται κατηγοριοποίηση σφαλμάτων**: Ένα `retry` χρειάζεται `handle: (error: unknown) => boolean` ή `handleAllErrors: true`. Μη καθορισμένη διαχείριση σφαλμάτων αποτυγχάνει άμεσα κατά την εκκίνηση με `PipelineConfigurationError` σε κατάσταση `strict`.
- **Replay safety σε non-query retry**: Η επανάληψη ενός handler επαναλαμβάνει τη μεταγενέστερη εκτέλεση και εκτελεί ξανά τα side effects. Σε `command` και `event` handlers, το `retry` πρέπει να δηλώνει `replaySafe: true` αφού επαληθευτεί ότι τα μεταγενέστερα side effects είναι idempotent ή συναλλακτικά.
- **Επιθετικό timeout σε command ή event**: Απαιτεί `timeout.replaySafe: true`· διαφορετικά χρησιμοποιήστε `strategy: 'cooperative'`.
- **Escape hatch**: Ένας handler ρυθμισμένος με `policy` παρακάμπτει κάθε παραπάνω έλεγχο.
- **Runtime guard**: Όταν τα διαγνωστικά είναι `'warn'` ή `'off'`, η ίδια μη ασφαλής ρύθμιση πετάει `ResilienceConfigurationError` (`requestName`, `requestKind`, `reason`) κατά την πρώτη κλήση του handler.
- **Επίλυση προεπιλογών module**: Οι προεπιλογές `defaults` που παρέχονται στο `ResilienceModule.forRoot({ defaults })` συγχωνεύονται κάτω από τις επιλογές handler μέσω του `ResilienceBehavior.resolveEffectiveOptions` και αξιολογούνται κατά τα διαγνωστικά bootstrap.

Οι επώνυμες πολιτικές επικυρώνονται ξεχωριστά, όταν δημιουργείται το `ResiliencePolicies` κατά την εκκίνηση (δείτε τις [Επώνυμες πολιτικές](#named-policies)).

---

## Αναφορά API <a id="api-reference"></a>

### `ResilienceModule.forRoot({ defaults?, policies? })` <a id="resiliencemoduleforroot-defaults-policies-"></a>

Επιστρέφει ένα καθολικό (global) `DynamicModule` που παρέχει τα `ResilienceBehavior`, `ResiliencePolicies` και ένα injectable token ανά επώνυμη πολιτική. Τα `defaults` εφαρμόζονται μόνο εκεί όπου προσαρτάται το `ResilienceBehavior`.

### `ResilienceModule.forRootAsync({ imports?, inject?, useFactory, policyNames? })` <a id="resiliencemoduleforrootasync-imports-inject-usefactory-policynames-"></a>

Το ίδιο, με τις επιλογές κατασκευασμένες από το `useFactory` μέσω injected εξαρτήσεων. Το `policyNames` απαριθμεί τις πολιτικές που είναι διαθέσιμες για injection με το `@InjectResiliencePolicy`.

### `ResiliencePolicies` <a id="resiliencepolicies"></a>

Το μητρώο επώνυμων πολιτικών: `names`, `get(name)` (το κοινόχρηστο cockatiel `IPolicy`) και `execute(name, fn)`. Πετάει `ResiliencePolicyConfigurationError` κατά την εκκίνηση για μη έγκυρη πολιτική και στο `get`/`execute` για άγνωστο όνομα.

### `@InjectResiliencePolicy(name)` / `getResiliencePolicyToken(name)` <a id="injectresiliencepolicyname--getresiliencepolicytokenname"></a>

Κάνει inject μία επώνυμη πολιτική· το token μπορεί επίσης να χρησιμοποιηθεί σε προσαρμοσμένους providers.

### `ResilienceBehavior` <a id="resiliencebehavior"></a>

Το pipeline behavior. Επιλύει και αποθηκεύει στη μνήμη cache μια σύνθετη πολιτική cockatiel ανά handler και εκτελεί τον handler μέσω αυτής.

### `resilience(options)` <a id="resilienceoptions"></a>

Type-safe intent builder που επιστρέφει `[ResilienceBehavior, options]` με compile-time επαλήθευση που διασφαλίζει ότι τουλάχιστον ένα από τα `retry`, `timeout`, `bulkhead` ή `policy` έχει ρυθμιστεί. Δέχεται `ResilienceIntentOptions`.

### `ResilienceBehaviorOptions` / `ResiliencePolicyOptions` <a id="resiliencebehavioroptions--resiliencepolicyoptions"></a>

Η δηλωτική παραμετροποίηση ενός handler (`retry`, `bulkhead`, `timeout`, `handle`, `handleAllErrors`, `order`, `telemetry`, `policy`) και μιας επώνυμης πολιτικής (κάθε επίπεδο, `handle`, `handleAllErrors`, `order`, `telemetry`).

### `buildResiliencePolicy(options, context)` <a id="buildresiliencepolicyoptions-context"></a>

Βοηθητικό εργαλείο χαμηλού επιπέδου που συνθέτει ένα cockatiel `IPolicy` (ή `null` όταν δεν έχει ρυθμιστεί τίποτα) από δηλωτικές επιλογές. Εκτίθεται για προχωρημένα σενάρια ή δοκιμές.

```typescript
import { Logger } from '@nestjs/common';
import { buildResiliencePolicy } from '@nestjs-pipeline/resilience';

const policy = buildResiliencePolicy(
  { handleAllErrors: true, retry: { maxAttempts: 2 }, timeout: { duration: 1_000 } },
  { logger: new Logger('Reports'), policyName: 'reports' },
);
await policy?.execute(() => generateReport());
```

Δεν εκτελεί την επικύρωση εκκίνησης του `ResiliencePolicies`.

### Σφάλματα <a id="errors"></a>

- `ResiliencePolicyConfigurationError` (`policyName`, `reason`) — μη έγκυρη επώνυμη πολιτική κατά την εκκίνηση, ή άγνωστο όνομα στο `get`/`execute`.
- `ResilienceConfigurationError` (`requestName`, `requestKind`, `reason`) — μη ασφαλής ρύθμιση handler που εντοπίζεται κατά την πρώτη του κλήση.

### Τύποι <a id="types"></a>

`ResilienceModuleOptions`, `ResilienceModuleAsyncOptions`, `RetryOptions` / `RetryPolicyOptions` (με και χωρίς `replaySafe`), `TimeoutOptions` / `TimeoutPolicyOptions`, `BulkheadOptions`, `CircuitBreakerOptions`, `BreakerStrategy`, `FallbackOptions` (`{ value }` ή `{ factory }`), `RetryBackoff`, `JitterStrategy`, `ResilienceLayer`, `HandlerResilienceLayer` (`'retry' | 'bulkhead' | 'timeout'`), `ResilienceTelemetry`, `ResilienceTelemetryEvent`, `PolicyBuildContext` (`logger`, `requestName`, `handlerName`, `policyName`, `telemetry`), `AnyPolicy` (η σύνθετη πολιτική cockatiel που επιστρέφει το `buildResiliencePolicy`).

### Βοηθητικά Context & Tokens <a id="context-helpers--tokens"></a>

- `getResilienceAbortSignal()` — επιστρέφει το `AbortSignal` της ενεργής προσπάθειας για συνεταιριστικά timeouts μέσα σε έναν handler, ή `undefined` εκτός του `ResilienceBehavior`.
- `RESILIENCE_DEFAULT_OPTIONS` — το token των προεπιλογών του behavior.

### Επανεξαγόμενα από το cockatiel <a id="re-exported-from-cockatiel"></a>

Σφάλματα: `BrokenCircuitError`, `BulkheadRejectedError`, `IsolatedCircuitError`, `TaskCancelledError`. Guards: `isBrokenCircuitError`, `isBulkheadRejectedError`, `isIsolatedCircuitError`, `isTaskCancelledError`. Enum: `CircuitState`.

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPLv3** (δείτε το [LICENSE](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE)) ή **Εμπορική Άδεια (Commercial License)** (δείτε το [COMMERCIAL_LICENSE.txt](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)). Επικοινωνία: aristotelis@ik.me
