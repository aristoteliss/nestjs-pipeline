---
title: "Upgrading from 0.2.x"
sidebar:
  order: 2
---

0.3.0 moves every package to NestJS 12. Every change is listed in
[CHANGELOG.md](/nestjs-pipeline/changelog/); the ones below need a change in most applications.

**1. NestJS 12.1 and Node.js 22.12.** Every package declares `engines.node >=22.12.0`
(`@cqrs-ddd/mikro-orm` `>=22.17.0`, as MikroORM 7 requires), and
every `@nestjs/common`, `@nestjs/core` and `@nestjs/cqrs` peer is `^12.1.0`. Packages that
peer on `@nestjs-pipeline/core` require `^0.3.0` of it. NestJS 12.0.x is not supported: it
drops the `@Optional()` markers of a base class in a subclass that declares no constructor
of its own, so such a subclass of a behavior fails to resolve its optional dependencies.

```bash
pnpm add @nestjs/common@^12.1.0 @nestjs/core@^12.1.0 @nestjs/cqrs@^12.1.0 @nestjs-pipeline/core@^0.3.0
```

**2. A CommonJS application compiles with TypeScript `module` `nodenext`, `node20` or
`bundler`.** NestJS 12 publishes ES modules, which a CommonJS application loads through
Node's `require()` of ES modules (Node.js 22.12). With `module: node16`, TypeScript refuses
those imports (TS1479).

**3. `ZodPipe` is removed.** Declare the schema on the parameter and register Nest's
`StandardSchemaValidationPipe` once with `zodBadRequest`; the 400 body is the one
`ZodValidationFilter` gives:

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

**4. Register `IdempotencyConflictFilter`.** NestJS 12's default exception filter answers a
plain `Error` that carries a `statusCode` with 500. `IdempotencyConflictError` is one, so
without the filter a request whose idempotency key is still running or was reused answers
500 instead of 409 or 422. The bundled filters register as described in
[What's new in 0.2.2](/nestjs-pipeline/releases/0-2-2/).

**5. cockatiel 4.** `@nestjs-pipeline/resilience` requires `cockatiel` `^4.0.0`, an ES
module. Its policies report errors as `unknown`; narrow them before reading `message`.

**6. rate-limiter-flexible 11.** `@nestjs-pipeline/rate-limit` declares no peer on it and is
tested with 11, which throws when a limiter is created without a finite `points` or
`duration`.

**7. Domain events carry a dispatcher context.** `@cqrs-ddd/core`'s `CommandBaseHandler`
calls `publishAll(events, aggregate)`, so a publisher that reads a second argument receives
the aggregate, as NestJS's `EventPublisher` passes it. `AggregateRoot.commit(context?)`
passes its context to `publishAll` and returns the publisher's result, and
`IAggregateRoot` describes the contract that both this package's and NestJS's aggregates
satisfy.
