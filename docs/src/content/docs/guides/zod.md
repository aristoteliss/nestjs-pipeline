---
title: "Validation with Zod"
---

Comprehensive Zod v4 integration at every layer of a NestJS CQRS application.

## Pipeline-Level Validation

Register `ZodValidationBehavior` globally. It parses any request class that has a
static `_zodSchema` property (set automatically by `createCommand()`, `createQuery()`, or `createZodRequest()`):

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

If parsing fails, `ZodValidationBehavior` throws a `ZodValidationError` with
structured details from `ZodError.flatten()`. On successful object output, it
updates the existing request object to match the parsed data before the next
behavior/handler runs: keys omitted by the parsed result are removed and parsed,
coerced, transformed, or defaulted values are assigned to that same request.
The behavior uses Zod's async parser, so asynchronous refinements and
transforms are supported.

## Controller-Level Validation

Declare a Zod schema on `@Body()`, `@Param()` or `@Query()` with `{ schema }`; Nest's
`StandardSchemaValidationPipe`, registered once with `zodBadRequest` as its
`exceptionFactory` (see [Register the Module](/nestjs-pipeline/getting-started/#2-register-the-module)), validates it,
awaits asynchronous refinements and transforms, and hands the handler the schema output.
A failure answers HTTP 400 with `{ formErrors, fieldErrors }`:

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

## Zod Transform Mappers (DTO → Command)

Use Zod transforms to map DTOs to commands in a single step:

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

## Error Handling with ZodValidationFilter

Register `ZodValidationFilter` as a global exception filter to catch `ZodValidationError` and return a structured HTTP 400 response. It replies through Nest's HTTP adapter, so register it as a provider, where Nest injects the adapter host:

```typescript
// app.module.ts
import { APP_FILTER } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

@Module({
  providers: [{ provide: APP_FILTER, useClass: ZodValidationFilter }],
})
export class AppModule {}
```

The bundled filters of `@nestjs-pipeline/casl`, `/feature-flags`, `/idempotency` and
`/rate-limit` register the same way.

**Response format** (HTTP 400):

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

## Attaching Schemas to Plain Event Classes

Event classes that don't use `createZodRequest()` can still be parsed/validated by attaching the schema manually:

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
