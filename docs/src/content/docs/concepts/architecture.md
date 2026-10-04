---
title: "Runtime architecture"
sidebar:
  order: 1
---

The runtime execution architecture coordinates incoming HTTP requests across four Clean Architecture layers: presentation edge, pipeline interceptors, CQRS application & DDD domain models, and authoritative multi-tenant persistence.

## Interactive architecture map

The map below visualizes the execution lifecycle of a CQRS mutation command across the four runtime layers, showing behavior ordering, context propagation, aggregate versioning, and persistence acknowledgment.

<iframe
  src="/nestjs-pipeline/architecture/runtime-architecture.html"
  title="NestJS Pipeline Runtime Architecture Map"
  style="width: 100%; height: 780px; border: 1px solid var(--sl-color-gray-5); border-radius: 8px; margin-top: 1rem; margin-bottom: 1.5rem;"
></iframe>

[Open interactive map in full screen &rarr;](/nestjs-pipeline/architecture/runtime-architecture.html)

## Runtime layers

### 1. Presentation layer (API & ingress)

- **`TenantSchemaMiddleware`**: Resolves the multi-tenant identifier from request headers, validates it against persistence configuration, and establishes the tenant search path (`TenantSchemaContext`) before route handling.
- **`AuthSessionGuard`**: Validates session cookies and bearer credentials via `RequestPrincipalResolver`, attaching `req.sessionPrincipal` and CASL ability attributes to the request context.
- **`UsersController`**: Validates payload schemas with Zod (`CreateUserDtoSchema`), translates the input into a `CreateUserCommand`, and dispatches it through the CQRS command bus.
- **`CommandBus`**: Dispatches the command into the pipeline runner attached at application bootstrap.

### 2. Pipeline interceptor layer (cross-cutting onion)

- **`PipelineRunner`**: Bound during application bootstrap to wrap handler methods with an onion delegate chain inside `AsyncLocalStorage` (`pipelineStore`). Seeds `tenantId` and `correlationId` into `PipelineContext`.
- **`LoggingBehavior`**: Measures execution latency, logs requests and responses, and redacts sensitive payload properties using `@cqrs-ddd/safe-stringify`.
- **`CaslBehavior`**: Enforces type-level authorization rules (`requires({ action, subject })`) before handler logic runs, failing closed with `UnauthorizedActionException`.
- **`IdempotencyBehavior`**: Claims an operation token in Redis before execution. On replay, compares the stored `requireAbilityDigest` to ensure the caller has not lost privileges.

### 3. Application & domain layer (CQRS & DDD core)

- **`ICommandHandler` & `EventPublisher`**: Handlers implement NestJS's `ICommandHandler<C, R>` with `execute()`. Domain events are committed through NestJS's `EventPublisher` (`publisher.mergeObjectContext(aggregate).commit()`) after durable repository persistence.
- **`CreateUserHandler`**: Orchestrates aggregate creation (`User.create()`), evaluates post-mutation CASL field authorization (`authorizer.authorize()`), delegates persistence to the command repository, and commits domain events.
- **`User` aggregate root**: Encapsulates business invariants, applies `UserCreatedEvent`, and tracks the expected entity version baseline. Setters remain private for ORM hydration.

### 4. Persistence & infrastructure layer (authoritative database & queues)

- **`@PersistedWrite`**: Enforces strict lifecycle ordering around repository persistence: `@Cache` (invalidates secondary lookup keys) &rarr; `@AcknowledgePersisted` &rarr; `@MapPersistenceErrors`.
- **`CreateUserCommandRepository`**: Asserts autocommit, persists the aggregate via the tenant-scoped `EntityManager`, and calls `user.acknowledgePersisted()` only after database commit succeeds.
- **`UserCreatedHandler`**: Consumes `UserCreatedEvent` under `@UsePipeline(deadLetter())`, enqueuing the background welcome email job.
- **`BullMQ Queue`**: Carries asynchronous background tasks with Redis dead-letter backup, propagating `JobContext` metadata (tenant, correlation ID, and principal) across job boundaries.
