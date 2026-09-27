# @nestjs-pipeline/job-context

[![npm version](https://img.shields.io/npm/v/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)
[![License](https://img.shields.io/npm/l/@nestjs-pipeline/job-context.svg)](https://www.npmjs.com/package/@nestjs-pipeline/job-context)

The execution context of a request, carried into the queue jobs it enqueues: the tenant,
the correlation id and the principal. A job then makes the decisions the request would
have made. System-started work, such as a cron job, declares its context explicitly
instead. Nothing falls back to a default tenant or an anonymous principal.

It depends on no other pipeline package. It reads and restores the tenant and the
correlation id through the sources it is given, usually `tenantSource` of
[`@nestjs-pipeline/tenant`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline-tenant#readme)
and `correlationSource` of
[`@nestjs-pipeline/correlation`](https://github.com/aristoteliss/nestjs-pipeline/tree/master/packages/pipeline-correlation#readme),
so pipelines a job dispatches get the same tenant and correlation id.

## Installation

```bash
pnpm add @nestjs-pipeline/job-context @nestjs/common
```

Requires Node.js 22 or later.

## Setup

Implement `IJobPrincipal` over the application's authentication state, and register it
with the tenants jobs may run in and the tenant and correlation id sources:

```typescript
import { Injectable } from '@nestjs/common';
import { type IJobPrincipal, type PrincipalReference } from '@nestjs-pipeline/job-context';

@Injectable()
export class SessionJobPrincipal implements IJobPrincipal<Capability> {
  constructor(private readonly sessions: SessionRepository) {}

  capture(): PrincipalReference | undefined {
    const principal = currentPrincipal();
    return principal && { id: principal.id, type: principal.type, sessionId: principal.sid };
  }

  async restore<T>(
    principal: PrincipalReference,
    work: () => Promise<T>,
    grants?: readonly Capability[],
  ): Promise<T> {
    if (grants) return runAsPrincipal({ ...principal, grants }, work);
    const session = await this.sessions.findActive(principal.sessionId, principal.id);
    if (!session) throw new SessionRevokedError();
    return runAsPrincipal(principal, work);
  }
}

@Module({
  imports: [
    JobContextModule.forRoot({
      principal: SessionJobPrincipal,
      tenants: ['tenant_a', 'tenant_b'],
      sources: { tenantId: tenantSource, correlationId: correlationSource },
      imports: [SessionsModule],
    }),
  ],
})
export class JobsModule {}
```

`capture` reads the current principal when a job is enqueued; only its `id`, `type` and
`sessionId` are kept. `restore` runs when the job does, inside the job's tenant and
correlation id: it must re-check the principal against current state, bind it the way a
request would, and throw to refuse the job.

## Usage

Stamp the payload when enqueuing, from inside the request or handler:

```typescript
await queue.add('send', withJobContext({ userId, email }));
```

Restore it in the processor. Place the decorator under the transport decorator:

```typescript
@Processor(WELCOME_EMAIL_QUEUE)
export class SendWelcomeEmailProcessor extends WorkerHost {
  @InJobContext()
  async process(job: Job<WithJobContext<WelcomeEmail>>) {
    await this.commandBus.execute(new SendWelcomeEmailCommand(job.data));
  }
}
```

`@InJobContext()` reads `data.jobContext` from the first argument (a BullMQ `Job`); pass
`{ path: 'jobContext' }` for a transport that hands the payload itself.

Declare system-started work:

```typescript
@Cron('0 3 * * *')
@AsSystem({
  principal: { id: 'session-cleanup', type: 'service' },
  grants: [{ action: 'delete', subject: 'Auth' }],
})
async purgeSessions() {
  await this.commandBus.execute(new PurgeExpiredSessionsCommand());
}
```

## Behavior

- **`withJobContext(data)`** returns a copy of `data` with `jobContext`: the tenant and
  the correlation id of the configured sources (a new one from the correlation source's
  `create()` when none is active), and the captured principal. It throws `MissingJobContextError` without a
  running `JobContextModule`, a tenant, or a principal, and `TypeError` for a payload that
  is not a plain object.
- **`@InJobContext()`** validates the payload's context before the method runs. It refuses
  a missing context (`MissingJobContextError`), and a malformed one, an unconfigured
  tenant, a correlation id the correlation source's `accepts` refuses
  (`correlationSource` accepts at most 128 characters of `A-Z a-z 0-9 . _ ~ : / + = @ -`), or a
  principal carrying any field beyond `id`, `type` and `sessionId`, such as grants
  (`InvalidJobContextError`). It then runs the method inside the tenant, the correlation
  id, and `restore(principal, work)`. The method becomes async.
- **`@AsSystem({ principal, grants })`** runs the method once per configured tenant, one
  after another, each with a new correlation id from `create()` and `restore(principal, work, grants)`. A
  failing tenant does not stop the others; the method then rejects with an
  `AggregateError` of the failures. Return values are discarded.
- **`JobContextModule.forRoot`** registers the principal port, tenants and sources when the module
  is instantiated and removes them at application shutdown. The decorators wrap methods
  outside dependency injection, so they use the registration of the running application;
  without one they fail closed. Register it once per application.

## Security

A payload is data: anyone who can write to the queue can write it. The package therefore
carries an identity reference only, never grants, and `restore` decides what that
identity may do now. Re-check a user's session and account in `restore`, so a revoked
session or a deleted user refuses the job. Grants come only from `@AsSystem`, in code.
The tenant must be one of the configured tenants.

## API

| Export | Kind | Description |
| --- | --- | --- |
| `withJobContext(data)` | function | Copies `data` and adds the current `jobContext` |
| `InJobContext(options?)` | decorator | Runs a job method in its payload's context; `path` defaults to `'data.jobContext'` |
| `AsSystem(options)` | decorator | Runs system work once per tenant as the declared principal and grants |
| `JobContextModule.forRoot(options)` | module | Registers `principal` (a class), `tenants`, `sources` and optional `imports` |
| `ContextSource`, `CorrelationSource`, `JobContextSources` | type | `{ current, run }`; the correlation source adds `create()` and `accepts(id)`; and the `{ tenantId, correlationId }` pair `sources` takes |
| `IJobPrincipal<TGrant>` | interface | Application port: `capture()` and `restore(principal, work, grants?)` |
| `PrincipalReference` | type | `{ id, type, sessionId? }` |
| `JobContext`, `WithJobContext<T>` | type | The carried context, and a payload with it |
| `MissingJobContextError`, `InvalidJobContextError` | error | Framework-neutral; map them in the consumer if needed |

## License

Dual-licensed under **AGPL-3.0-or-later** or a **Commercial License**. See
[`LICENSE`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/LICENSE) and [`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/nestjs-pipeline/blob/master/COMMERCIAL_LICENSE.txt)
at the repository root.
