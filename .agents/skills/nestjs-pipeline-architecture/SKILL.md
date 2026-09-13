# NestJS Pipeline Architecture Skill

Use this skill for any change that affects architecture, CQRS handlers, domain models, persistence, pipeline behaviors, authentication/authorization, caching, idempotency, events, queues, or application-layer services in this repository.

## Source of truth

This repository is authoritative. Before changing architecture-sensitive code, inspect the closest existing implementation and these documents:

- `README.md`
- `packages/pipeline/README.md`
- `packages/pipeline-cache/README.md`
- `ddd/core/README.md`
- `ddd/users-api/README.md`

If generic Clean Architecture / DDD / CQRS advice conflicts with this repository, follow the repository.

## Core architecture rules

### 1. Keep CQRS handlers business-focused

`@CommandHandler`, `@QueryHandler`, and `@EventsHandler` should contain business/application orchestration, not repeated technical concerns.

Use pipeline behaviors for cross-cutting concerns whenever the repository already has a behavior for them:

- logging
- metrics / tracing
- validation
- authorization at request/type level
- audit
- rate limiting
- retries / circuit breakers
- feature flags
- dead-letter handling
- idempotency
- pipeline-level caching

Do not add manual logging, correlation plumbing, timing, retry loops, audit records, or metrics calls inside handlers when a pipeline behavior already solves that concern.

### 2. Preserve repository boundaries

CQRS handlers must not inject or import ORM/database implementations.

Allowed in handlers:

- `ICommandRepository<...>`
- `IQueryRepository<...>`
- repository injection tokens from the bounded context

Not allowed in handlers/application services:

- `MIKRO_ORM_CLIENT`
- MikroORM `EntityManager`
- concrete database clients
- direct SQL
- concrete persistence stores such as `MikroOrmStore`

Persistence implementations belong in persistence/infrastructure adapters.

### 3. Do not leak infrastructure implementations into application code

Application/CQRS code must depend on ports/interfaces, not concrete infrastructure tools.

Examples of concrete infrastructure that should stay outside application handlers/services:

- BullMQ `Queue`
- `@nestjs/bullmq` injection decorators
- JWT implementation details such as `jose`
- raw environment-variable access for business flows
- persistence-specific tenant context implementations
- DB/network-specific transient-error classifiers

If the application needs one of these capabilities, define an application-facing interface/token and bind the implementation in the composition root/infrastructure module.

### 4. Keep HTTP semantics at the presentation boundary

Do not throw Nest `HttpException` subclasses from domain or application/CQRS code for business/application outcomes.

Avoid in handlers/application services:

- `NotFoundException`
- `ConflictException`
- `UnauthorizedException`
- `BadRequestException`
- `InternalServerErrorException`

Use framework-neutral domain/application errors and map them to HTTP in controllers/pipes/filters/interceptors.

Canonical repository pattern:

- domain/application throws `DomainException`, `OptimisticLockError`, or another framework-neutral error
- `DomainExceptionFilter` (or a dedicated presentation filter) maps it to HTTP

Do not move presentation exceptions inward for convenience.

### 5. Keep domain invariants and mutations inside aggregates

Use aggregate factories and domain methods for state changes.

Canonical examples:

- `User.create(...)`
- `user.update(...)`
- `user.delete()`
- `Role.create(...)`
- `role.rename(...)`
- `role.delete()`

Do not mutate aggregate state from application code using public setters even if a setter exists for hydration/compatibility reasons.

Do not instantiate aggregates in application code with `new Aggregate(snapshot)` merely to trigger a repository operation. Prefer a real domain operation or an explicit application port whose name expresses the intent.

### 6. Use `CommandBaseHandler` for command lifecycle and aggregate events

For aggregate-changing commands, prefer the repository's `CommandBaseHandler` pattern.

Handlers must return the aggregate root (or an application result containing `aggregate: AggregateRoot`) so `CommandBaseHandler.execute()` publishes buffered aggregate events automatically and clears uncommitted events.

Never publish or commit domain events manually inside command handlers. Presentation-specific transformations (such as mapping to response DTOs or session cookies) belong in the controller/presentation layer via dedicated mappers (e.g. `toSessionRes(result)`), while cookie lifecycle operations belong in `SessionService`.

### 7. Keep entity-level authorization in the application path

`CaslBehavior` handles request/type-level access rules. It does not replace authorization that depends on the actual loaded aggregate or response fields.

After loading/creating the aggregate, use `CaslAuthorizer` for:

- entity-level authorization
- field-level authorization
- response field filtering

Canonical references:

- `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`
- `ddd/users-api/src/users/cqrs/queries/get-user.handler.ts`
- `ddd/users-api/src/users/cqrs/queries/get-users.handler.ts`

### 8. Treat cache and idempotency short-circuiting as a security boundary

Pipeline cache/idempotency can return a result without executing the handler.

If the handler performs entity-level authorization or field filtering, a short-circuit key must include every security dimension that can change the result, including as applicable:

- tenant
- principal/user
- permission/capability scope or version
- request identity/payload

Never use a tenant-only cache key for a principal-specific or permission-filtered response.

The generic default cache key is safe only for results that are not principal/permission-specific. Use an explicit key for protected responses.

For multi-tenant security-sensitive keys, fail closed when tenant identity is required. Do not silently collapse missing tenant context into a shared `'default'` namespace unless the flow is explicitly single-tenant/dev-only.

### 9. Keep controllers as presentation adapters

Controllers may own:

- HTTP decorators/status codes
- DTO/pipeline validation
- request/session extraction
- mapping HTTP input to commands/queries
- mapping command/query results to HTTP/session output

Controllers should dispatch through `CommandBus` / `QueryBus`, not access repositories/ORM directly.

### 10. Keep composition and runtime configuration outside business code

Bind concrete implementations in Nest modules/composition roots.

Prefer application ports for:

- token issuance
- credential verification
- current tenant reading
- queues/message dispatch
- external APIs
- clocks/IDs when business-relevant
- configuration values used by application logic

Environment variables are acceptable in bootstrap/infrastructure/configuration modules, not as hidden dependencies inside application use cases.

## Event handling rules

Use event handlers for meaningful reactions to domain events, not merely to print logs.

For fire-and-forget infrastructure side effects:

1. keep the event handler thin;
2. inject an application port, not a concrete broker implementation;
3. use `DeadLetterBehavior` when failure capture/replay is required;
4. use correlation/logging behaviors instead of manual correlation/logging code where possible.

The Nest in-memory `EventBus` is not a transactional outbox. Do not promise durable at-least-once delivery unless an explicit outbox/message-broker architecture is introduced.

Do not add an outbox automatically just because DDD commonly recommends one. It is a separate architecture decision.

## Pipeline package rules

The core pipeline intentionally integrates deeply with NestJS CQRS. Some private Nest APIs are currently used for handler discovery/bootstrap compatibility.

Do not casually refactor away or expand private framework imports.

Current accepted technical risk includes `ExplorerService`/Nest internals used by the pipeline bootstrap. Any change there requires:

- explicit compatibility reasoning
- tests for supported Nest major versions
- README/ADR update if behavior or compatibility changes

Do not use the unused CQRS metadata re-export as a precedent for more `@nestjs/cqrs/dist/*` imports.

## Query rules

Queries should be side-effect free from the business perspective.

Query handlers:

- depend on `IQueryRepository`
- perform authorization/filtering after loading when required
- return snapshots/read models
- must not mutate aggregates or persist writes

Repository-level read-through cache (`@FromCache`) is a good fit for authorization-independent aggregate data. Pipeline cache is appropriate only when its key safely partitions all dimensions of the final response.

## Command rules

Command handlers should express the use case in a small sequence:

1. load required aggregate(s) through repository interfaces;
2. fail with framework-neutral application/domain errors if preconditions are not met;
3. authorize against the real aggregate if required;
4. call aggregate domain methods;
5. persist through `ICommandRepository`;
6. return aggregate or explicit result;
7. let `CommandBaseHandler` manage aggregate event publication.

Cross-cutting concerns belong in `@UsePipeline(...)` declarations or module-wide behavior configuration.

## Repository implementation rules

Concrete repositories may use ORM/database APIs and cache implementations.

Repositories are responsible for persistence mechanics such as:

- persistence mapping/rehydration
- optimistic locking
- cache invalidation/read-through caching
- tenant-specific DB access
- translating low-level persistence errors into framework-neutral errors when required by the application contract

Do not throw HTTP exceptions from repositories.

## Domain model rules

Domain models must remain free from:

- HTTP/Nest presentation exceptions
- ORM decorators or DB-specific types unless the repository explicitly standardizes otherwise
- queue/broker APIs
- environment variables
- logging/telemetry

Use `DomainException` subclasses for invariants/business errors.

Creation factories should record creation events. Rehydration methods must not record creation events.

Application code should not bypass factories/domain methods by using public constructors directly.

## Security checklist before finishing a change

Before finalizing an architecture-sensitive change, verify:

- [ ] No ORM/database implementation leaked into a handler/application service.
- [ ] No HTTP exception leaked into domain/application code.
- [ ] No BullMQ/JWT/env/config implementation leaked into a use case that could depend on a port.
- [ ] Cross-cutting concerns use pipeline behaviors when available.
- [ ] Entity/field authorization still runs against the actual aggregate/result.
- [ ] Cache/idempotency keys contain tenant + principal + permission scope when required.
- [ ] Missing tenant context cannot merge security-sensitive operations into a shared namespace.
- [ ] Aggregate mutations use domain methods/factories, not setters/synthetic snapshots.
- [ ] Command event publication follows `CommandBaseHandler` semantics.
- [ ] Query handlers do not perform writes.
- [ ] Controllers remain presentation adapters.
- [ ] Event handlers do not exist only for observability logging.
- [ ] New infrastructure dependency is introduced through a port unless it is clearly a composition/presentation adapter.
- [ ] Tests cover the relevant architectural boundary and security behavior.

## Positive examples to copy

Prefer adapting these files rather than inventing a new pattern:

- Command + pipeline + domain mutation: `ddd/users-api/src/users/cqrs/commands/create-user.handler.ts`
- Command update flow: `ddd/users-api/src/users/cqrs/commands/update-user.handler.ts` (copy repository/domain/authorization flow, but do **not** copy its current `NotFoundException` boundary leak)
- Authorized single query: `ddd/users-api/src/users/cqrs/queries/get-user.handler.ts`
- Authorized collection query: `ddd/users-api/src/users/cqrs/queries/get-users.handler.ts`
- Domain aggregate: `ddd/users-api/src/users/domain/models/user.entity.ts`
- Framework-neutral domain error: `ddd/users-api/src/users/domain/models/errors/email.exception.ts`
- HTTP mapping boundary: `ddd/users-api/src/common/filters/domain-exception.filter.ts`
- Command lifecycle: `ddd/core/application/command-base.handler.ts`

## Known anti-patterns currently present

Do not copy these patterns into new code:

- Nest `NotFoundException` in update/delete command handlers
- `UserLoginService` reading env, signing JWTs, throwing HTTP exceptions, and importing persistence tenant context as one application service
- CQRS event handlers injecting BullMQ queues directly
- event handlers that only call `Logger`/`getCorrelationId()`
- CQRS handlers importing `@persistence/is-transient-persistence-error`
- tenant-only pipeline cache keys for responses filtered by principal permissions
- synthetic `new Auth({ userId, token: '' })` used as a delete command payload
