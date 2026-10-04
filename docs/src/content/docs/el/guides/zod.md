---
title: "Επικύρωση με το Zod"
---

Ολοκληρωμένη ενσωμάτωση του Zod v4 σε κάθε επίπεδο μιας εφαρμογής NestJS CQRS.

## Επικύρωση σε Επίπεδο Pipeline <a id="pipeline-level-validation"></a>

Δηλώστε το `ZodValidationBehavior` καθολικά (globally). Αναλύει οποιαδήποτε κλάση αιτήματος διαθέτει στατική ιδιότητα `_zodSchema` (ορίζεται αυτόματα από τα `createCommand()`, `createQuery()`, ή `createZodRequest()`):

```typescript
// app.module.ts
PipelineModule.forRoot({
  globalBehaviors: {
    scope: 'all',
    before: [ZodValidationBehavior], // normalizes before per-handler behaviors
  },
})

// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

// Generates a self-validating class with static _zodSchema,
// Standard Schema (~standard) metadata, and static parse()/safeParse().
// This repository supports and tests NestJS 12.1.
export class CreateUserCommand extends createCommand(schema) {}
//                                       ↑ attaches schema as static _zodSchema, sets requestKind: 'command'
```

Εάν η ανάλυση αποτύχει, το `ZodValidationBehavior` προκαλεί εξαίρεση `ZodValidationError` με δομημένες λεπτομέρειες από το `ZodError.flatten()`. Σε περίπτωση επιτυχούς εξαγωγής αντικειμένου, ενημερώνει το υπάρχον αντικείμενο αιτήματος ώστε να ταιριάζει με τα αναλυμένα δεδομένα πριν εκτελεστεί το επόμενο behavior/handler: τα κλειδιά που παραλείπονται από το αποτέλεσμα της ανάλυσης αφαιρούνται και οι αναλυμένες, εξαναγκασμένες (coerced), μετασχηματισμένες (transformed), ή προεπιλεγμένες (defaulted) τιμές ανατίθενται στο ίδιο αυτό αίτημα. Το behavior χρησιμοποιεί τον ασύγχρονο αναλυτή του Zod, επομένως υποστηρίζονται ασύγχρονα refinements και transforms.

## Επικύρωση σε Επίπεδο Controller <a id="controller-level-validation"></a>

Δηλώστε ένα σχήμα Zod στα `@Body()`, `@Param()` ή `@Query()` με `{ schema }`· το `StandardSchemaValidationPipe` του Nest, δηλωμένο μία φορά με το `zodBadRequest` ως `exceptionFactory` (δείτε [Δήλωση του Module](/nestjs-pipeline/el/getting-started/#2-register-the-module)), το επικυρώνει, αναμένει τα ασύγχρονα refinements και transforms, και παραδίδει στον handler την έξοδο του σχήματος.
Μια αποτυχία απαντά με HTTP 400 και `{ formErrors, fieldErrors }`:

```typescript
import { z } from 'zod';

// Simple schemas
const CreateUserDtoSchema = z.object({
  email: z.email(),
  name: z.string().min(5),
});
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

const UserIdSchema = z.uuid();

@Controller('users')
export class UsersController {
  // Validate request body
  @Post()
  createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
    return this.commandBus.execute(new CreateUserCommand(dto));
  }

  // Validate route param (UUID format)
  @Get(':id')
  getUser(@Param('id', { schema: UserIdSchema }) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }

  // Validate + transform body
  @Patch(':id')
  updateUser(
    @Param('id', { schema: UserIdSchema }) id: string,
    @Body({ schema: UpdateUserDtoSchema }) dto: UpdateUserDto,
  ) {
    return this.commandBus.execute(UpdateUserMapper.map(id, dto));
  }
}
```

## Zod Transform Mappers (DTO → Command) <a id="zod-transform-mappers-dto--command"></a>

Χρησιμοποιήστε τα Zod transforms για να αντιστοιχίσετε DTOs σε commands σε ένα μόνο βήμα:

```typescript
// create-user.mapper.ts
import { BadRequestException } from '@nestjs/common';
import { CreateUserDtoSchema } from '../dtos/create-user.dto';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';

// Schema that validates a DTO and transforms it into a command
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

export const CreateUserMapper = {
  map(input: CreateUserDto): CreateUserCommand {
    const result = CreateUserMapperSchema.safeParse(input);
    if (!result.success) throw new BadRequestException(result.error.flatten());
    return result.data;
  },
};

// Usage in controller
@Post()
createUser(@Body({ schema: CreateUserDtoSchema }) dto: CreateUserDto) {
  return this.commandBus.execute(CreateUserMapper.map(dto));
}
```

## Διαχείριση Σφαλμάτων με το ZodValidationFilter <a id="error-handling-with-zodvalidationfilter"></a>

Δηλώστε το `ZodValidationFilter` ως καθολικό exception filter για να συλλάβετε το `ZodValidationError` και να επιστρέψετε μια δομημένη HTTP 400 απάντηση. Απαντά μέσω του HTTP adapter του Nest, επομένως δηλώστε το ως provider, όπου το Nest κάνει inject το adapter host:

```typescript
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }],
})
export class AppModule {}
```

Τα ενσωματωμένα φίλτρα των `@nestjs-pipeline/casl`, `/feature-flags`, `/idempotency` και
`/rate-limit` δηλώνονται με τον ίδιο τρόπο.

**Μορφή απάντησης** (HTTP 400):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "email": ["Invalid email"],
      "username": ["String must contain at least 4 character(s)"]
    }
  }
}
```

## Προσάρτηση Σχημάτων σε Απλές Κλάσεις Events <a id="attaching-schemas-to-plain-event-classes"></a>

Κλάσεις events που δεν χρησιμοποιούν το `createZodRequest()` μπορούν να αναλυθούν/επικυρωθούν προσαρτώντας το σχήμα χειροκίνητα:

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
