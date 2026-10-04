---
title: "Μοντέλο εκτέλεσης pipeline"
sidebar:
  order: 1
---

```
┌─ global before ──┐   ┌── @UsePipeline ──┐   ┌─ global after ──┐
│ LoggingBehavior  │ → │ AuditBehavior    │ → │ TraceBehavior   │ → handler.execute()
│ ZodValidation    │   │ Idempotency      │   │ MetricsBehavior │
└──────────────────┘   └──────────────────┘   └─────────────────┘
                    ← η απόκριση διαδίδεται πίσω μέσω της αλυσίδας ←
```

## Κύκλος ζωής Bootstrap και Ανακάλυψης (Discovery)

Κατά την εκκίνηση της εφαρμογής (`onApplicationBootstrap`), το `PipelineBootstrap` (από το `@cqrs-ddd/nestjs`) συνδέει το pipeline:

1. **Ανακάλυψη Handlers (Handler Discovery)**: Ανακαλύπτει όλους τους `@nestjs/cqrs` handlers που έχουν καταχωρηθεί στο IoC container της Nest εφαρμογής χρησιμοποιώντας το `DiscoveryService` του Nest, διαβάζοντας metadata από τα `@CommandHandler`, `@QueryHandler` και `@EventsHandler`.
2. **Επαλήθευση Στατικού Δέντρου Εξαρτήσεων**: Επαληθεύει το `provider.isDependencyTreeStatic()` σε κάθε handler που εκτελεί behaviors. Εάν οποιοσδήποτε handler ή οι injected εξαρτήσεις του είναι request-scoped (`Scope.REQUEST`), το bootstrap αποτυγχάνει αμέσως με περιγραφικό σφάλμα. Οι handlers και τα behaviors πρέπει να είναι singletons· το context ανά αίτημα διαβάζεται μέσω `AsyncLocalStorage` μέσω των ρυθμισμένων `sources`.
3. **Επίλυση Behavior Providers**: Επιλύει κάθε απαιτούμενο behavior instance από το DI container του NestJS υπό το class token του behavior (π.χ. `IdempotencyBehavior`). Αποτυγχάνει άμεσα εάν ένα απαιτούμενο behavior δεν έχει provider ή εάν πολλαπλά modules παρέχουν αντικρουόμενα instances.
4. **Σύνταξη Πλάνου (Plan Compilation)**: Συντάσσει το πλάνο εκτέλεσης μία φορά ανά handler (`compilePipelinePlan`), υπολογίζοντας τη διατεταγμένη ακολουθία: global `before` &rarr; `@UsePipeline` δηλωμένα behaviors &rarr; global `after`.
5. **Διαγνωστικά Συμβολαίου (Contract Diagnostics)**: Όταν το `diagnostics` είναι `'strict'` (προεπιλογή), εκτελεί το `validateBehaviorContracts` για την επιβολή αρχιτεκτονικών κανόνων (π.χ. το `CaslBehavior` πρέπει να προηγείται των `CacheBehavior` και `IdempotencyBehavior`).
6. **Περικλείσιμο Εκτέλεσης (Execution Wrapping)**: Περικλείει τη μέθοδο `execute` του handler instance (ή `handle` για event handlers) με τον προ-μεταγλωττισμένο `PipelineRunner`. Κατά τον τερματισμό της εφαρμογής (`onModuleDestroy`), τα wrappers αποκαθίστανται καθαρά.

## Κύκλος ζωής Εκτέλεσης Runtime

Όταν ένας καλών αποστέλλει μέσω του `CommandBus`, `QueryBus` ή `EventBus` του Nest:

1. **Δημιουργία Context**: Ο runner δημιουργεί ένα `IPipelineContext` καταγράφοντας το request instance, τον constructor της κλάσης, τον τύπο του handler, τη χρονοσήμανση και μια συλλογή items.
2. **Πηγές Context (Context Sources)**: Συμπληρώνει τα `correlationId` και `tenantId` αξιολογώντας τις ρυθμισμένες συναρτήσεις `sources` εντός του τρέχοντος ασύγχρονου context εκτέλεσης (`AsyncLocalStorage`).
3. **Εκτέλεση Αλυσίδας Onion**: Εκτελεί κάθε behavior με τη σειρά:
   - Τα εξωτερικά behaviors εκτελούν λογική προεπεξεργασίας πριν καλέσουν το `next()`.
   - Εάν ένα εξωτερικό behavior βραχυκυκλώσει (π.χ. εύρεση στην cache από το `CacheBehavior` ή επανάληψη από το `IdempotencyBehavior`), επιστρέφει το αποθηκευμένο αποτέλεσμα χωρίς να καλέσει τα επόμενα behaviors ή τον handler.
   - Τα εσωτερικά behaviors εκτελούνται, ακολουθούμενα από την επιχειρησιακή λογική του handler.
   - Η λογική μετα-επεξεργασίας εκτελείται με αντίστροφη σειρά καθώς οι αποκρίσεις ή τα σφάλματα αναδύονται προς τα πάνω.

## Σειρά Εκτέλεσης

| Φάση | Πηγή | Θέση |
|---|---|---|
| Καθολικό `before` | `globalBehaviors.before` | Εξωτερικότερο (εκτελείται πρώτο) |
| Επίπεδο Handler | `@UsePipeline(...)` | Μεσαίο |
| Καθολικό `after` | `globalBehaviors.after` | Εσωτερικότερο (πιο κοντά στον handler) |
| Handler | `execute()` / `handle()` | Πυρήνας επιχειρησιακής λογικής |

## Αποτροπή διπλοτύπων και Υπερίσχυση Ίδιας Κλάσης

Όταν τόσο οι καθολικές ρυθμίσεις όσο και οι ρυθμίσεις επιπέδου handler περιλαμβάνουν την ίδια κλάση behavior, οι πλήρεις επιλογές του handler κερδίζουν, ενώ το behavior διατηρεί τη θέση του στην καθολική αλυσίδα. Τα καθολικά διπλότυπα απαλείφονται αυτόματα.

```typescript
// Καθολική ρύθμιση στο PipelineModule.forRoot
PipelineModule.forRoot({
  globalBehaviors: [
    {
      scope: 'all',
      before: [
        [LoggingBehavior, { metricLogLevel: 'log', requestResponseLogLevel: 'debug' }],
      ],
    },
  ],
})

// Ο Handler παρακάμπτει τις επιλογές του LoggingBehavior
@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }], // ← υπερισχύει των καθολικών επιλογών
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  // ...
}

// Ενεργή αλυσίδα για τον CreateUserHandler:
//   [LoggingBehavior στη θέση global-before, χρησιμοποιώντας τις επιλογές του handler] → handler.execute()
```

Η διατήρηση της εξωτερικής καθολικής θέσης εγγυάται ότι υποχρεωτικές οριζόντιες πολιτικές (όπως authentication ή logging) δεν μπορούν να μετακινηθούν πίσω από behaviors caching ή idempotency που ενδέχεται να βραχυκυκλώσουν πριν καλέσουν το `next()`.
