---
title: "Αναβάθμιση από την έκδοση 0.2.x"
sidebar:
  order: 2
---

Η έκδοση 0.3.0 μεταφέρει κάθε πακέτο στο NestJS 12. Κάθε αλλαγή παρατίθεται στο
[CHANGELOG.md](/nestjs-pipeline/changelog/)· οι παρακάτω απαιτούν αλλαγή στις περισσότερες εφαρμογές.

**1. NestJS 12.1 και Node.js 22.12.** Κάθε πακέτο δηλώνει `engines.node >=22.12.0`
(`@cqrs-ddd/mikro-orm` `>=22.17.0`, όπως απαιτεί το MikroORM 7), και
κάθε peer dependency για `@nestjs/common`, `@nestjs/core` και `@nestjs/cqrs` είναι `^12.1.0`. Πακέτα που
έχουν peer dependency στο `@nestjs-pipeline/core` απαιτούν το `^0.3.0` αυτού. Το NestJS 12.0.x δεν υποστηρίζεται:
αφαιρεί τους δείκτες `@Optional()` μιας βασικής κλάσης σε μια υποκλάση που δεν δηλώνει δικό της constructor,
επομένως μια τέτοια υποκλάση ενός behavior αποτυγχάνει να επιλύσει τις προαιρετικές της εξαρτήσεις.

```bash
pnpm add @nestjs/common@^12.1.0 @nestjs/core@^12.1.0 @nestjs/cqrs@^12.1.0 @nestjs-pipeline/core@^0.3.0
```

**2. Μια εφαρμογή CommonJS μεταγλωττίζεται με TypeScript `module` `nodenext`, `node20` ή
`bundler`.** Το NestJS 12 δημοσιεύει ES modules, τα οποία μια εφαρμογή CommonJS φορτώνει μέσω
του `require()` του Node για ES modules (Node.js 22.12). Με `module: node16`, το TypeScript απορρίπτει
αυτά τα imports (TS1479).

**3. Το `ZodPipe` καταργήθηκε.** Δηλώστε το σχήμα στην παράμετρο και δηλώστε το
`StandardSchemaValidationPipe` του Nest μία φορά με το `zodBadRequest`· το σώμα του 400 είναι αυτό
που παρέχει το `ZodValidationFilter`:

```typescript
// app.module.ts
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { zodBadRequest } from '@nestjs-pipeline/zod';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({ exceptionFactory: zodBadRequest }),
    },
  ],
})
export class AppModule {}

// users.controller.ts
getUser(@Param('id', { schema: UserIdSchema }) id: string) {}
```

**4. Δηλώστε το `IdempotencyConflictFilter`.** Το προεπιλεγμένο exception filter του NestJS 12 απαντά σε ένα
απλό `Error` που φέρει ένα `statusCode` με 500. Το `IdempotencyConflictError` είναι ένα τέτοιο σφάλμα, επομένως
χωρίς το φίλτρο ένα αίτημα του οποίου το idempotency key εκτελείται ακόμη ή επαναχρησιμοποιήθηκε απαντά με
500 αντί για 409 ή 422. Τα ενσωματωμένα φίλτρα δηλώνονται όπως περιγράφεται στο
[Τι νέο υπάρχει στην έκδοση 0.2.2](/nestjs-pipeline/el/releases/0-2-2/).

**5. cockatiel 4.** Το `@nestjs-pipeline/resilience` απαιτεί `cockatiel` `^4.0.0`, ένα ES
module. Οι πολιτικές του αναφέρουν σφάλματα ως `unknown`· περιορίστε τον τύπο τους πριν διαβάσετε το `message`.

**6. rate-limiter-flexible 11.** Το `@nestjs-pipeline/rate-limit` δεν δηλώνει peer dependency σε αυτό και
έχει δοκιμαστεί με το 11, το οποίο προκαλεί σφάλμα όταν ένας limiter δημιουργείται χωρίς πεπερασμένο `points` ή
`duration`.

**7. Τα domain events φέρουν dispatcher context.** Ο `CommandBaseHandler` του `@cqrs-ddd/core`
καλεί `publishAll(events, aggregate)`, επομένως ένας publisher που διαβάζει ένα δεύτερο όρισμα λαμβάνει
το aggregate, όπως το μεταβιβάζει το `EventPublisher` του NestJS. Το `AggregateRoot.commit(context?)`
μεταβιβάζει το context του στο `publishAll` και επιστρέφει το αποτέλεσμα του publisher, και το
`IAggregateRoot` περιγράφει το συμβόλαιο που ικανοποιούν τόσο τα aggregates αυτού του πακέτου όσο και του NestJS.
