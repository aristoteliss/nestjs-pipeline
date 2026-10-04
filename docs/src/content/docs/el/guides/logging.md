---
title: "Το ενσωματωμένο LoggingBehavior"
---

Το βασικό πακέτο (core) περιλαμβάνει το `LoggingBehavior` που καταγράφει δεδομένα request/response και μετρήσεις χρονισμού μέσω του NestJS `Logger`:

```typescript
import { LoggingBehavior } from '@nestjs-pipeline/core';

// Register globally with default options
PipelineModule.forRoot({
  globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
})
```

**Επιλογές** (`LoggingBehaviorOptions`):

| Επιλογή | Τύπος | Προεπιλογή | Περιγραφή |
|---|---|---|---|
| `metricLogLevel` | `LogLevel \| 'none'` | `'log'` | Επίπεδο καταγραφής (log level) για μηνύματα χρονισμού/διάρκειας |
| `requestResponseLogLevel` | `LogLevel \| 'none'` | `'debug'` | Επίπεδο καταγραφής για τα payloads αιτήματος/απάντησης (request/response) |
| `errorLogLevel` | `LogLevel \| 'none'` | `'error'` | Επίπεδο καταγραφής όταν παρουσιάζεται σφάλμα |
| `mapLogLevel` | `Map<ErrorClass, LogLevel \| 'none'>` | `undefined` | Συγκεκριμένα επίπεδα καταγραφής αντιστοιχισμένα ανά κλάση σφάλματος εξαίρεσης (υπερισχύει η πιο ειδική αντιστοίχιση στην αλυσίδα πρωτοτύπου) |
| `excludeKeys` | `string[]` | `[]` | Κλειδιά προς παράλειψη από τα logs των request/response (υποστηρίζει dot notation για εμφωλευμένες ιδιότητες) |
| `excludeRequestObj` | `boolean` | `true` | Εάν είναι true, παραλείπει πλήρως το αντικείμενο του αιτήματος από τα logs (εμφανίζει placeholder) |
| `excludeResponseObj` | `boolean` | `true` | Εάν είναι true, παραλείπει πλήρως το αντικείμενο της απάντησης από τα logs (εμφανίζει placeholder) |
| `logFormat` | `'text' \| 'structured'` | `'text'` | Μορφή εξόδου για logs αιτήματος/απάντησης/μετρήσεων/σφαλμάτων. Το `'text'` παράγει ένα ενιαίο interpolated string· το `'structured'` παράγει ένα απλό αντικείμενο (π.χ. `{ msg, request }`), χρήσιμο για structured loggers όπως το `nestjs-pino`/pino που σειριοποιούν σε JSON |

> Από προεπιλογή τα `excludeRequestObj`/`excludeResponseObj` είναι `true`, επομένως έτοιμα προς χρήση θα βλέπετε τα placeholders `[exclude request obj]` / `[exclude response obj]` αντί για το πραγματικό payload — ορίστε τα σε `false` για να καταγράφετε το πραγματικό request/response.

Σε περίπτωση αποτυχίας, το log σφάλματος περιλαμβάνει επίσης το `stack` του σφάλματος που προέκυψε (όταν πρόκειται για instance του `Error`) και, εάν το σφάλμα εκθέτει μια ιδιότητα `optionalParams` (π.χ. μια custom εξαίρεση που φέρει επιπλέον δομημένο context), αυτές οι τιμές προσαρτώνται επίσης στην εγγραφή καταγραφής.

Για να παρέχετε τη δική σας υλοποίηση logger (για παράδειγμα `nestjs-pino`), συνδέστε το token `LOGGING_BEHAVIOR_LOGGER`:

```typescript
import { Module } from '@nestjs/common';
import { NativeLogger } from 'nestjs-pino';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';

@Module({
  imports: [
    PipelineModule.forRoot({
      globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
      bootstrapLogLevel: 'verbose',
    }),
  ],
  providers: [
    { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
  ],
})
export class AppModule {}
```

Όταν χρησιμοποιείτε το `nestjs-pino`, τα log levels του Nest αντιστοιχίζονται στο pino ως εξής:
`verbose` → `trace`, `debug` → `debug`, `log` → `info`, `warn` → `warn`, `error` → `error`, `fatal` → `fatal`.
Εάν χρησιμοποιείτε `bootstrapLogLevel: 'verbose'`, ορίστε στο pino `level: 'trace'`.

```typescript
// Verbose logging for a specific handler
@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler { /* ... */ }

// Map specific exceptions to different log levels (e.g. log constraint violations as warnings)
@UsePipeline([LoggingBehavior, { 
  mapLogLevel: new Map([
    [UniqueConstraintException, 'warn'],
    [NotFoundException, 'debug'],
  ]) 
}])

// Disable payload logging entirely, keep timing metrics
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'none' }])

// Disable all logging for a handler
@UsePipeline([LoggingBehavior, { metricLogLevel: 'none', requestResponseLogLevel: 'none' }])
```

Το `LoggingBehavior` καταγράφει υπό το context του **handler**, όχι το δικό του. Το όνομα του handler μεταβιβάζεται σε κάθε κλήση καταγραφής, επομένως ένας singleton logger δεν μεταβάλλεται ποτέ και ταυτόχρονοι handlers δεν μπορούν να αντικαταστήσουν ο ένας το context του άλλου. Με `excludeRequestObj: false, excludeResponseObj: false`:

**Παράδειγμα εξόδου** (σε επιτυχία):

```
[Nest] LOG   [CreateUserHandler] Request: {"username":"jane","email":"jane@example.com"}
[Nest] LOG   [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler completed in 12.34ms
[Nest] DEBUG [CreateUserHandler] Response: {"id":"...","username":"jane","email":"jane@example.com"}
```

**Παράδειγμα εξόδου** (σε σφάλμα):

```
[Nest] ERROR [CreateUserHandler] [019728a3-...] COMMAND CreateUserCommand → CreateUserHandler failed after 2.10ms: Error: User already exists
```
