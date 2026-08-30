# @nestjs-pipeline/zod

Zod v4 validation and parsing integration for `@nestjs-pipeline/core` — parse commands, queries, and events at the pipeline boundary, validate/transform controller params and bodies with `ZodPipe`, and catch validation errors with `ZodValidationFilter`.

---

## Table of Contents

- [Installation](#installation)
- [ZodValidationBehavior](#zodvalidationbehavior)
  - [Global Registration](#global-registration)
  - [Per-Handler Registration](#per-handler-registration)
  - [How It Works](#how-it-works)
- [Creating Validated Commands, Queries, and Events](#creating-validated-commands-queries-and-events)
  - [The createRequest() Pattern](#the-createrequest-pattern)
  - [Attaching Schemas Manually](#attaching-schemas-manually)
- [ZodPipe](#zodpipe)
  - [Body Validation](#body-validation)
  - [Param Validation](#param-validation)
  - [Transform Schemas](#transform-schemas)
- [ZodValidationFilter](#zodvalidationfilter)
- [ZodValidationError](#zodvalidationerror)
- [Full Example](#full-example)
- [API Reference](#api-reference)
- [License](#license)

---

## Installation

```bash
pnpm add @nestjs-pipeline/zod zod
```

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common
```

---

## ZodValidationBehavior

A pipeline behavior that parses the incoming request against a Zod schema when one is attached to the request class via the `_zodSchema` static property. When parsing succeeds with an object result, the existing request object is updated in place to match the parsed data before the next behavior/handler runs.

### Global Registration

Register once — every command, query, and event with a `_zodSchema` property is automatically parsed:

Place validation in global `before` ahead of behaviors whose authorization,
rate-limit, cache, or idempotency decisions depend on request values. Global
`after` behaviors run after handler-specific behaviors, so validation there
would expose raw input to those policies.

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PipelineModule } from '@nestjs-pipeline/core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@Module({
  imports: [
    CqrsModule.forRoot(),
    PipelineModule.forRoot({
      globalBehaviors: {
        scope: 'all',
        before: [ZodValidationBehavior],
      },
    }),
  ],
})
export class AppModule {}
```

### Per-Handler Registration

Use `@UsePipeline` to add validation/parsing to specific handlers only:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';

@CommandHandler(CreateUserCommand)
@UsePipeline(ZodValidationBehavior)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    // If command has _zodSchema and parsing fails, ZodValidationError is thrown
    // before this code runs. Successful plain-object output has already been copied
    // back onto this same command object.
    return this.userRepository.create(command);
  }
}
```

### How It Works

1. `ZodValidationBehavior` reads `context.requestType._zodSchema` (a `ZodType`).
2. If a schema exists, it awaits `schema.safeParseAsync(context.request)`.
3. On failure, it throws `ZodValidationError` with structured details.
4. On success, if both `result.data` and the request are objects, it mutates the existing request object to match `result.data`: request keys omitted by the parsed result are deleted, then parsed/coerced/defaulted values are assigned.
5. If no schema is present (e.g. a plain event class), it's a no-op — just calls `next()`.

This means transforms, coercions, defaults, and object-key stripping performed by the schema are visible to later behaviors and to the handler; the behavior is not validation-only.

Async refinements and transforms are supported by both `ZodValidationBehavior`
and `ZodPipe`. Consequently, `ZodPipe.transform()` returns a promise (which
NestJS pipes await automatically). The synchronous `createRequest()` example
below still uses `safeParse()` during construction and therefore requires a
synchronous schema.

---

## Creating Validated Commands, Queries, and Events

### The createRequest() Pattern

Build self-validating command/query/event classes using a `createRequest()` helper that attaches the Zod schema automatically:

```typescript
// helpers/createRequest.ts
import { ZodObject, ZodRawShape, z } from 'zod';
import { ZodValidationError } from '@nestjs-pipeline/zod';

export function createRequest<T extends ZodRawShape>(schema: ZodObject<T>) {
  type Input = z.infer<ZodObject<T>>;
  return class {
    static readonly _zodSchema = schema;  // ZodValidationBehavior reads this

    constructor(input: Input) {
      const result = schema.safeParse(input);
      if (!result.success) throw new ZodValidationError(result.error);
      Object.assign(this, result.data);   // typed properties
    }
  };
}
```

**Usage — Command:**

```typescript
// create-user.command.ts
import { z } from 'zod';
import { createRequest } from './helpers/createRequest';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

export interface CreateUserCommand extends z.infer<typeof schema> {}
export class CreateUserCommand extends createRequest(schema) {}

// Auto-validates at construction time:
const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
cmd.username // → 'jane'
cmd.email    // → 'jane@example.com'

// Throws ZodValidationError:
new CreateUserCommand({ username: 'ab', email: 'not-an-email' });
```

**Usage — Query:**

```typescript
// get-user.query.ts
import { z } from 'zod';
import { createRequest } from './helpers/createRequest';

const schema = z.object({
  userId: z.uuid(),
});

export interface GetUserQuery extends z.infer<typeof schema> {}
export class GetUserQuery extends createRequest(schema) {}
```

**Usage — Event:**

```typescript
// user-created.event.ts
import { z } from 'zod';
import { createRequest } from './helpers/createRequest';

const schema = z.object({
  userId: z.uuid(),
  username: z.string().min(1),
  email: z.email(),
});

export interface UserCreatedEvent extends z.infer<typeof schema> {}
export class UserCreatedEvent extends createRequest(schema) {}
```

### Attaching Schemas Manually

For event classes (or any class) that don't use `createRequest()`, attach the schema with `ZOD_SCHEMA_KEY`:

```typescript
import { ZOD_SCHEMA_KEY } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const userCreatedSchema = z.object({
  userId: z.string().uuid(),
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

## ZodPipe

A NestJS `PipeTransform` that validates `@Body()`, `@Param()`, `@Query()` values against a Zod schema. Supports transform schemas for DTO → Command mapping.

### Body Validation

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const CreateUserDtoSchema = z.object({
  name: z.string().min(5),
  email: z.email(),
});
type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

@Controller('users')
export class UsersController {
  @Post()
  createUser(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
    // dto is validated and typed
    return this.commandBus.execute(
      new CreateUserCommand({ username: dto.name, email: dto.email }),
    );
  }
}
```

### Param Validation

```typescript
import { Get, Param, Controller } from '@nestjs/common';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const UserIdSchema = z.string().uuid();

@Controller('users')
export class UsersController {
  @Get(':id')
  getUser(@Param('id', new ZodPipe(UserIdSchema)) id: string) {
    // id is guaranteed to be a valid UUID
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

### Transform Schemas

Use Zod transforms to validate and map DTOs in a single step:

```typescript
import { ZodPipe } from '@nestjs-pipeline/zod';

// Schema that validates input AND transforms to a command
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

@Post()
createUser(
  @Body(new ZodPipe(CreateUserMapperSchema)) command: CreateUserCommand,
) {
  // command is already a validated CreateUserCommand instance
  return this.commandBus.execute(command);
}
```

On validation failure, `ZodPipe` throws a NestJS `BadRequestException` with `error.flatten()` details.

---

## ZodValidationFilter

A NestJS `ExceptionFilter` that catches `ZodValidationError` (thrown by `ZodValidationBehavior` or `createRequest()` constructors) and maps it to an HTTP 400 response.

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter());
  await app.listen(3000);
}
bootstrap();
```

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

---

## ZodValidationError

A framework-agnostic error class thrown when Zod validation fails. Carries structured `details` from `ZodError.flatten()`.

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

You can write a custom exception filter to handle `ZodValidationError` differently:

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

## Full Example

A complete setup from module to controller:

```typescript
// ── app.module.ts ──
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

// ── main.ts ──
import { NestFactory } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter());
  await app.listen(3000);
}
bootstrap();

// ── create-user.command.ts ──
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.email(),
});

export interface CreateUserCommand extends z.infer<typeof schema> {}
export class CreateUserCommand extends createRequest(schema) {}

// ── create-user.dto.ts ──
import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  name: z.string().min(5),
  email: z.email(),
});
export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

// ── create-user.mapper.ts ──
export const CreateUserMapper = {
  map(dto: CreateUserDto) {
    return new CreateUserCommand({ username: dto.name, email: dto.email });
  },
};

// ── create-user.handler.ts ──
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline, LoggingBehavior } from '@nestjs-pipeline/core';

@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand): Promise<User> {
    return this.userRepository.create(command.username, command.email);
  }
}

// ── users.controller.ts ──
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  createUser(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
    return this.commandBus.execute(CreateUserMapper.map(dto));
  }

  @Get(':id')
  getUser(@Param('id', new ZodPipe(z.string().uuid())) id: string) {
    return this.queryBus.execute(new GetUserQuery({ userId: id }));
  }
}
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `ZodValidationBehavior` | Class | Pipeline behavior — parses `_zodSchema` and applies successful plain-object output to the existing request |
| `ZodValidationError` | Class | Error with `details` from `ZodError.flatten()` |
| `ZodValidationFilter` | Class | Exception filter — catches `ZodValidationError` → HTTP 400 |
| `ZodPipe` | Class | Async NestJS pipe — validates params/body/query against synchronous or asynchronous Zod schemas |
| `ZOD_SCHEMA_KEY` | `'_zodSchema'` | Key for attaching schemas to request classes |
| `ZOD_SCHEMA` | `'_zodSchema'` | **Deprecated** — alias for `ZOD_SCHEMA_KEY`; use `ZOD_SCHEMA_KEY` instead |

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](../../LICENSE) and [`COMMERCIAL_LICENSE.txt`](../../COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
