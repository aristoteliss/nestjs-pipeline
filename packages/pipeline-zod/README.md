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
  - [createCommand() and createQuery() Factories](#createcommand-and-createquery-factories)
  - [Extending Base Classes (BaseCommand, BaseQuery)](#extending-base-classes-basecommand-basequery)
  - [Standard Schema Metadata](#standard-schema-metadata)
  - [Static parse() and safeParse()](#static-parse-and-safeparse)
  - [Type Inference Helpers (InferInput, InferOutput)](#type-inference-helpers-inferinput-inferoutput)
  - [Attaching Schemas Manually](#attaching-schemas-manually)
- [ZodPipe](#zodpipe)
  - [Body Validation](#body-validation)
  - [Param Validation](#param-validation)
  - [Transform Schemas](#transform-schemas)
- [createZodMapper](#createzodmapper)
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
2. If no schema is present (e.g. a plain event class, or a request type that carries none), it's a no-op — just calls `next()`.
3. If the request was already parsed with that same schema and its parsed fields are unchanged, the behavior skips straight to `next()`. This is what keeps a non-idempotent transform from running twice over its own output.
4. Otherwise it awaits `schema.safeParseAsync(context.request)`. On failure it throws `ZodValidationError` with structured details.
5. On success the existing request object is updated in place to match `result.data`: keys the schema no longer produces are removed, then parsed/coerced/defaulted values are assigned.

This means transforms, coercions, defaults, and object-key stripping performed by the schema are visible to later behaviors and to the handler; the behavior is not validation-only.

**Which keys can be removed.** On the first parse of a request the behavior has not
seen before — a plain object, or a hand-written class carrying `_zodSchema` — every
key the schema does not keep is removed, so unknown input never reaches the handler.
Once a request has been parsed (by the behavior, or by a generated constructor), only
the fields that schema itself produced are tracked: they are re-checked for mutation
and removed if a later parse omits them. Fields the request class owns — base-class
properties, subclass fields, non-enumerable CQRS metadata such as `sessionUser` — are
neither validated nor removed.

**Mutating a request after construction.** Changing a schema-owned field marks the
request for re-parsing, and that re-parse runs the schema over the *parsed* payload,
not the original input. For a schema whose output type differs from its input type
(`z.string().transform(Number)`, a `Uint8Array` transform, a branded object), that
second pass can legitimately fail. Build a new request instead of mutating a parsed
one when the schema is not input/output-stable.

Async refinements and transforms are supported by both `ZodValidationBehavior`
and `ZodPipe`. Consequently, `ZodPipe.transform()` returns a promise (which
NestJS pipes await automatically). The class constructors generated by
`createCommand()` and `createQuery()` use `safeParse()` and therefore validate
synchronously.

For a schema with async refinements or transforms, build the instance with the
generated `parseAsync()` static. The behavior and the pipe run *after*
construction, so they cannot rescue a constructor that throws
"Encountered Promise during synchronous parse":

```typescript
const RegisterSchema = z.object({
  email: z.string().refine(async (value) => isUnique(value), 'already taken'),
});
class RegisterCommand extends createCommand(RegisterSchema) {}

// Throws: the schema cannot be parsed synchronously.
new RegisterCommand({ email });

// Validates asynchronously, then constructs.
const command = await RegisterCommand.parseAsync({ email });
```

`parseAsync()` throws the same `ZodValidationError` as the constructor, applies
the same output-shape assertion, and forwards base-class constructor arguments.

---

## Creating Validated Commands, Queries, and Events

### createCommand() and createQuery() Factories

Instead of writing repetitive boilerplate classes with manual constructor validation, `@nestjs-pipeline/zod` provides first-class `createCommand()` and `createQuery()` factory functions.

These factories automatically:
- Attach the Zod schema as static `_zodSchema` (for `ZodValidationBehavior`) and `schema`.
- Tag the generated class with `requestKind = 'command'` or `requestKind = 'query'`.
- Forward the **Standard Schema specification** (`~standard`) for schema interoperability.
- Provide static `parse()` and `safeParse()` methods on the class.
- Safely assign properties using `[[DefineOwnProperty]]` (`Object.defineProperty`), guaranteeing that own enumerable properties are created without being shadowed by prototype getters, preserving clean JSON serialization and idempotency fingerprints.

**Usage — Command:**

```typescript
// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.string().email(),
});

export class CreateUserCommand extends createCommand(schema) {}

// Auto-validates at construction time:
const cmd = new CreateUserCommand({ username: 'jane', email: 'jane@example.com' });
cmd.username // → 'jane'
cmd.email    // → 'jane@example.com'

// Throws ZodValidationError on invalid input:
new CreateUserCommand({ username: 'ab', email: 'not-an-email' });
```

**Usage — Query:**

```typescript
// get-user.query.ts
import { createQuery } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  userId: z.string().uuid(),
});

export class GetUserQuery extends createQuery(schema) {}
```

### Extending Base Classes (BaseCommand, BaseQuery)

Both `createCommand()` and `createQuery()` accept an optional base class as the second argument. Constructor arguments of the base class are forwarded transparently via `super(...baseArgs)`:

```typescript
// Base command with ambient session user
export abstract class BaseCommand {
  constructor(public readonly sessionUser?: SessionUser) {}
}

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export class CreateUserCommand extends createCommand(CreateUserSchema, BaseCommand) {}

// Construct with payload and optional base class arguments:
const cmd = new CreateUserCommand(
  { name: 'Alice', email: 'alice@example.com' },
  sessionUser, // forwarded to BaseCommand constructor
);

expect(cmd.name).toBe('Alice');
expect(cmd.sessionUser).toBe(sessionUser);
expect(cmd instanceof BaseCommand).toBe(true);
expect(cmd instanceof CreateUserCommand).toBe(true);
```

### Standard Schema Metadata

Every class produced by `createCommand()`, `createQuery()`, or `createZodRequest()` forwards the schema's [Standard Schema](https://standard-schema.dev/) (`~standard`) metadata.

That metadata is intentionally framework-interoperable. The currently declared and tested Nest peer for `@nestjs-pipeline/zod` is **NestJS 11**. Do not treat the presence of Standard Schema metadata as a claim that this package currently supports NestJS 12. Expand the peer range only after the packed compatibility matrix covers that major.

### Static parse() and safeParse()

Every generated class exposes ergonomic static parsing methods that polymorphically construct the subclass:

```typescript
// Returns an instance of CreateUserCommand or throws ZodValidationError:
const cmd = CreateUserCommand.parse(rawInput, sessionUser);

// Returns standard Zod SafeParseReturnType without throwing:
const result = CreateUserCommand.safeParse(rawInput);
if (result.success) {
  console.log('Valid data:', result.data);
} else {
  console.error('Validation issues:', result.error.issues);
}
```

### Type Inference Helpers (InferInput, InferOutput)

Easily infer TypeScript types directly from the command/query class without re-exporting or importing the raw schema:

```typescript
import { CreateUserCommand, type InferInput, type InferOutput } from './create-user.command';

// Input type (what the constructor or API endpoint accepts):
type CreateUserDto = InferInput<typeof CreateUserCommand>;

// Output type (the transformed/parsed instance payload):
type CreateUserPayload = InferOutput<typeof CreateUserCommand>;
```

### Attaching Schemas Manually

For event classes (or any class) that don't use `createZodRequest()`, attach the schema with `ZOD_SCHEMA_KEY`:

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

## createZodMapper

`createZodMapper(schema)` returns `{ schema, map(input) }`: a controller-layer mapper that
parses a validated DTO into the value the schema outputs, typically an application command.

```typescript
import { createZodMapper, ZodPipe } from '@nestjs-pipeline/zod';

export const CreateUserMapper = createZodMapper(
  CreateUserDtoSchema.transform(
    ({ name, email }) => new CreateUserCommand({ username: name, email }),
  ),
);

@Post()
create(@Body(new ZodPipe(CreateUserDtoSchema)) dto: CreateUserDto) {
  return this.commandBus.execute(CreateUserMapper.map(dto));
}
```

- `map()` parses synchronously, so the schema must not use async refinements or
  transforms; validate those with `ZodPipe`.
- On failure it throws the same `BadRequestException` as `ZodPipe`, with
  `error.flatten()` details (`formErrors`, `fieldErrors`), so clients see one 400 shape.
- `schema` is exposed for reuse, for example `CreateUserMapper.schema.extend(...)`.

---

## ZodValidationFilter

A NestJS `ExceptionFilter` that catches `ZodValidationError` (thrown by `ZodValidationBehavior` or by a `createZodRequest()` constructor) and maps it to an HTTP 400 response.

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
import { NestFactory } from '@nestjs/core';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ZodValidationFilter());
  await app.listen(3000);
}
bootstrap();

// create-user.command.ts
import { createCommand } from '@nestjs-pipeline/zod';
import { z } from 'zod';

const schema = z.object({
  username: z.string().min(4),
  email: z.string().email(),
});

export class CreateUserCommand extends createCommand(schema) {}

// create-user.dto.ts
import { z } from 'zod';

export const CreateUserDtoSchema = z.object({
  name: z.string().min(5),
  email: z.string().email(),
});
export type CreateUserDto = z.infer<typeof CreateUserDtoSchema>;

// create-user.mapper.ts
export const CreateUserMapper = {
  map(dto: CreateUserDto) {
    return new CreateUserCommand({ username: dto.name, email: dto.email });
  },
};

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
| `createCommand(schema, Base?)` | Function | Generates a validated CQRS Command class tagged with `requestKind: 'command'`, `~standard`, and static `parse()`/`safeParse()` |
| `createQuery(schema, Base?)` | Function | Generates a validated CQRS Query class tagged with `requestKind: 'query'`, `~standard`, and static `parse()`/`safeParse()` |
| `createZodRequest(schema, Base?)` | Function | Generic factory generating a validated Request class with `~standard` forwarding and static parsers |
| `type InferInput<T>` | Type | Extracts the input DTO type accepted by a generated command/query class |
| `type InferOutput<T>` | Type | Extracts the parsed/transformed output payload of a generated command/query class |
| `ZodValidationBehavior` | Class | Pipeline behavior — parses `_zodSchema` and applies successful plain-object output to the existing request |
| `ZodValidationError` | Class | Error with `details` from `ZodError.flatten()` |
| `ZodValidationFilter` | Class | Exception filter — catches `ZodValidationError` → HTTP 400 |
| `createZodMapper` | Function | Controller-layer mapper `{ schema, map(input) }`; failures → `BadRequestException` like `ZodPipe` |
| `ZodMapper` | Interface | The mapper returned by `createZodMapper` |
| `ZodPipe` | Class | Async NestJS pipe — validates params/body/query against synchronous or asynchronous Zod schemas |
| `ZOD_SCHEMA_KEY` | `'_zodSchema'` | Key for attaching schemas to request classes |
| `getRawInput(request)` | Function | Returns, by reference, the input a generated constructor was called with — including an explicit `null` or `undefined` that preprocessing replaced. Returns the request itself when no input was recorded |
| `getValidatedData(request)` | Function | Returns a frozen, detached copy of the parsed payload a request carries, or `undefined` when it has never been parsed. Each call returns a fresh copy, so mutating it cannot affect validation |
| `ZOD_RAW_INPUT_KEY` | `symbol` | Symbol `getRawInput()` also reads, for requests produced outside this package |
| `ZOD_VALIDATED_DATA_KEY` | `symbol` | Symbol `getValidatedData()` also reads. Readable metadata only — attaching it does **not** mark a request validated, and the behavior still parses such a request |

Each generated class additionally exposes `parse(input, ...baseArgs)`,
`parseAsync(input, ...baseArgs)`, `safeParse(input)`, `schema`, and `~standard`;
`createCommand()` and `createQuery()` add `requestKind`. The class types
(`ZodRequestClass`, `ZodCommandClass`, `ZodQueryClass`) are exported for
consumers that need to name them.

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**

## Property presence

Generated construction (including `parseAsync()`) and behavior re-parsing define
every own enumerable key Zod returns, including keys whose parsed value is
`undefined`. A key the schema omits entirely stays absent. So `Object.hasOwn()`,
`Object.keys()`, and cache/idempotency fingerprints see an explicit `undefined`
field as present; `JSON.stringify()` still drops it under its own rules.

Prototypes and base-class fields are preserved, and an own `__proto__` key in
parsed output is defined as a plain data property rather than reassigning the
prototype.
