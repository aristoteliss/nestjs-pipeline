# Engineering & Contribution Guidelines

These guidelines apply to all contributors and engineers making changes in this repository.

## The Two Repositories

Two sibling repositories form one unified architecture:

| | ddd-cqrs | nestjs-pipeline |
| --- | --- | --- |
| Path | `~/Source/ddd-cqrs` | `~/Source/nestjs-pipeline` |
| GitHub | https://github.com/aristoteliss/ddd-cqrs | https://github.com/aristoteliss/nestjs-pipeline |
| Owns | The framework-neutral `@cqrs-ddd/*` packages (published from 0.5.0), and non-NestJS implementations (Express, Fastify, integration suites); the documentation site; the local registry | The complete NestJS reference implementation: `api/`, a production NestJS application on `@nestjs/cqrs` using `@cqrs-ddd/*` packages; legacy `@nestjs-pipeline/*` packages (0.4.x line) |

### How They Connect

- **NestJS stays NestJS here**: `api` leverages standard NestJS and `@nestjs/cqrs` primitives: modules, dependency injection, controllers, `CommandBus`, `QueryBus`, `EventBus`, `@CommandHandler`, `@QueryHandler`, `@EventsHandler`, and `EventPublisher`. The `@cqrs-ddd` packages add pipeline behaviors and DDD building blocks without replacing framework buses. The integration layer is `@cqrs-ddd/nestjs`, published from `ddd-cqrs`.
- **Package code lives in `ddd-cqrs`**: `nestjs-pipeline` consumes packages via npm/local registry and never patches external library code locally.
- **Dependencies point one way**: `nestjs-pipeline` depends on `@cqrs-ddd/*`; no `@cqrs-ddd` package imports `@nestjs-pipeline/*`.
- **Pre-publish verification**: Package integration is validated against local Verdaccio registry (`http://127.0.0.1:4873/`) before publishing.

---

## Architecture-Sensitive Areas

Before changing any of the following areas, ensure strict adherence to repository invariants:

- NestJS CQRS commands, queries, or event handlers
- Pipeline behaviors and decorators
- Clean Architecture / DDD boundaries
- Domain entities, domain events, or domain errors
- Repositories, persistence, ORM/database access, and caching
- Authentication, authorization, tenant context, sessions, and JWTs
- Idempotency, retries, rate limiting, auditing, metrics, and tracing
- Queues, background jobs, external services, or infrastructure adapters
- Application services or composition-root/module wiring

---

## Working Discipline & Engineering Principles

### 1. Think Before Coding
- State assumptions explicitly.
- Surface tradeoffs and present alternative designs early.
- Push back on unnecessary complexity.

### 2. Simplicity First
Write the minimal code that solves the problem robustly. Nothing speculative.
- No unrequested features or premature abstractions for single-use code.
- No speculative flexibility or configurability.
- No error handling for logically impossible scenarios.
- Always ask: *would a senior staff engineer call this overcomplicated?* If yes, simplify.

### 3. Surgical Changes
Touch only what is strictly necessary:
- Avoid touching adjacent code, formatting, or comments unnecessarily.
- Do not refactor unrelated working components.
- Match existing repository style and conventions.
- Remove imports, variables, and functions made unused by your changes.

### 4. Goal-Driven Execution
Define verifiable success criteria for every task:
- Bug fix: write a reproducing test first, then make it pass.
- New feature: write contract and validation tests, then implement.
- Refactoring: ensure full test suite passes before and after.

---

## Documentation and Code Style Policy

- **Documentation as Current-State Manual**: Docs and READMEs describe current contracts, APIs, and behaviors. Avoid historical narratives ("previously", "used to", "after the fix").
- **JSDoc Requirements**: Every exported function and public method of exported services/helpers must carry useful JSDoc stating what it does beyond its name, parameter constraints, return values, errors, and a realistic `@example`. Avoid tautological comments that merely repeat the signature.
- **Clean CQRS Handlers and Domain Models**: CQRS handlers, commands, queries, and ordinary domain entities carry no inline commentary or narrative JSDoc. Code should read plainly; express invariants in test names.
- **Concise Mechanism Comments**: Inline comments are reserved for complex, non-obvious core mechanisms (pipeline internals, concurrency controls, cache coordination).
- **Professional Codebase Standards**: Never include decorative ASCII banners, box borders, or conversational signposting. Keep comments factual, concise, and focused on technical constraints.

---

## Naming Conventions

Good names are short, declarative, and unambiguous within their scope:

- **Context-aware**: The enclosing module, class, or function is part of the name (`sessionService.save(...)`, not `saveSession`; `user.email`, not `user.userEmail`).
- **No Redundant Affixes**: Avoid layer suffixes like `...Impl`, `...Manager`, `...Helper`, or status markers (`new`, `old`, `v2`). Architectural role suffixes stay (`...Command`, `...Handler`, `...Query`, `...Repository`, `...Dto`).
- **Booleans**: Read as yes/no predicates (`isExpired`, `hasPipeline`, `embedPermissions`).
- **Methods**: Imperative verbs (`revoke`, `issue`, `hash`); types and values are nouns.
- **Explicit Units**: Bare numeric durations declare their unit (`ttlMs`, `graceSeconds`). Numeric timestamps (`...At`) represent Unix epoch milliseconds unless specified otherwise.
- **File Naming**: Kebab-case with role suffix (`create-user.handler.ts`, `session-cookies.port.ts`).

---

## Core Non-Negotiable Architecture Rules

1. **Handler Decoupling**: CQRS handlers depend exclusively on repository and application interfaces/ports, never directly on ORM clients or concrete infrastructure implementations.
2. **Error Boundary Mapping**: Domain and application code must never throw framework-specific HTTP exceptions (`BadRequestException`, `NotFoundException`). Throw domain errors (`DomainException`, `EntityNotFoundException`, `ConcurrencyConflictError`) and map them at the presentation boundary via exception filters.
3. **Cross-Cutting Pipeline Behaviors**: Cross-cutting concerns (validation, authorization, caching, auditing, metrics, tracing) belong in pipeline behaviors, keeping handlers focused on business logic.
4. **Post-Load Authorization**: Entity-level authorization and field-level filtering occur after the real aggregate/result is loaded.
5. **Security-Scoped Caching & Idempotency**: Cache and idempotency keys must incorporate tenant, principal, and permission scope whenever those dimensions alter the authorized response. Fail closed if required security context is missing.
6. **Aggregate Mutation Invariants**: Aggregates are mutated exclusively through domain methods and factories, never direct property setters. Setters remain private and exist only for ORM hydration (`accessor: true`).
7. **Infrastructure Ports**: External systems (queues, JWT libraries, environment access, persistence contexts) sit behind application-facing ports. Current tenant context is accessed via `requireTenant(purpose)`.
8. **Event Publishing Contract**: Aggregate changes publish domain events via NestJS `EventPublisher`: `this.publisher.mergeObjectContext(aggregate)`, persist, and then `await aggregate.commit()`.
9. **Persistence Lifecycle Decorators**: Write operations (`save()`) must use declarative decorators: `@PersistedWrite(...)` or the canonical order: `@Cache(...)` -> `@AcknowledgePersisted(...)` -> `@MapPersistenceErrors(...)`.
10. **Versioned Writes & Optimistic Concurrency**: Entity updates require version-conditioned writes (`optimisticUpdate()`) matching `WHERE id = ? AND version = expectedVersion`. Deletions condition on `{ id, version: aggregate.getExpectedVersion() }` to distinguish missing records from concurrency conflicts.
11. **Cache Snapshot Parity**: Repository cache adapters store strictly serializable snapshots (`ICache<TSnapshot>`), never live aggregate instances. `MemoryCache` enforces deep detachment via JSON cloning. Query repositories return strictly domain aggregates (`Promise<User | null>`).
12. **Freshness & Mutation Barriers**: Commands perform authoritative write-side aggregate loading from primary storage. Anti-resurrection mechanisms (`CacheMutationBarrier`, revision-fenced fills) prevent race conditions between database writes and cache populations.
13. **Configuration Single Source of Truth**: External systems have exactly one config module (`<system>.config.ts`), validating environment variables at startup and exposing typed settings. Packages take options via module registration, never reading `process.env` directly.

