---
title: "@nestjs-pipeline/zod"
description: "Behavior επικύρωσης/parsing μέσω Zod για το @nestjs-pipeline/core που εφαρμόζει επιτυχή έξοδο αναλυμένου αντικειμένου στο υφιστάμενο αίτημα"
editUrl: false
---

> **Από την έκδοση 0.5.0 το πακέτο αυτό συνεχίζει ως [`@cqrs-ddd/pipeline-zod`](https://www.npmjs.com/package/@cqrs-ddd/pipeline-zod).** Ο κώδικας, τα issues και
> οι εκδόσεις του βρίσκονται στο [ddd-cqrs](https://github.com/aristoteliss/ddd-cqrs), με τεκμηρίωση στο [aristoteliss.github.io/ddd-cqrs](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-zod/).
> Οι εφαρμογές NestJS προσθέτουν το [`@cqrs-ddd/nestjs`](https://www.npmjs.com/package/@cqrs-ddd/nestjs). Οι εκδόσεις 0.1 έως 0.4 του
> `@nestjs-pipeline/zod` παραμένουν στο npm αμετάβλητες, και η γραμμή 0.4.x λαμβάνει μόνο διορθώσεις.

Ενσωμάτωση επικύρωσης και parsing με το Zod v4 για το `@nestjs-pipeline/core` — ανάλυση commands, queries, και events στο όριο του pipeline, επικύρωση παραμέτρων και bodies σε controllers μέσω του `StandardSchemaValidationPipe` του Nest με το ίδιο σώμα 400 (`zodBadRequest`), και σύλληψη σφαλμάτων validation με το `ZodValidationFilter`.

---

## Table of Contents

- [Εγκατάσταση](#installation)
- [ZodValidationBehavior](#zodvalidationbehavior)
  - [Καθολική Δήλωση](#global-registration)
  - [Δήλωση ανά Handler](#per-handler-registration)
  - [Πώς Λειτουργεί](#how-it-works)
- [Δημιουργία Validated Commands, Queries, και Events](#creating-validated-commands-queries-and-events)
  - [Factories createCommand() και createQuery()](#createcommand-and-createquery-factories)
  - [Επέκταση Βασικής Κλάσης](#extending-a-base-class)
  - [Ενημερώσιμα Πεδία (Updatable Fields)](#updatable-fields)
  - [Metadata Standard Schema](#standard-schema-metadata)
  - [Στατικά parse() και safeParse()](#static-parse-and-safeparse)
  - [Βοηθητικά Εξαγωγής Τύπων (InferInput, InferOutput)](#type-inference-helpers-inferinput-inferoutput)
  - [Χειροκίνητη Προσάρτηση Schemas](#attaching-schemas-manually)
- [Nest Schema Validation](#nest-schema-validation)
  - [Validation στο Body](#body-validation)
  - [Validation σε παραμέτρους (Param)](#param-validation)
  - [Transform Schemas](#transform-schemas)
  - [Εξαναγκασμός Τύπων στο Query-String](#query-string-coercion)
- [createZodMapper](#createzodmapper)
- [ZodValidationFilter](#zodvalidationfilter)
- [ZodValidationError](#zodvalidationerror)
- [Ανάγνωση Ακατέργαστου Input και Επικυρωμένων Δεδομένων](#reading-raw-input-and-parsed-data)
- [Πλήρες Παράδειγμα](#full-example)
- [Μετάβαση από την έκδοση 0.2.x](#migrating-from-02x)
- [Μετάβαση από την έκδοση 0.1.x](#migrating-from-01x)
- [Αναφορά API](#api-reference)
- [Παρουσία Ιδιοτήτων (Property Presence)](#property-presence)
- [Άδεια χρήσης](#license)

---

## Εγκατάσταση <a id="installation"></a>

```bash
pnpm add @cqrs-ddd/pipeline-zod @cqrs-ddd/nestjs @cqrs-ddd/pipeline @nestjs/cqrs zod
```

**Peer dependencies:**

```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata
```

Απαιτεί Zod `^4.3.0` ή `^3.24.0`, NestJS `^12.1.0` και Node.js 22.12 ή νεότερο.

---

## ZodValidationBehavior <a id="zodvalidationbehavior"></a>

Ένα pipeline behavior που αναλύει (parses) το εισερχόμενο αίτημα έναντι ενός Zod schema όταν ένα τέτοιο είναι προσαρτημένο στην κλάση του αιτήματος μέσω της στατικής ιδιότητας `_zodSchema`. Όταν το parsing επιτύχει με αποτέλεσμα αντικειμένου (object), το υφιστάμενο αντικείμενο αιτήματος ενημερώνεται επιτόπου (in-place) ώστε να ταυτίζεται με τα αναλυμένα δεδομένα πριν εκτελεστεί το επόμενο behavior/handler.

### Καθολική Δήλωση <a id="global-registration"></a>

Δηλώστε το μία φορά — κάθε command, query, και event με ιδιότητα `_zodSchema` αναλύεται αυτόματα:

Τοποθετήστε το validation στο καθολικό `before` πριν από behaviors των οποίων οι αποφάσεις authorization,
rate-limit, cache, ή idempotency εξαρτώνται από τιμές του αιτήματος. Τα καθολικά
`after` behaviors εκτελούνται μετά από behaviors ειδικά για τον handler, επομένως το validation εκεί
θα εξέθετε ανεπεξέργαστο input σε αυτές τις πολιτικές.

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@cqrs-ddd/nestjs';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: [
        {
          scope: 'all',
          before: [ZodValidationBehavior],
        },
      ],
    }),
  ],
  providers: [
    ZodValidationBehavior,
  ],
})
export class AppModule {}
```

### Δήλωση ανά Handler <a id="per-handler-registration"></a>

Χρησιμοποιήστε το `@UsePipeline` για να προσθέσετε validation/parsing αποκλειστικά σε συγκεκριμένους handlers:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@CommandHandler(CreateUserCommand)
@UsePipeline(ZodValidationBehavior)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // Εάν το command διαθέτει _zodSchema και το parsing αποτύχει, πετάγεται ZodValidationError
    // πριν εκτελεστεί αυτός ο κώδικας. Επιτυχής έξοδος plain-object έχει ήδη αντιγραφεί
    // πίσω πάνω σε αυτό το ίδιο αντικείμενο command.
    return this.userRepository.create(command);
  }
}
```

### Πώς Λειτουργεί <a id="how-it-works"></a>

1. Το `ZodValidationBehavior` διαβάζει το `context.requestType._zodSchema` (ένα `ZodType`).
2. Εάν δεν υπάρχει schema (π.χ. μια απλή κλάση event, ή ένας τύπος αιτήματος που δεν φέρει κανένα), είναι no-op — απλώς καλεί το `next()`.
3. Εάν το αίτημα έχει ήδη αναλυθεί με αυτό το ίδιο schema και τα αναλυμένα πεδία του παραμένουν αμετάβλητα, το behavior προχωρά άμεσα στο `next()`. Αυτό αποτρέπει την επανεκτέλεση ενός μη-idempotent transform πάνω στη δική του έξοδο.
4. Διαφορετικά, περιμένει το `schema.safeParseAsync(context.request)`. Σε περίπτωση αποτυχίας πετάει `ZodValidationError` με δομημένες λεπτομέρειες.
5. Σε περίπτωση επιτυχίας, το υφιστάμενο αντικείμενο αιτήματος ενημερώνεται επιτόπου ώστε να ταιριάζει με το `result.data`: κλειδιά που το schema δεν παράγει πλέον αφαιρούνται, και στη συνέχεια ανατίθενται οι αναλυμένες/εξαναγκασμένες/προεπιλεγμένες τιμές.

Αυτό σημαίνει ότι transforms, μετατροπές τύπων (coercions), προεπιλογές (defaults), και αφαίρεση περιττών κλειδιών αντικειμένου που εκτελούνται από το schema είναι ορατά στα μεταγενέστερα behaviors και στον handler· το behavior δεν περιορίζεται μόνο σε επικύρωση.

**Ποια κλειδιά μπορούν να αφαιρεθούν.** Κατά την πρώτη ανάλυση ενός αιτήματος που το behavior δεν
έχει ξαναδεί — ένα απλό αντικείμενο, ή μια χειροκίνητη κλάση που φέρει `_zodSchema` — κάθε
κλειδί που το schema δεν διατηρεί αφαιρείται, οπότε άγνωστο input δεν φτάνει ποτέ στον handler.
Μόλις ένα αίτημα αναλυθεί (από το behavior, ή από παραγόμενο constructor), παρακολουθούνται μόνο
τα πεδία που παρήγαγε το ίδιο το schema: επανελέγχονται για μεταβολές και αφαιρούνται εάν μια μεταγενέστερη ανάλυση τα παραλείπει. Πεδία που κατέχει η κλάση αιτήματος — ιδιότητες
βασικής κλάσης, πεδία υποκλάσης, μη αριθμήσιμα CQRS metadata όπως το `sessionUser` — ούτε
επικυρώνονται ούτε αφαιρούνται.

**Μεταβολή αιτήματος μετά την κατασκευή.** Η τροποποίηση ενός πεδίου που ανήκει στο schema σηματοδοτεί το
αίτημα για επανάλυση (re-parsing), και αυτή η επανάλυση εκτελεί το schema πάνω στο *αναλυμένο* payload,
όχι στο αρχικό input. Για ένα schema του οποίου ο τύπος εξόδου διαφέρει από τον τύπο εισόδου
(`z.string().transform(Number)`, μετασχηματισμός `Uint8Array`, branded object), αυτό το
δεύτερο πέρασμα μπορεί θεμιτά να αποτύχει. Κατασκευάστε νέο αίτημα αντί να μεταβάλλετε ένα ήδη αναλυμένο
όταν το schema δεν είναι σταθερό μεταξύ εισόδου και εξόδου.

Ασύγχρονα refinements και transforms υποστηρίζονται από το `ZodValidationBehavior` και
από το `StandardSchemaValidationPipe` του Nest, τα οποία τα αναμένουν (await). Οι constructors κλάσεων
που παράγονται από τα `createCommand()` και `createQuery()` χρησιμοποιούν
`safeParse()` και επομένως επικυρώνουν σύγχρονα.

Για ένα schema με ασύγχρονα refinements ή transforms, κατασκευάστε το instance με τη
στατική μέθοδο `parseAsync()` που παράγεται αυτόματα. Το behavior και το pipe εκτελούνται *μετά*
την κατασκευή, οπότε δεν μπορούν να διασώσουν έναν constructor που πετάει
"Encountered Promise during synchronous parse":

```typescript
const RegisterSchema = z.object({
  email: z.string().refine(async (value) => isUnique(value), 'already taken'),
});
class RegisterCommand extends createCommand(RegisterSchema) {}

// Πετάει σφάλμα: το schema δεν μπορεί να αναλυθεί σύγχρονα.
new RegisterCommand({ email });

// Επικυρώνει ασύγχρονα, και στη συνέχεια κατασκευάζει το instance.
const command = await RegisterCommand.parseAsync({ email });
```

Η `parseAsync()` πετάει το ίδιο `ZodValidationError` με τον constructor, εφαρμόζει
τον ίδιο έλεγχο μορφής εξόδου, και προωθεί τα ορίσματα του constructor της βασικής κλάσης.

---

## Δημιουργία Validated Commands, Queries, και Events <a id="creating-validated-commands-queries-and-events"></a>

### Factories createCommand() και createQuery() <a id="createcommand-and-createquery-factories"></a>

Αντί να γράφετε επαναλαμβανόμενες boilerplate κλάσεις με χειροκίνητη επικύρωση στον constructor, το `@nestjs-pipeline/zod` παρέχει πρώτης τάξεως συναρτήσεις-factories `createCommand()` και `createQuery()`.

Αυτά τα factories αυτόματα:
- Προσαρτούν το Zod schema ως στατικό `_zodSchema` (για το `ZodValidationBehavior`) και `schema`.
- Σημειώνουν την παραγόμενη κλάση με `requestKind = 'command'` ή `requestKind = 'query'`.
- Προωθούν την προδιαγραφή **Standard Schema** (`~standard`) για διαλειτουργικότητα σχημάτων.
- Παρέχουν στατικές μεθόδους `parse()` και `safeParse()` στην κλάση.
- Αναθέτουν ιδιότητες με ασφάλεια μέσω `[[DefineOwnProperty]]` (`Object.defineProperty`), διασφαλίζοντας ότι δημιουργούνται ίδιες αριθμήσιμες ιδιότητες χωρίς να επισκιάζονται από prototype getters, διατηρώντας καθαρή σειριοποίηση JSON και fingerprints idempotency.

**Χρήση — Command:**

```typescript
// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

export class CreateUserCommand extends createCommand(schema) {}

// Αυτόματη επικύρωση κατά την κατασκευή:
const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
cmd.username // → 'jane'
cmd.email    // → 'jane@example.com'

// Πετάει ZodValidationError σε μη έγκυρο input:
new CreateUserCommand({ username: 'ab', email: 'not-an-email' });
```

**Χρήση — Query:**

```typescript
// get-user.query.ts
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  userId: z.uuid(),
});

export class GetUserQuery extends createQuery(schema) {}
```

### Επέκταση Βασικής Κλάσης <a id="extending-a-base-class"></a>

Τόσο το `createCommand()` όσο και το `createQuery()` δέχονται μια προαιρετική βασική κλάση ως δεύτερο όρισμα. Τα ορίσματα του constructor της βασικής κλάσης προωθούνται διαφανώς μέσω `super(...baseArgs)`:

```typescript
// Μια βασική κλάση που ορίζει η εφαρμογή
export abstract class AppCommand {
  constructor(public readonly sessionUser?: SessionUser) {}
}

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

export class CreateUserCommand extends createCommand(CreateUserSchema, AppCommand) {}

// Κατασκευή με payload και προαιρετικά ορίσματα βασικής κλάσης:
const cmd = new CreateUserCommand(
  { name: 'Alice', email: 'alice@example.com' },
  sessionUser, // προωθείται στον constructor του AppCommand
);

expect(cmd.name).toBe('Alice');
expect(cmd.sessionUser).toBe(sessionUser);
expect(cmd instanceof AppCommand).toBe(true);
expect(cmd instanceof CreateUserCommand).toBe(true);
```

### Ενημερώσιμα Πεδία (Updatable Fields) <a id="updatable-fields"></a>

Σημειώστε κάθε πεδίο που αλλάζει ένα command ενημέρωσης με το `updatable`, μέσα στο schema.
Το `createCommand()` παραθέτει τα επισημασμένα πεδία του αντικειμένου ανωτάτου επιπέδου ως στατικό,
παγωμένο (frozen) `updatableFields`, με τη σειρά ορισμού: η λίστα πεδίων που μεταβιβάζεται στην εξουσιοδότηση
σε επίπεδο πεδίου:

```typescript
import { createCommand, updatable } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class UpdateUserCommand extends createCommand(
  z.object({
    id: z.uuid(),
    username: z.string().trim().apply(updatable).min(3).optional(),
    department: z.string().trim().min(3).apply(updatable).nullable().optional(),
  }),
) {}

UpdateUserCommand.updatableFields; // ['username', 'department']
```

Μέσα στον handler, εξουσιοδοτήστε μόνο τα επισημασμένα πεδία που απέστειλε πραγματικά ο καλών, για παράδειγμα
με το `CaslAuthorizer` από το `@nestjs-pipeline/casl`:

```typescript
@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    private readonly users: UserRepository,
    private readonly authorizer: CaslAuthorizer,
  ) {}

  async execute(command: UpdateUserCommand): Promise<void> {
    const user = await this.users.findById(command.id);
    const changed = UpdateUserCommand.updatableFields.filter(
      (field) => command[field] !== undefined,
    );
    this.authorizer.authorize('update', user, changed);
    user.update(command);
  }
}
```

- Το `.apply(updatable)` μπορεί να τοποθετηθεί οπουδήποτε στην αλυσίδα του πεδίου, και το `updatable(schema)` λειτουργεί
  ως συνάρτηση. Η σήμανση επιβιώνει από μετέπειτα ελέγχους και wrappers (`.min()`, `.optional()`,
  `.nullable()`, `.default()`, `.transform()`) και `.partial()`, `.pick()` ή `.extend()`
  πάνω στο αντικείμενο.
- **Ένα πεδίο χωρίς τη σήμανση δεν περιλαμβάνεται ποτέ στο `updatableFields`, οπότε η εξουσιοδότηση επιπέδου πεδίου
  δεν το βλέπει ποτέ.** Σημειώστε κάθε πεδίο που εγγράφει ο handler· το `id`, το οποίο επιλέγει το aggregate, παραμένει χωρίς σήμανση.
- Διαβάζεται μόνο το αντικείμενο ανωτάτου επιπέδου, καθώς και μέσω ενός top-level `.transform()`: σημάνσεις σε
  εμφωλευμένα αντικείμενα, πίνακες ή unions δεν καταγράφονται. Το `updatableFieldsOf(schema)` επιστρέφει την
  ίδια λίστα για schema που χρησιμοποιείται χωρίς το `createCommand()`.
- Η σήμανση διατηρείται σε ιδιωτικό μητρώο του πακέτου. Δεν αλλάζει την επικύρωση ή την
  έξοδο, δεν εμφανίζεται ποτέ στην έξοδο του `z.toJSONSchema()`, και ορίζεται σε αντίγραφο, ώστε ένα
  schema πεδίου που μοιράζεται με άλλα commands να παραμένει χωρίς σήμανση.

### Metadata Standard Schema <a id="standard-schema-metadata"></a>

Κάθε κλάση που παράγεται από τα `createCommand()`, `createQuery()`, ή `createZodRequest()` προωθεί τα metadata [Standard Schema](https://standard-schema.dev/) (`~standard`) του schema.

Αυτά τα metadata είναι σκόπιμα διαλειτουργικά μεταξύ frameworks. Το δηλωμένο και ελεγμένο Nest peer για το `@nestjs-pipeline/zod` είναι το NestJS `^12.1.0`. Επεκτείνετε το εύρος peer μόνο αφού ο πίνακας συμβατότητας καλύψει τη νέα major έκδοση.

### Στατικά parse() και safeParse() <a id="static-parse-and-safeparse"></a>

Κάθε παραγόμενη κλάση εκθέτει εργονομικές στατικές μεθόδους parsing που κατασκευάζουν πολυμορφικά την υποκλάση:

```typescript
// Επιστρέφει instance του CreateUserCommand ή πετάει ZodValidationError:
const cmd = CreateUserCommand.parse(rawInput, sessionUser);

// Επιστρέφει το ασφαλές αποτέλεσμα parsing του Zod (δεν κατασκευάζεται instance) χωρίς να πετάει σφάλμα:
const result = CreateUserCommand.safeParse(rawInput);
if (result.success) {
  console.log('Έγκυρα δεδομένα:', result.data);
} else {
  console.error('Ζητήματα επικύρωσης:', result.error.issues);
}
```

### Βοηθητικά Εξαγωγής Τύπων (InferInput, InferOutput) <a id="type-inference-helpers-inferinput-inferoutput"></a>

Εξάγετε εύκολα τύπους TypeScript απευθείας από την κλάση command/query χωρίς επανεξαγωγή ή εισαγωγή του αρχικού schema:

```typescript
import type { InferInput, InferOutput } from '@nestjs-pipeline/zod';
import { CreateUserCommand } from './create-user.command';

// Τύπος εισόδου (αυτό που δέχεται ο constructor ή το endpoint του API):
type CreateUserDto = InferInput<typeof CreateUserCommand>;

// Τύπος εξόδου (το αναλυμένο/μετασχηματισμένο payload του instance):
type CreateUserPayload = InferOutput<typeof CreateUserCommand>;
```

### Χειροκίνητη Προσάρτηση Schemas <a id="attaching-schemas-manually"></a>

Για κλάσεις συμβάντων (ή οποιαδήποτε κλάση) που δεν χρησιμοποιούν το `createZodRequest()`, προσαρτήστε το schema με το `ZOD_SCHEMA_KEY`:

```typescript
import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const userCreatedSchema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
});

export class UserCreatedEvent {
  static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;

  constructor(
    public readonly userId: string,
    public readonly username: string,
    public readonly email: string,
  ) {}
}
```

---

## Nest Schema Validation <a id="nest-schema-validation"></a>

Το Nest 12 επικυρώνει ορίσματα routes έναντι ενός Standard Schema, και τα Zod 4 schemas αποτελούν
Standard Schemas: περάστε `{ schema }` στα `@Body()`, `@Param()` ή `@Query()` και δηλώστε το
`StandardSchemaValidationPipe` του Nest μία φορά, με το `zodBadRequest` ως το
`exceptionFactory` του. Σε αποτυχία, αποκρίνεται με HTTP 400 και σώμα `{ formErrors, fieldErrors }`,
το ίδιο σώμα με το `createZodMapper`.

```typescript
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
```

- Το όρισμα είναι η έξοδος του schema, συμπεριλαμβανομένων των αποτελεσμάτων `.transform()`· ασύγχρονα
  refinements και transforms αναμένονται κανονικά.
- Μια παράμετρος που δηλώνεται με `{ schema }` επικυρώνεται μόνο εκεί όπου έχει δηλωθεί το pipe.
  Δηλωμένο ως `APP_PIPE`, καλύπτει κάθε εφαρμογή που χτίζεται από το module, συμπεριλαμβανομένων των tests.
  Μια παράμετρος χωρίς `schema` διέρχεται αμετάβλητη.
- Το Nest επικυρώνει custom parameter decorators μόνο όταν το pipe δημιουργείται με
  `validateCustomDecorators: true`.

### Validation στο Body <a id="body-validation"></a>

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({
  name: z.string().min(5),
  email: z.email(),
});
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

@Controller('users')
export class UsersController {
  @Post()
  createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }
}
```

Ο τύπος TypeScript της παραμέτρου δεν εξάγεται αυτόματα από το schema· δηλώστε τον ως τον
τύπο εξόδου του schema (`z.output<typeof Schema>`, ή `z.infer`).

### Validation σε παραμέτρους (Param) <a id="param-validation"></a>

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';

const UserIdSchema = z.uuid();

@Controller('users')
export class UsersController {
  @Get(':id')
  getUser(@Param('id', { schema: UserIdSchema }) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

Μια αποτυχημένη τιμή χωρίς διαδρομή πεδίου, όπως ένα κακοσχηματισμένο id, καταγράφεται κάτω από
το `formErrors`.

### Transform Schemas <a id="transform-schemas"></a>

Χρησιμοποιήστε Zod transforms για επικύρωση και χαρτογράφηση ενός DTO σε ένα μόνο βήμα:

```typescript
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

@Post()
createUser(@Body({ schema: CreateUserMapperSchema }) command: CreateUserCommand) {
  return this.commandBus.execute(command);
}
```

### Εξαναγκασμός Τύπων στο Query-String <a id="query-string-coercion"></a>

Οι τιμές του query-string φτάνουν ως strings· εξαναγκάστε τες (coerce) μέσα στο schema:

```typescript
const ListUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  department: z.string().optional(),
});

@Get()
listUsers(@Query({ schema: ListUsersSchema }) query: z.output<typeof ListUsersSchema>) {
  return this.queryBus.execute(new ListUsersQuery(query));
}
```

---

## createZodMapper <a id="createzodmapper"></a>

Το `createZodMapper(schema)` επιστρέφει `{ schema, map(input) }`: έναν mapper επιπέδου controller που
αναλύει ένα επικυρωμένο DTO στην τιμή που εξάγει το schema, συνήθως ένα application command.

```typescript
import { createZodMapper } from '@nestjs-pipeline/zod';

export const CreateUserMapper = createZodMapper(
  CreateUserDtoSchema.transform(
    ({ name, email }) => new CreateUserCommand({ username: name, email }),
  ),
);

@Post()
create(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
  return this.commandBus.execute(CreateUserMapper.map(dto));
}
```

- Το `map()` αναλύει σύγχρονα, επομένως το schema δεν πρέπει να χρησιμοποιεί ασύγχρονα refinements ή
  transforms· επικυρώστε αυτά ως `schema` παραμέτρου διαδρομής
  ([Nest Schema Validation](#nest-schema-validation)).
- Σε αποτυχία πετάει το `BadRequestException` του `zodBadRequest` (`formErrors`,
  `fieldErrors`), το σώμα με το οποίο απαντά το pipe του Nest, ώστε οι πελάτες να λαμβάνουν ενιαία μορφή 400.
- Το `schema` εκτίθεται για επαναχρησιμοποίηση, για παράδειγμα `CreateUserMapper.schema.extend(...)`.

---

## ZodValidationFilter <a id="zodvalidationfilter"></a>

Ένα NestJS `ExceptionFilter` που συλλαμβάνει το `ZodValidationError` (που πετάγεται από το `ZodValidationBehavior` ή από έναν constructor `createZodRequest()`) και το αντιστοιχίζει σε απόκριση HTTP 400.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }],
})
export class AppModule {}
```

Το Nest κάνει inject το `HttpAdapterHost` του, και το φίλτρο απαντά μέσω αυτού του adapter, οπότε
λειτουργεί με Express και Fastify, καθώς και για σφάλματα που ρίχνονται σε middleware. Για να το δηλώσετε στο
`main.ts`, περάστε τον host:
`app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)))`.

**Μορφή απόκρισης** (HTTP 400):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email address"],
      "username": ["Too small: expected string to have >=4 characters"]
    }
  }
}
```

---

## ZodValidationError <a id="zodvalidationerror"></a>

Μια κλάση σφάλματος ανεξάρτητη από framework που εκπέμπεται όταν αποτυγχάνει η επικύρωση Zod. Φέρει δομημένες λεπτομέρειες `details` από το `ZodError.flatten()`.

```typescript
import { ZodValidationError } from '@nestjs-pipeline/zod';

try {
  new CreateUserCommand({ username: 'ab', email: 'bad' });
} catch (error) {
  if (error instanceof ZodValidationError) {
    console.log(error.message);   // 'Validation failed'
    console.log(error.details);   // { formErrors: [], fieldErrors: { ... } }
  }
}
```

Μπορείτε να γράψετε ένα προσαρμοσμένο exception filter για να διαχειριστείτε το `ZodValidationError` διαφορετικά:

```typescript
import { Catch, ExceptionFilter, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ZodValidationError } from '@nestjs-pipeline/zod';

@Catch(ZodValidationError)
export class CustomValidationFilter implements ExceptionFilter {
  catch(exception: ZodValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: 422,
      errors: exception.details.fieldErrors,
    });
  }
}
```

---

## Ανάγνωση Ακατέργαστου Input και Επικυρωμένων Δεδομένων <a id="reading-raw-input-and-parsed-data"></a>

Ένας παραγόμενος constructor καταγράφει το input με το οποίο κλήθηκε και το αναλυμένο payload.
Και τα δύο είναι αναγνώσιμα χωρίς να εκτίθενται ως αριθμήσιμα πεδία:

```typescript
import { getRawInput, getValidatedData } from '@nestjs-pipeline/zod';

const schema = z.object({
  email: z.string().trim().toLowerCase(),
  nickname: z.preprocess((v) => v ?? undefined, z.string().optional()),
});
class RegisterCommand extends createCommand(schema) {}

const command = new RegisterCommand({ email: '  Jane@Example.com ', nickname: null });

getRawInput<{ nickname: unknown }>(command)?.nickname; // null — ο καλών το έστειλε ρητά
command.email;                                          // 'jane@example.com'
getValidatedData(command)?.email;                       // 'jane@example.com' (παγωμένο αντίγραφο)
```

- Το `getRawInput()` επιστρέφει το αρχικό input με αναφορά (by reference)· μην το μεταβάλλετε.
- Το `getValidatedData()` επιστρέφει `undefined` για αίτημα που δεν αναλύθηκε ποτέ, και ένα νέο
  παγωμένο αντίγραφο σε κάθε κλήση.

---

## Πλήρες Παράδειγμα <a id="full-example"></a>

Μια πλήρης εγκατάσταση από το module μέχρι τον controller:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule, LoggingBehavior } from '@nestjs-pipeline/core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [LoggingBehavior, ZodValidationBehavior],
      },
    }),
    UsersModule,
  ],
})
export class AppModule {}

// main.ts
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)));
  await app.listen(3000);
}
bootstrap();

// create-user.command.ts
import { createCommand, createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

export class CreateUserCommand extends createCommand(
  z.object({
    username: z.string().min(4),
    email: z.email(),
  }),
) {}

export class GetUserQuery extends createQuery(z.object({ userId: z.uuid() })) {}

// create-user.dto.ts
import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  name: z.string().min(5),
  email: z.email(),
});
export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

// create-user.mapper.ts
import { createZodMapper } from '@nestjs-pipeline/zod';

export const CreateUserMapper = createZodMapper(
  CreateUserDtoSchema.transform(
    ({ name, email }) => new CreateUserCommand({ username: name, email }),
  ),
);

// create-user.handler.ts
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';

@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    return this.userRepository.create(command.username, command.email);
  }
}

// users.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
    return this.commandBus.execute(CreateUserMapper.map(dto));
  }

  @Get(':id')
  getUser(@Param('id', { schema: z.uuid() }) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

---

## Αναφορά API <a id="api-reference"></a>

| Export | Τύπος | Περιγραφή |
|---|---|---|
| `createCommand(schema, Base?)` | Συνάρτηση | Παράγει μια επικυρωμένη κλάση CQRS Command με ετικέτα `requestKind: 'command'`, `~standard`, και στατικά `parse()`/`safeParse()` |
| `createQuery(schema, Base?)` | Συνάρτηση | Παράγει μια επικυρωμένη κλάση CQRS Query με ετικέτα `requestKind: 'query'`, `~standard`, και στατικά `parse()`/`safeParse()` |
| `updatable(schema)` | Συνάρτηση | Σημειώνει ένα πεδίο command ως updatable· χρησιμοποιείται ως `.apply(updatable)`. Το `createCommand()` παραθέτει τα επισημασμένα πεδία ως `updatableFields` |
| `updatableFieldsOf(schema)` | Συνάρτηση | Τα πεδία αντικειμένου ανωτάτου επιπέδου επισημασμένα με `updatable`, παγωμένα (frozen), κατά τη σειρά διάταξης |
| `createZodRequest(schema, Base?)` | Συνάρτηση | Γενικό factory που παράγει μια επικυρωμένη κλάση Request με προώθηση `~standard` και στατικούς parsers |
| `type InferInput<T>` | Τύπος | Εξάγει τον τύπο εισόδου DTO που δέχεται μια παραγόμενη κλάση command/query |
| `type InferOutput<T>` | Τύπος | Εξάγει το αναλυμένο/μετασχηματισμένο payload εξόδου μιας παραγόμενης κλάσης command/query |
| `type AbstractConstructor<T>` | Τύπος | Η μορφή βασικής κλάσης που δέχονται τα `createCommand`, `createQuery` και `createZodRequest` ως `Base` |
| `ZodValidationBehavior` | Κλάση | Pipeline behavior — αναλύει το `_zodSchema` και εφαρμόζει επιτυχή έξοδο plain-object στο υφιστάμενο αίτημα |
| `ZodValidationError` | Κλάση | Σφάλμα με `details` από το `ZodError.flatten()` |
| `ZodValidationFilter` | Κλάση | Exception filter — συλλαμβάνει το `ZodValidationError` → HTTP 400 |
| `createZodMapper` | Συνάρτηση | Mapper επιπέδου controller `{ schema, map(input) }`· αποτυχίες → `BadRequestException` του `zodBadRequest` |
| `ZodMapper` | Interface | Ο mapper που επιστρέφει το `createZodMapper` |
| `zodBadRequest(issues)` | Συνάρτηση | `exceptionFactory` για το `StandardSchemaValidationPipe` του Nest: ένα `BadRequestException` με το σώμα `{ formErrors, fieldErrors }` που παράγει το `flatten()` του Zod |
| `ZOD_SCHEMA_KEY` | `'_zodSchema'` | Κλειδί για την προσάρτηση schemas σε κλάσεις αιτημάτων |
| `getRawInput(request)` | Συνάρτηση | Επιστρέφει, με αναφορά, το input με το οποίο κλήθηκε ένας παραγόμενος constructor — συμπεριλαμβανομένου ρητού `null` ή `undefined` που αντικατέστησε η προεπεξεργασία. Επιστρέφει το ίδιο το αίτημα όταν δεν καταγράφηκε input |
| `getValidatedData(request)` | Συνάρτηση | Επιστρέφει ένα παγωμένο, αποσυνδεδεμένο αντίγραφο του αναλυμένου payload που φέρει ένα αίτημα, ή `undefined` όταν δεν έχει αναλυθεί ποτέ. Κάθε κλήση επιστρέφει νέο αντίγραφο, οπότε η μεταβολή του δεν επηρεάζει την επικύρωση |
| `ZOD_RAW_INPUT_KEY` | `symbol` | Symbol που διαβάζει επίσης το `getRawInput()`, για αιτήματα που παράγονται εκτός αυτού του πακέτου |
| `ZOD_VALIDATED_DATA_KEY` | `symbol` | Symbol που διαβάζει επίσης το `getValidatedData()`. Μόνο αναγνώσιμα metadata — η προσάρτησή του **δεν** επισημαίνει ένα αίτημα ως επικυρωμένο, και το behavior εξακολουθεί να αναλύει τέτοιο αίτημα |

Κάθε παραγόμενη κλάση εκθέτει επιπλέον τα `parse(input, ...baseArgs)`,
`parseAsync(input, ...baseArgs)`, `safeParse(input)`, `schema`, και `~standard`·
τα `createCommand()` και `createQuery()` προσθέτουν το `requestKind`, και το `createCommand()` προσθέτει
το `updatableFields`. Οι τύποι των κλάσεων
(`ZodRequestClass`, `ZodCommandClass`, `ZodQueryClass`) εξάγονται για
καταναλωτές που χρειάζεται να τους κατονομάσουν.

---

## Μετάβαση από την έκδοση 0.2.x <a id="migrating-from-02x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.3.0. Για να φτάσετε στην 0.4.0, συνεχίστε με την
[Αναβάθμιση από 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) στο README του repository.

**Peers και runtime.** NestJS `^12.1.0`, `@nestjs-pipeline/core` `^0.3.0`, Node.js 22.12 ή
νεότερο.

```bash
pnpm add @nestjs/common@^12.1.0 @nestjs/core@^12.1.0 @nestjs-pipeline/core@^0.3.0 @nestjs-pipeline/zod@^0.3.0
```

**Το `ZodPipe` καταργήθηκε.** Δηλώστε το schema στην παράμετρο και δηλώστε το
`StandardSchemaValidationPipe` του Nest μία φορά με το `zodBadRequest` (δείτε
το [Nest Schema Validation](#nest-schema-validation))· το σώμα 400 παραμένει αμετάβλητο.

```typescript
// 0.2.x
getUser(@Param('id', new ZodPipe(UserIdSchema)) id: string) {}

// 0.3.0
getUser(@Param('id', { schema: UserIdSchema }) id: string) {}
```

---

## Μετάβαση από την έκδοση 0.1.x <a id="migrating-from-01x"></a>

Αυτά τα βήματα οδηγούν στην έκδοση 0.2.0. Για να φτάσετε στην 0.4.0, συνεχίστε με τη
[Μετάβαση από την έκδοση 0.2.x](#migrating-from-02x).

**1. Peers και runtime.** Το `zod` πρέπει να είναι `^4.3.0` (ήταν `^4.0.0`), το `@nestjs/common`
`^11.0.0` (ήταν `>=10`), το `@nestjs-pipeline/core` `^0.2.0`, και Node.js 22 ή νεότερο.

```bash
pnpm add zod@^4.3.0 @nestjs/common@^11 @nestjs-pipeline/core@^0.2.0 @nestjs-pipeline/zod@^0.2.0
```

**2. Το `ZOD_SCHEMA` καταργήθηκε.** Ήταν deprecated alias· χρησιμοποιήστε το `ZOD_SCHEMA_KEY`.

```typescript
// 0.1.x
import { ZOD_SCHEMA } from '@nestjs-pipeline/zod';
class UserCreatedEvent {
  static readonly [ZOD_SCHEMA] = userCreatedSchema;
}

// 0.2.0
import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
class UserCreatedEvent {
  static readonly [ZOD_SCHEMA_KEY] = userCreatedSchema;
}
```

**3. Το behavior εφαρμόζει πλέον την αναλυμένη έξοδο στο αίτημα.** Στην 0.1.x
το `ZodValidationBehavior` πραγματοποιούσε μόνο validation· ο handler λάμβανε το αίτημα αμετάβλητο. Στην
0.2.0 transforms, coercions και defaults εγγράφονται πίσω στο ίδιο αντικείμενο αιτήματος,
και κλειδιά που αφαιρεί το schema διαγράφονται από αυτό.

```typescript
const schema = z.object({ email: z.string().trim().toLowerCase() });
class InviteCommand {
  static readonly [ZOD_SCHEMA_KEY] = schema;
  constructor(public email: string, public debug?: boolean) {}
}

// Αποστέλλεται ως new InviteCommand('  Jane@Example.com ', true):
// Ο 0.1.x handler βλέπει { email: '  Jane@Example.com ', debug: true }
// Ο 0.2.0 handler βλέπει { email: 'jane@example.com' }   — το `debug` αφαιρείται
```

Εάν ένας handler βασιζόταν σε πεδίο που το schema δεν δηλώνει, προσθέστε το στο schema (ή χρησιμοποιήστε
`.passthrough()`/`.loose()`), ή κατασκευάστε το αίτημα με `createCommand(schema, Base)` ώστε
να διατηρούνται τα πεδία της βασικής κλάσης.

**4. Η αναλυμένη έξοδος πρέπει να είναι απλό αντικείμενο (plain object).** Ένα schema προσαρτημένο σε κλάση αιτήματος του οποίου
η έξοδος ανωτάτου επιπέδου δεν είναι plain object (για παράδειγμα `.transform(() => new Foo())`, ένας
πίνακας ή μια πρωταρχική τιμή) πλέον πετάει `TypeError` στο behavior· η 0.1.x το δεχόταν επειδή
η έξοδος απορριπτόταν. Το behavior πετάει επίσης `TypeError` όταν το ίδιο το αίτημα δεν είναι
αντικείμενο. Κρατήστε transforms που παράγουν κλάσεις στο `schema` μιας παραμέτρου διαδρομής ή στο
`createZodMapper`.

**5. Async schemas.** Τα `ZodValidationBehavior` και `ZodPipe` χρησιμοποιούν πλέον `safeParseAsync`, οπότε
τα async refinements λειτουργούν κανονικά· η 0.1.x πετούσε σφάλμα σε αυτά. Το `ZodPipe.transform()` επιστρέφει promise,
το οποίο αναμένει το Nest· κώδικας που καλεί απευθείας το `transform()` πρέπει να το αναμένει (await).

```typescript
// 0.1.x
const id = new ZodPipe(z.uuid()).transform(rawId); // rawId: string
// 0.2.0
const id = await new ZodPipe(z.uuid()).transform(rawId); // rawId: string
```

Ο τύπος schema του `ZodPipe` είναι πλέον `ZodType<TOutput, TInput>`, επομένως ο τύπος εισόδου του ελέγχεται
έναντι του δηλωμένου `TInput`.

**6. Χειροκίνητες κλάσεις αιτημάτων μπορούν να γίνουν παραγόμενες (προαιρετικά).**

```typescript
// 0.1.x
const schema = z.object({ id: z.uuid(), username: z.string().min(3).optional() });
export class UpdateUserCommand {
  static readonly [ZOD_SCHEMA] = schema;
  readonly id: string;
  readonly username?: string;
  constructor(input: z.input<typeof schema>) {
    const data = schema.parse(input);
    this.id = data.id;
    this.username = data.username;
  }
}

// 0.2.0
export class UpdateUserCommand extends createCommand(
  z.object({ id: z.uuid(), username: z.string().min(3).apply(updatable).optional() }),
) {}
UpdateUserCommand.updatableFields; // ['username']
```

Ένας παραγόμενος constructor πετάει `ZodValidationError` (όχι `ZodError`), το οποίο
το `ZodValidationFilter` αντιστοιχίζει σε HTTP 400.

**7. Το `ZodValidationFilter` υποστηρίζει Fastify.** Καλεί `response.send()` όταν
το `response.json()` απουσιάζει· το σώμα παραμένει αμετάβλητο.

---

## Παρουσία Ιδιοτήτων (Property Presence) <a id="property-presence"></a>

Η παραγόμενη κατασκευή (συμπεριλαμβανομένου του `parseAsync()`) και η επανάλυση του behavior ορίζουν
κάθε ίδια αριθμήσιμη ιδιότητα που επιστρέφει το Zod, συμπεριλαμβανομένων κλειδιών των οποίων η αναλυμένη τιμή είναι
`undefined`. Ένα κλειδί που το schema παραλείπει εντελώς παραμένει απόν. Έτσι τα `Object.hasOwn()`,
`Object.keys()`, και τα fingerprints cache/idempotency αναγνωρίζουν ένα ρητό πεδίο `undefined`
ως υπαρκτό· το `JSON.stringify()` εξακολουθεί να το παραλείπει βάσει των δικών του κανόνων.

Τα Prototypes και τα πεδία βασικής κλάσης διατηρούνται, και ένα ίδιο κλειδί `__proto__` στην
αναλυμένη έξοδο ορίζεται ως απλή ιδιότητα δεδομένων αντί να επαναπροσδιορίζει το
prototype.

---

## Άδεια χρήσης <a id="license"></a>

Διπλή άδεια χρήσης υπό την **AGPLv3** και **Εμπορική Άδεια (Commercial License)**. Δείτε τα [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) και [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) στη ρίζα για λεπτομέρειες.

Επικοινωνία: **aristotelis@ik.me**
