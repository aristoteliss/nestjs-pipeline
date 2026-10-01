---
title: "@nestjs-pipeline/zod"
description: "Zod validation/parsing behavior for @nestjs-pipeline/core that applies successful parsed object output to the existing request"
editUrl: false
---
Zod v4 validation and parsing integration for `@nestjs-pipeline/core` — parse commands, queries, and events at the pipeline boundary, validate controller params and bodies through Nest's `StandardSchemaValidationPipe` with the same 400 body (`zodBadRequest`), and catch validation errors with `ZodValidationFilter`.

---

## Table of Contents

- [Installation](#installation)
- [ZodValidationBehavior](#zodvalidationbehavior)
  - [Global Registration](#global-registration)
  - [Per-Handler Registration](#per-handler-registration)
  - [How It Works](#how-it-works)
- [Creating Validated Commands, Queries, and Events](#creating-validated-commands-queries-and-events)
  - [createCommand() and createQuery() Factories](#createcommand-and-createquery-factories)
  - [Extending a Base Class](#extending-a-base-class)
  - [Updatable Fields](#updatable-fields)
  - [Standard Schema Metadata](#standard-schema-metadata)
  - [Static parse() and safeParse()](#static-parse-and-safeparse)
  - [Type Inference Helpers (InferInput, InferOutput)](#type-inference-helpers-inferinput-inferoutput)
  - [Attaching Schemas Manually](#attaching-schemas-manually)
- [Nest Schema Validation](#nest-schema-validation)
  - [Body Validation](#body-validation)
  - [Param Validation](#param-validation)
  - [Transform Schemas](#transform-schemas)
  - [Query-String Coercion](#query-string-coercion)
- [createZodMapper](#createzodmapper)
- [ZodValidationFilter](#zodvalidationfilter)
- [ZodValidationError](#zodvalidationerror)
- [Reading Raw Input and Parsed Data](#reading-raw-input-and-parsed-data)
- [Full Example](#full-example)
- [Migrating from 0.2.x](#migrating-from-02x)
- [Migrating from 0.1.x](#migrating-from-01x)
- [API Reference](#api-reference)
- [Property Presence](#property-presence)
- [License](#license)

---

## Installation

```bash
pnpm add @nestjs-pipeline/zod zod
```

Requires Zod `^4.3.0`, NestJS `^12.1.0`, `@nestjs-pipeline/core` `^0.4.0` and Node.js 22.12
or later.

Published as an ES module; a CommonJS application loads it with `require()`. Coming from
0.3.x, see [Upgrading from 0.3.x](/nestjs-pipeline/upgrading/from-0-3/).

**Peer dependencies:**

```bash
pnpm add @nestjs-pipeline/core @nestjs/common @nestjs/core
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

Async refinements and transforms are supported by `ZodValidationBehavior` and
by Nest's `StandardSchemaValidationPipe`, which awaits them. The class
constructors generated by `createCommand()` and `createQuery()` use
`safeParse()` and therefore validate synchronously.

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
  email: z.email(),
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
  userId: z.uuid(),
});

export class GetUserQuery extends createQuery(schema) {}
```

### Extending a Base Class

Both `createCommand()` and `createQuery()` accept an optional base class as the second argument. Constructor arguments of the base class are forwarded transparently via `super(...baseArgs)`:

```typescript
// A base class defined by the application
export abstract class AppCommand {
  constructor(public readonly sessionUser?: SessionUser) {}
}

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

export class CreateUserCommand extends createCommand(CreateUserSchema, AppCommand) {}

// Construct with payload and optional base class arguments:
const cmd = new CreateUserCommand(
  { name: 'Alice', email: 'alice@example.com' },
  sessionUser, // forwarded to the AppCommand constructor
);

expect(cmd.name).toBe('Alice');
expect(cmd.sessionUser).toBe(sessionUser);
expect(cmd instanceof AppCommand).toBe(true);
expect(cmd instanceof CreateUserCommand).toBe(true);
```

### Updatable Fields

Mark each field an update command changes with `updatable`, inside the schema.
`createCommand()` lists the marked fields of the top-level object as the static,
frozen `updatableFields`, in shape order: the list of fields to pass to field-level
authorization:

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

In the handler, authorize only the marked fields the caller actually sent, for example
with `CaslAuthorizer` from `@nestjs-pipeline/casl`:

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

- `.apply(updatable)` can sit anywhere in the field's chain, and `updatable(schema)` works
  as a function. The mark survives later checks and wrappers (`.min()`, `.optional()`,
  `.nullable()`, `.default()`, `.transform()`) and `.partial()`, `.pick()` or `.extend()`
  on the object.
- **A field without the mark is never in `updatableFields`, so field-level authorization
  never sees it.** Mark every field the handler writes; `id`, which selects the aggregate, stays unmarked.
- Only the top-level object is read, also through a top-level `.transform()`: marks in
  nested objects, arrays or unions are not listed. `updatableFieldsOf(schema)` returns the
  same list for a schema used without `createCommand()`.
- The mark lives in a registry private to this package. It does not change validation or
  output, it never appears in `z.toJSONSchema()` output, and it is set on a copy, so a
  field schema shared with other commands stays unmarked.

### Standard Schema Metadata

Every class produced by `createCommand()`, `createQuery()`, or `createZodRequest()` forwards the schema's [Standard Schema](https://standard-schema.dev/) (`~standard`) metadata.

That metadata is intentionally framework-interoperable. The declared and tested Nest peer for `@nestjs-pipeline/zod` is NestJS `^12.1.0`. Expand the peer range only after the packed compatibility matrix covers the new major.

### Static parse() and safeParse()

Every generated class exposes ergonomic static parsing methods that polymorphically construct the subclass:

```typescript
// Returns an instance of CreateUserCommand or throws ZodValidationError:
const cmd = CreateUserCommand.parse(rawInput, sessionUser);

// Returns Zod's safe-parse result (no instance is constructed) without throwing:
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
import type { InferInput, InferOutput } from '@nestjs-pipeline/zod';
import { CreateUserCommand } from './create-user.command';

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

## Nest Schema Validation

Nest 12 validates a route argument against a Standard Schema, and Zod 4 schemas are
Standard Schemas: pass `{ schema }` to `@Body()`, `@Param()` or `@Query()` and register
Nest's `StandardSchemaValidationPipe` once, with `zodBadRequest` as its
`exceptionFactory`. A failure then answers HTTP 400 with `{ formErrors, fieldErrors }`,
the same body as `createZodMapper`.

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

- The argument is the schema's output, including `.transform()` results; asynchronous
  refinements and transforms are awaited.
- A parameter declared with `{ schema }` is validated only where the pipe is registered.
  Registered as `APP_PIPE`, it covers every application built from the module, tests
  included. A parameter without `schema` passes through unchanged.
- Nest validates custom parameter decorators only when the pipe is created with
  `validateCustomDecorators: true`.

### Body Validation

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

The parameter's TypeScript type is not inferred from the schema; declare it as the
schema's output type (`z.output<typeof Schema>`, or `z.infer`).

### Param Validation

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

A failing value without a field path, such as a malformed id, is listed under
`formErrors`.

### Transform Schemas

Use Zod transforms to validate and map a DTO in a single step:

```typescript
const CreateUserMapperSchema = CreateUserDtoSchema.transform(
  ({ name, email }) => new CreateUserCommand({ username: name, email }),
);

@Post()
createUser(@Body({ schema: CreateUserMapperSchema }) command: CreateUserCommand) {
  return this.commandBus.execute(command);
}
```

### Query-String Coercion

Query-string values arrive as strings; coerce them in the schema:

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

## createZodMapper

`createZodMapper(schema)` returns `{ schema, map(input) }`: a controller-layer mapper that
parses a validated DTO into the value the schema outputs, typically an application command.

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

- `map()` parses synchronously, so the schema must not use async refinements or
  transforms; validate those as a route parameter's `schema`
  ([Nest Schema Validation](#nest-schema-validation)).
- On failure it throws `zodBadRequest`'s `BadRequestException` (`formErrors`,
  `fieldErrors`), the body Nest's pipe answers with, so clients see one 400 shape.
- `schema` is exposed for reuse, for example `CreateUserMapper.schema.extend(...)`.

---

## ZodValidationFilter

A NestJS `ExceptionFilter` that catches `ZodValidationError` (thrown by `ZodValidationBehavior` or by a `createZodRequest()` constructor) and maps it to an HTTP 400 response.

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

Nest injects its `HttpAdapterHost`, and the filter replies through that adapter, so it
works with Express and Fastify, also for an error thrown in middleware. To register it in
`main.ts` instead, pass the host:
`app.useGlobalFilters(new ZodValidationFilter(app.get(HttpAdapterHost)))`.

**Response format** (HTTP 400):

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

## Reading Raw Input and Parsed Data

A generated constructor records the input it was called with and the parsed payload.
Both are readable without exposing them as enumerable fields:

```typescript
import { getRawInput, getValidatedData } from '@nestjs-pipeline/zod';

const schema = z.object({
  email: z.string().trim().toLowerCase(),
  nickname: z.preprocess((v) => v ?? undefined, z.string().optional()),
});
class RegisterCommand extends createCommand(schema) {}

const command = new RegisterCommand({ email: '  Jane@Example.com ', nickname: null });

getRawInput<{ nickname: unknown }>(command)?.nickname; // null — the caller sent it explicitly
command.email;                                          // 'jane@example.com'
getValidatedData(command)?.email;                       // 'jane@example.com' (frozen copy)
```

- `getRawInput()` returns the original input by reference; do not mutate it.
- `getValidatedData()` returns `undefined` for a request that was never parsed, and a new
  frozen copy on every call.

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

## API Reference

| Export | Type | Description |
|---|---|---|
| `createCommand(schema, Base?)` | Function | Generates a validated CQRS Command class tagged with `requestKind: 'command'`, `~standard`, and static `parse()`/`safeParse()` |
| `createQuery(schema, Base?)` | Function | Generates a validated CQRS Query class tagged with `requestKind: 'query'`, `~standard`, and static `parse()`/`safeParse()` |
| `updatable(schema)` | Function | Marks a command field as updatable; use it as `.apply(updatable)`. `createCommand()` lists marked fields as `updatableFields` |
| `updatableFieldsOf(schema)` | Function | The top-level object fields marked with `updatable`, frozen, in shape order |
| `createZodRequest(schema, Base?)` | Function | Generic factory generating a validated Request class with `~standard` forwarding and static parsers |
| `type InferInput<T>` | Type | Extracts the input DTO type accepted by a generated command/query class |
| `type InferOutput<T>` | Type | Extracts the parsed/transformed output payload of a generated command/query class |
| `type AbstractConstructor<T>` | Type | The base class shape `createCommand`, `createQuery` and `createZodRequest` accept as `Base` |
| `ZodValidationBehavior` | Class | Pipeline behavior — parses `_zodSchema` and applies successful plain-object output to the existing request |
| `ZodValidationError` | Class | Error with `details` from `ZodError.flatten()` |
| `ZodValidationFilter` | Class | Exception filter — catches `ZodValidationError` → HTTP 400 |
| `createZodMapper` | Function | Controller-layer mapper `{ schema, map(input) }`; failures → `zodBadRequest`'s `BadRequestException` |
| `ZodMapper` | Interface | The mapper returned by `createZodMapper` |
| `zodBadRequest(issues)` | Function | `exceptionFactory` for Nest's `StandardSchemaValidationPipe`: a `BadRequestException` with the `{ formErrors, fieldErrors }` body Zod's `flatten()` produces |
| `ZOD_SCHEMA_KEY` | `'_zodSchema'` | Key for attaching schemas to request classes |
| `getRawInput(request)` | Function | Returns, by reference, the input a generated constructor was called with — including an explicit `null` or `undefined` that preprocessing replaced. Returns the request itself when no input was recorded |
| `getValidatedData(request)` | Function | Returns a frozen, detached copy of the parsed payload a request carries, or `undefined` when it has never been parsed. Each call returns a fresh copy, so mutating it cannot affect validation |
| `ZOD_RAW_INPUT_KEY` | `symbol` | Symbol `getRawInput()` also reads, for requests produced outside this package |
| `ZOD_VALIDATED_DATA_KEY` | `symbol` | Symbol `getValidatedData()` also reads. Readable metadata only — attaching it does **not** mark a request validated, and the behavior still parses such a request |

Each generated class additionally exposes `parse(input, ...baseArgs)`,
`parseAsync(input, ...baseArgs)`, `safeParse(input)`, `schema`, and `~standard`;
`createCommand()` and `createQuery()` add `requestKind`, and `createCommand()` adds
`updatableFields`. The class types
(`ZodRequestClass`, `ZodCommandClass`, `ZodQueryClass`) are exported for
consumers that need to name them.

---

## Migrating from 0.2.x

These steps lead to 0.3.0. To reach 0.4.0, continue with
[Upgrading from 0.3.x](/nestjs-pipeline/upgrading/from-0-3/) in the repository README.

**Peers and runtime.** NestJS `^12.1.0`, `@nestjs-pipeline/core` `^0.3.0`, Node.js 22.12 or
later.

```bash
pnpm add @nestjs/common@^12.1.0 @nestjs/core@^12.1.0 @nestjs-pipeline/core@^0.3.0 @nestjs-pipeline/zod@^0.3.0
```

**`ZodPipe` is removed.** Declare the schema on the parameter and register Nest's
`StandardSchemaValidationPipe` once with `zodBadRequest` (see
[Nest Schema Validation](#nest-schema-validation)); the 400 body is unchanged.

```typescript
// 0.2.x
getUser(@Param('id', new ZodPipe(UserIdSchema)) id: string) {}

// 0.3.0
getUser(@Param('id', { schema: UserIdSchema }) id: string) {}
```

---

## Migrating from 0.1.x

These steps lead to 0.2.0. To reach 0.4.0, continue with
[Migrating from 0.2.x](#migrating-from-02x).

**1. Peers and runtime.** `zod` must be `^4.3.0` (was `^4.0.0`), `@nestjs/common`
`^11.0.0` (was `>=10`), `@nestjs-pipeline/core` `^0.2.0`, and Node.js 22 or later.

```bash
pnpm add zod@^4.3.0 @nestjs/common@^11 @nestjs-pipeline/core@^0.2.0 @nestjs-pipeline/zod@^0.2.0
```

**2. `ZOD_SCHEMA` is removed.** It was a deprecated alias; use `ZOD_SCHEMA_KEY`.

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

**3. The behavior now applies parsed output to the request.** In 0.1.x
`ZodValidationBehavior` only validated; the handler received the request unchanged. In
0.2.0 transforms, coercions and defaults are written back onto the same request object,
and keys the schema strips are deleted from it.

```typescript
const schema = z.object({ email: z.string().trim().toLowerCase() });
class InviteCommand {
  static readonly [ZOD_SCHEMA_KEY] = schema;
  constructor(public email: string, public debug?: boolean) {}
}

// Dispatched as new InviteCommand('  Jane@Example.com ', true):
// 0.1.x handler sees { email: '  Jane@Example.com ', debug: true }
// 0.2.0 handler sees { email: 'jane@example.com' }   — `debug` is removed
```

If a handler relied on a field the schema does not declare, add it to the schema (or use
`.passthrough()`/`.loose()`), or build the request with `createCommand(schema, Base)` so
that base-class fields are kept.

**4. Parsed output must be a plain object.** A schema attached to a request class whose
top-level output is not a plain object (for example `.transform(() => new Foo())`, an
array or a primitive) now throws `TypeError` in the behavior; 0.1.x accepted it because
the output was discarded. The behavior also throws `TypeError` when the request itself is
not an object. Keep class-producing transforms in a route parameter's `schema` or in
`createZodMapper`.

**5. Async schemas.** `ZodValidationBehavior` and `ZodPipe` now use `safeParseAsync`, so
async refinements work; 0.1.x threw on them. `ZodPipe.transform()` returns a promise,
which Nest awaits; code that calls `transform()` directly must await it.

```typescript
// 0.1.x
const id = new ZodPipe(z.uuid()).transform(rawId); // rawId: string
// 0.2.0
const id = await new ZodPipe(z.uuid()).transform(rawId); // rawId: string
```

`ZodPipe`'s schema type is now `ZodType<TOutput, TInput>`, so its input type is checked
against the declared `TInput`.

**6. Hand-written request classes can become generated ones (optional).**

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

A generated constructor throws `ZodValidationError` (not `ZodError`), which
`ZodValidationFilter` maps to HTTP 400.

**7. `ZodValidationFilter` supports Fastify.** It calls `response.send()` when
`response.json()` is absent; the body is unchanged.

---

## Property Presence

Generated construction (including `parseAsync()`) and behavior re-parsing define
every own enumerable key Zod returns, including keys whose parsed value is
`undefined`. A key the schema omits entirely stays absent. So `Object.hasOwn()`,
`Object.keys()`, and cache/idempotency fingerprints see an explicit `undefined`
field as present; `JSON.stringify()` still drops it under its own rules.

Prototypes and base-class fields are preserved, and an own `__proto__` key in
parsed output is defined as a plain data property rather than reassigning the
prototype.

---

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root [`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt) for details.

Contact: **aristotelis@ik.me**
