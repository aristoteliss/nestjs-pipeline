# `nestjs-pipeline` Architecture & Code Review

**Reviewed snapshot:** `master` @ `ae9f82002e96f291f5fa89331697cb42d15a4764`  
**Primary lenses:** DDD, Clean Architecture, CQRS, dependency direction, abstraction quality, package boundaries, correctness, maintainability, tests, framework coupling, and long-term evolution.

---

# 1. Executive assessment

The repository is **not generally AI-generated slop**.

The published pipeline packages are, for the most part, deliberately designed, documented, tested, and internally coherent. The strongest parts are the cross-cutting behavior packages: cache, idempotency, CASL, resilience, rate limiting, audit, feature flags, dead-letter handling, correlation, Zod, and most of the OpenTelemetry package. They generally expose one narrow responsibility, depend on small contracts, document ordering semantics, and do not pretend that every implementation detail must be framework-neutral.

The weakest area is instead concentrated in the **DDD reference application and `ddd-core` boundary model**.

The main architectural pattern I see is:

> The repository has increasingly strong written architectural rules, but several older application-layer implementations still predate those rules.

That explains why the latest commit fixes write-side hydration, not-found boundaries, aggregate event publication, tenant isolation, etc., while other closely related violations remain.

The highest-value work is therefore **not another redesign of the pipeline core**. It is finishing the boundary cleanup in `ddd/users-api`, making the DDD contracts explicit enough that violations cannot silently reappear, and resolving a few lifecycle contracts introduced by the recent refactors.

### Overall assessment

| Area | Assessment |
|---|---|
| Pipeline core model | **Strong, intentional design** |
| Add-on behavior packages | **Strong overall** |
| Cross-package behavior conventions | **Coherent rather than duplicated** |
| DDD domain modeling | **Improved, but ORM concerns still weaken invariants** |
| Application-layer boundaries | **Main architectural weakness** |
| CQRS separation | **Mostly good, with several important exceptions** |
| Infrastructure isolation | **Incomplete in auth/events/retry policy** |
| Test quality | **Good behavioral regression coverage, weak architectural rule enforcement** |
| Documentation | **Very detailed but currently drifting behind the implementation** |
| Framework independence | **Appropriate in published add-ons; inconsistent in DDD/application code** |

My suggested priority is:

**P0 security/configuration → P1 application boundaries → P1 aggregate/event lifecycle → P2 domain persistence separation → P2 compatibility enforcement → P3 observability/docs cleanup.**

---

# 2. Decisions that should remain untouched

Before the defects, several things should **not** be “cleaned up.”

## Keep: Pipeline core's deliberate NestJS/CQRS coupling

`AGENTS.md` explicitly treats the private Nest/CQRS bootstrap integration as accepted risk, and `PipelineBootstrapService` contains that coupling in one place. The implementation uses `ExplorerService`, `InstanceWrapper`, prototype wrapping, runner lookup, and scoped-context machinery. That is sophisticated and fragile, but it exists to solve a real integration problem rather than to manufacture abstraction. 

Do **not** replace this with another framework-neutral dispatcher merely to claim Clean Architecture. The pipeline itself is a NestJS library.

The right improvement is compatibility testing, discussed later.

## Keep: global `PipelineModule` semantics

The documented model that `PipelineModule` is global and `forFeature()` is organizational registration rather than feature-local DI isolation is coherent with the package's purpose.

Changing it to mimic local Nest module scoping would increase conceptual complexity and likely make pipeline composition harder to reason about.

## Keep: separate cross-cutting behavior packages

The similarity between:

- `AuditBehavior`
- `CacheBehavior`
- `RateLimitBehavior`
- `FeatureFlagBehavior`
- `ResilienceBehavior`
- `DeadLetterBehavior`
- `IdempotencyBehavior`

is **not harmful duplication**.

Their common shape—resolve module defaults, merge handler options, execute cross-cutting concern, use a backend contract—is exactly the kind of convention a package family should have. `AuditBehavior`, for example, has a small `AuditSink`; `DeadLetterBehavior` has a `DeadLetterTransport`; rate limiting uses a structural limiter interface.   

Do not merge these into a generic “middleware behavior framework.”

That would create precisely the abstraction-heavy system your architectural guidance is trying to avoid.

## Keep: Zod's in-place request transformation

`ZodValidationBehavior` deliberately preserves the existing CQRS request instance, updates validated fields in place, rejects non-record top-level transforms, and records validation state. The README explicitly explains why.  

It looks unusual in isolation, but replacing the CQRS object would introduce a different class of request-identity problems.

## Keep: authorization after repository-cache hydration

`GetUserHandler` is a good pattern. Its repository can cache persistence snapshots, but the handler rehydrates a `User` aggregate and performs entity authorization afterward. Therefore cached data is not an already-authorized principal-specific response.  

That is much safer than pushing every security dimension into every cache key.

## Keep: write-side hydration introduced by the latest refactor

`UpdateUserHandler` now reads authoritative state through `IWriteSideAggregateRepository`, rehydrates the aggregate, authorizes it, calls the domain mutation, persists it, and returns the aggregate. 

This is the correct direction.

The old audit entry describing mutation commands loading through cached query repositories is now stale and should be marked resolved.

---

# ~~3. Finding F-01 — `UserLoginService` is an application-layer boundary collapse~~

> **Resolved.** Verified at commit `ba0b57d`. `SessionService` owns cookies; `UserLoginService` depends on `ILoginCodeVerifier` and `IAccessTokenIssuer` ports. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** HIGH  
**Category:** Clean Architecture / Application Architecture / Authentication  
**Status:** Mandatory  
**Primary files:**

- `ddd/users-api/src/auths/services/user-login.service.ts`
- `ddd/users-api/src/auths/cqrs/commands/create-auth.handler.ts`
- `ddd/users-api/src/auths/controllers/auths.controller.ts`

## Current design

`UserLoginService` currently knows about:

- Fastify `Session`
- Nest `InternalServerErrorException`
- Nest `UnauthorizedException`
- `QueryBus`
- `process.env`
- `JWT_SECRET`, algorithms, issuer and audience configuration
- `jose.SignJWT`
- `node:crypto.randomUUID`
- concrete `TenantSchemaContext`
- `SessionService`
- user query repositories
- capability queries
- JWT construction.

It even accepts either a Fastify session or an object resembling an HTTP request in `extractCredentials()`. 

`CreateAuthHandler` additionally injects the persistence `TenantSchemaContext` directly. 

`AuthsController.logout()` calls back into this “application service” to interpret Fastify session/header state. 

## Why this is problematic

This one class currently spans:

**presentation → application → infrastructure → persistence → configuration → cryptography.**

That is more serious than simply having “too many dependencies.”

It prevents the application workflow from stating its real contract.

The actual application requirement is approximately:

> Verify credentials, load the user, resolve capabilities, issue an access token for the current tenant, return authentication information.

None of those requirements imply Fastify, environment variables, JOSE, Nest HTTP exceptions, or `TenantSchemaContext`.

It also conflicts directly with the repository's rule that JWT/env/config/persistence contexts used by application code belong behind application-facing ports. 

## Resulting dependency direction today

```text
Application
   ↓
Nest HTTP
Fastify
JOSE
process.env
Persistence TenantSchemaContext
Nest QueryBus
```

The dependency direction is inverted.

## Target design

Do **not** create a generic authentication framework.

Introduce only the seams that correspond to concrete volatility:

```ts
interface LoginCodeVerifier {
  verify(email: string, code: string): Promise<void>;
}

interface AccessTokenIssuer {
  issue(input: {
    user: User;
    capabilities: UserCapabilities;
    tenantId: string;
  }): Promise<IssuedAccessToken>;
}

interface CurrentTenant {
  readonly id: string;
}

interface UserCapabilityReader {
  forUser(userId: string): Promise<UserCapabilities>;
}
```

Then application orchestration becomes roughly:

```ts
class AuthenticateUser {
  constructor(
    private readonly verifier: LoginCodeVerifier,
    private readonly users: UserReader,
    private readonly capabilities: UserCapabilityReader,
    private readonly tokenIssuer: AccessTokenIssuer,
    private readonly tenant: CurrentTenant,
  ) {}

  async execute(email: string, code: string): Promise<AuthResult> {
    await this.verifier.verify(email, code);

    const user = await this.users.byEmail(email);
    if (!user) throw new InvalidCredentialsError();

    const capabilities = await this.capabilities.forUser(user.id);

    return this.tokenIssuer.issue({
      user,
      capabilities,
      tenantId: this.tenant.id,
    });
  }
}
```

Concrete adapters can remain simple:

```text
infrastructure/auth/
  EnvLoginCodeVerifier
  JoseAccessTokenIssuer

infrastructure/tenant/
  TenantSchemaCurrentTenantAdapter
```

The current demo `AUTH_LOGIN_CODE` is acceptable as a **demo adapter**. The defect is that it currently *is the application service*.

## Presentation cleanup

Delete `UserLoginService.extractCredentials()`.

Its only real production caller is logout presentation code. The controller/guard layer should resolve session/header credentials using presentation/auth adapters rather than routing HTTP structures through the login use case. 

## Migration

This can be incremental:

1. Extract `AccessTokenIssuer`.
2. Extract `LoginCodeVerifier`.
3. Replace `TenantSchemaContext` with `CurrentTenant`.
4. Move logout credential extraction out of `UserLoginService`.
5. Replace HTTP exceptions with application errors.
6. Map them in presentation filters.
7. Finally remove `QueryBus` from `UserLoginService`.

## Tests required

Add unit tests for the application workflow using pure fake ports.

Keep JOSE integration tests on `JoseAccessTokenIssuer`.

Add an architecture test that application directories cannot import:

```text
@fastify/*
@persistence/*
jose
@nestjs/common HttpException subclasses
process.env configuration modules
```

## Expected benefit

This change removes the repository's largest concentration of architectural coupling and makes the authentication example actually demonstrate the architecture the documentation claims.

---

# ~~4. Finding F-02 — CQRS event handlers are acting as BullMQ/infrastructure adapters~~

> **Resolved.** Verified at commit `ba0b57d`. Handlers inject `IWelcomeEmailDispatcher` / `IUserBatchDispatcher`; `BullMqUserEventDispatcher` is the adapter. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** HIGH  
**Category:** Ports & Adapters / Messaging / Clean Architecture  
**Status:** Mandatory  
**Files:**

- `users/cqrs/events/user-created.handler.ts`
- `users/cqrs/events/user-updated.handler.ts`
- `users/jobs/send-welcome-email.processor.ts`
- `users/jobs/batch-update-users.processor.ts`

## Current design

`UserCreatedHandler` directly injects a BullMQ `Queue`, reads `TenantSchemaContext`, manually reads correlation state, constructs queue payloads, and queues jobs. 

`UserUpdatedHandler` repeats the same infrastructure direction. 

The processors then depend directly on `TenantSchemaContext` to recreate tenant execution state. 

The recent mixed-tenant batch validation is good and should remain. `resolveBatchTenant()` validates the entire batch before entering the tenant context. 

## Why it matters

The problem is not “BullMQ is bad.”

BullMQ belongs in an adapter.

The problem is that an application event handler currently specifies:

- broker API
- queue name
- job shape
- BullMQ options
- transport correlation mechanics
- persistence-based tenant execution.

That makes switching the messaging transport require changing application handlers.

It also spreads tenant restoration rules over unrelated job implementations.

## Target

Introduce use-case-oriented outbound ports:

```ts
interface WelcomeEmailJobs {
  enqueue(job: WelcomeEmailRequest): Promise<void>;
}

interface UserBatchJobs {
  enqueueUpdate(job: BatchUserUpdateRequest): Promise<void>;
}
```

Then:

```ts
@EventsHandler(UserCreatedEvent)
class UserCreatedHandler {
  constructor(private readonly jobs: WelcomeEmailJobs) {}

  handle(event: UserCreatedEvent) {
    return this.jobs.enqueue({
      userId: event.payload.id,
      username: event.payload.username,
      email: event.payload.email,
    });
  }
}
```

The BullMQ adapter should add:

- tenant metadata
- correlation ID
- queue names
- retry/job options.

That adapter belongs under something like:

```text
infrastructure/messaging/bullmq/
```

## Important constraint

Do **not** introduce a generic `MessageBus<T>` merely to hide BullMQ.

`WelcomeEmailJobs` is better because it represents application intent.

## Event durability

The repository correctly documents that Nest `EventBus` is **not a transactional outbox**.

Keep that explicit.

If eventual durable delivery becomes a product requirement, introduce an outbox as a separate architectural decision rather than pretending this refactor gives transactional guarantees.

---

# 5. Finding F-03 — JWT revocation silently fails open when one provider disappears

**Severity:** HIGH  
**Category:** Security / DI contract  
**Status:** Mandatory  
**File:** `auths/services/jwt-authenticator.ts`

`JwtAuthenticator` declares the auth lookup repository with `@Optional()`. When it exists, the token must correspond to a live persisted auth record. If DI configuration accidentally omits that provider, the entire revocation/session-ended check disappears. 

The current `AuthsModule` does bind `QUERY_REPOSITORY.findAuth`, so this is not a present production misconfiguration; it is a dangerous **fail-open contract** waiting for a composition change. 

## Why this is worse than normal optional DI

The semantic difference is:

```text
provider installed   → revoked JWTs are rejected
provider absent      → revoked JWTs remain valid until cryptographic expiration
```

Yet both boot successfully.

A security feature must not disappear because of dependency registration drift.

## Fix

If revocation is part of the application's authentication contract, remove `@Optional()`.

If you intentionally support two operating modes, model the choice explicitly:

```ts
type RevocationPolicy =
  | { mode: 'persistent'; store: TokenRevocationStore }
  | { mode: 'stateless' };
```

or bind one of:

```text
PersistentTokenSessionValidator
StatelessTokenSessionValidator
```

The composition root must choose.

**Absence of a provider should never choose the weaker security mode.**

---

# 6. Finding F-04 — aggregate event publication is controlled by handler return shape

**Severity:** HIGH  
**Category:** DDD / CQRS / Hidden lifecycle contract  
**Status:** Strongly recommended  
**Files:**

- `ddd/core/application/command-base.handler.ts`
- `command-base.handler.spec.ts`

## Current behavior

`CommandBaseHandler.execute()` calls `handle()` and then inspects the returned value.

Events are automatically published if the result is:

```text
AggregateRoot
```

or:

```ts
{
  aggregate: AggregateRoot,
  ...
}
```

Otherwise publication does not happen unless the handler manually calls protected `commit()`. 

The test suite explicitly blesses all three approaches, including manual `this.commit(agg)`. 

## Why this is dangerous

Application response shape and event lifecycle are different concerns.

This means a refactor from:

```ts
return aggregate;
```

to:

```ts
return mapper.toResponse(aggregate);
```

can silently stop domain events.

Similarly, a command mutating two aggregates has no clear automatic publication contract.

The type system cannot detect either mistake.

The newer `AGENTS.md` rule saying handlers should follow automatic `CommandBaseHandler` publication semantics therefore conflicts with the protected manual-publication escape hatch.

## Preferred redesign

The most complete model would be a Unit of Work that tracks saved aggregates, but that is probably excessive for this repository today.

A smaller explicit solution is preferable.

For example:

```ts
interface CommandResult<T> {
  value: T;
  changedAggregates?: readonly AggregateRoot[];
}
```

or better, make persistence register aggregate changes:

```ts
await this.aggregateRepository.save(user);
// repository/UoW registers user for post-success publication
return mapper.toResponse(user);
```

Then event publication is tied to the state change, not the controller-facing result.

## Minimal transition

Until that exists:

1. Remove or deprecate protected `commit()`.
2. Define a single explicit result envelope.
3. Support `aggregates: readonly AggregateRoot[]`, not only one `aggregate`.
4. Test that response refactors cannot suppress publication.
5. Test multiple aggregate publication.

## Important

Do **not** replace Nest `EventBus` merely for abstraction purity.

The real defect is the hidden publication trigger, not the EventBus itself.

---

# ~~7. Finding F-05 — successful optimistic saves do not advance the aggregate's persistence baseline~~

> **Resolved.** Verified at commit `ba0b57d`. `@AcknowledgePersisted` captures the version before the await and advances the baseline only on resolution. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** HIGH/MEDIUM  
**Category:** Correctness / Aggregate lifecycle / Persistence  
**Status:** Mandatory  
**Files:**

- `ddd/core/domain/models/root.entity.ts`
- `users/persistence/update-user.command-repository.ts`
- `roles/persistence/update-role.command-repository.ts`

`RootEntity` tracks both a current version and `_persistedVersion`; `getExpectedVersion()` represents the version persistence should compare against. 

The new write repositories correctly issue optimistic updates such as:

```ts
WHERE id = user.id
  AND version = user.getExpectedVersion()

SET version = user.version
```

But after the update succeeds, they simply return `user.toJSON()`. They do not update the aggregate's persisted baseline. 

`UpdateRoleCommandRepository` behaves the same way. 

## Failure mode

Assume:

```text
persistedVersion = 1
current version = 1
```

Domain mutation:

```text
persistedVersion = 1
current version = 2
```

Successful save writes DB `version=2`.

The in-memory aggregate still has:

```text
persistedVersion = 1
current version = 2
```

Another legitimate mutation changes the current version again, but the next save still compares the database against `1`.

The aggregate conflicts with its own previous write.

Current handlers generally perform one save, which hides the defect.

The reusable contract is nevertheless wrong.

## Fix

Give the aggregate lifecycle an explicit persistence acknowledgment:

```ts
aggregate.markPersisted();
```

where:

```ts
markPersisted(): void {
  this._persistedVersion = this._version;
}
```

Only call it **after successful persistence**.

Prefer returning the new version from persistence if databases may generate it.

Tests:

```text
load v1
mutate → v2
save
mutate → v3
save
expect both saves to succeed
```

Also verify failed saves do **not** advance the baseline.

---

# ~~8. Finding F-06 — direct ORM hydration forces aggregates to expose invalid public construction paths~~

> **Resolved.** Verified at commit `ba0b57d`. `IWriteSideAggregateRepository<TEntity>` returns rehydrated aggregates; command handlers never see snapshots. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** MEDIUM/HIGH  
**Category:** DDD / Domain invariants / Persistence leakage  
**Status:** Strongly recommended  
**Files:**

- `User`
- `Role`
- `Auth`
- MikroORM schemas

The source documentation says `User.create()` and `Role.create()` are the creation paths that guarantee invariants and events.

Yet:

```ts
new User()
new Role()
new Auth()
```

are all legal.

They create empty-string state.   

This appears to exist primarily so MikroORM can directly hydrate the domain aggregate.

Likewise public property setters are documented as persistence hydration seams.

## Why it matters

The domain currently says two contradictory things:

```text
“Only factories create valid entities.”
```

and:

```text
“Any caller can construct an empty entity.”
```

Documentation cannot enforce an invariant.

## Best architecture

Separate persistence records from aggregates:

```text
persistence/models/UserRecord
        ↓ mapper
domain/User
```

Then the domain can have private/protected constructors with:

```ts
User.create(...)
User.reconstitute(snapshot)
```

and persistence can mutate its own record structures freely.

## Cost

This introduces mapper code.

For a small example application, that is a real cost.

Therefore I would not introduce a giant generic mapper framework.

Use explicit small mappers:

```ts
UserMapper.toDomain(record)
UserMapper.toRecord(user)
```

## Alternative

If keeping direct MikroORM aggregate mapping is considered an intentional teaching simplification, document it explicitly as a deliberate compromise and stop claiming that invalid construction is impossible.

For a repository positioning the example as a Clean Architecture / DDD reference, I prefer the explicit persistence model.

---

# ~~9. Finding F-07 — `GetUserContextQueryRepository` combines three unrelated responsibilities~~

> **Resolved.** Verified at commit `ba0b57d`. Split: the repository is persistence-only, `CaslUserContextResolver` owns request/session extraction, and principal type is explicit rather than inferred from ID shape. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** MEDIUM/HIGH  
**Category:** SRP / Security / Identity modeling  
**Status:** Strongly recommended  
**File:** `users/persistence/get-user-context.query-repository.ts`

This class currently:

1. reads principal information from request objects,
2. reads ambient ALS/session context,
3. queries MikroORM,
4. implements the CASL `IUserContextResolver`,
5. serves a `find(GetUserContextQuery)` repository-style API,
6. decides whether a missing user is a database principal based on a UUID regex.



This is not primarily a naming problem.

It has two separate reasons to change:

```text
authentication/principal representation changes
persistence/user lookup changes
```

## Most concerning part: ID-shape authentication policy

A missing principal whose ID looks like a UUID is considered a database user and rejected.

A missing principal with a non-UUID ID can remain valid if explicit capabilities were supplied.

That means identifier syntax implicitly determines identity type.

Future machine principals using UUIDs or users using non-UUID identifiers can change authorization semantics without changing authentication policy.

## Fix

Make identity type explicit:

```ts
type Principal =
  | { kind: 'user'; id: UserId; ... }
  | { kind: 'service'; id: ServicePrincipalId; capabilities: ... };
```

Then separate:

```text
RequestPrincipalContextResolver
UserAuthorizationContextLoader
GetUserContextQueryRepository
```

The first resolves principal metadata.

The second decides whether database enrichment is required.

The third only queries persistence.

No UUID heuristic is required.

---

# ~~10. Finding F-08 — retry policy leaks persistence implementation inward~~

> **Resolved.** Verified at commit `ba0b57d`. `TransientOperationError` / `isTransientOperationError` live in `ddd-core`; handlers no longer import driver classifiers. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** MEDIUM  
**Category:** Dependency inversion / Reliability  
**Status:** Strongly recommended  
**Files:**

- `delete-user.handler.ts`
- `delete-role.handler.ts`
- `persistence/is-transient-persistence-error.ts`

Both delete handlers import:

```ts
@persistence/is-transient-persistence-error
```

to configure `ResilienceBehavior`.  

The classifier then imports Nest `HttpException` itself to distinguish application-ish errors from retriable persistence failures. 

So the dependency loop conceptually becomes:

```text
application handler
    ↓
persistence error classifier
    ↓
HTTP framework semantics
```

## Correct direction

The application should express:

```text
retry transient failures
```

without understanding PostgreSQL/SQLite/network codes.

Options:

### Smallest change

Move the predicate into an infrastructure-facing resilience provider and bind a neutral function token:

```ts
export const DELETE_USER_RETRY_POLICY = Symbol(...);
```

The composition root supplies the persistence-specific predicate.

### Better long-term model

Infrastructure repositories translate transient infrastructure failures into:

```ts
TransientInfrastructureError
```

or expose a neutral classifier:

```ts
interface TransientFailureClassifier {
  isTransient(error: unknown): boolean;
}
```

Then resilience configuration depends on that contract.

## What not to do

Do not move PostgreSQL error-code knowledge into a generic domain package.

---

# 11. Finding F-09 — `ddd-core` is not actually a clean domain core

**Severity:** MEDIUM  
**Category:** Package architecture / Dependency direction  
**Status:** Architecture improvement, not immediate defect  
**Package:** `@nestjs-pipeline/ddd-core`

The package describes itself as foundational Clean Architecture / DDD infrastructure, but its direct dependencies include:

- `@nestjs/common`
- `@nestjs/cqrs`
- `@mikro-orm/core`
- `@nestjs-pipeline/core`
- correlation infrastructure.



Its `RootEntity` extends Nest's `AggregateRoot`, its command base depends on Nest `EventBus`, and it also contains MikroORM types/decorators.

## Assessment

This is not automatically wrong because the package is currently private and exists primarily for the example.

The problem is the **package's claimed conceptual boundary**, not simply its dependencies.

Today `ddd-core` combines:

```text
pure domain primitives
Nest CQRS integration
persistence abstractions
MikroORM adapter code
cache decorators
```

## Recommended choice

Choose one of two honest models.

### Option A — if this remains sample support

Rename/re-document the package as something closer to:

```text
ddd-nest-support
```

and stop presenting it as framework-neutral DDD core.

This is the lowest-cost option.

### Option B — if it should become genuinely reusable

Split minimally:

```text
ddd/domain
  DomainException
  EntityNotFoundException
  snapshots / identities / pure aggregate primitives

ddd/application
  repository ports

ddd/nest
  CommandBaseHandler
  Nest EventBus adapter

ddd/mikro-orm
  UnixTimestampType
  cache/persistence decorators if still needed
```

I would **not** create all four packages today unless you intend to publish/reuse them independently.

At present, renaming plus a small extraction of genuinely pure primitives is probably the best complexity/value ratio.

---

# 12. Finding F-10 — Nest/CQRS 10 compatibility is claimed more strongly than it is tested

**Severity:** MEDIUM/HIGH  
**Category:** Library compatibility / Private APIs / Testing  
**Status:** Strongly recommended  
**Package:** `@nestjs-pipeline/core`

The package advertises peer compatibility with Nest/CQRS `^10 || ^11`, while development currently uses CQRS 11. 

The private bootstrap integration is intentionally dependent on version-sensitive internals.

For request-scoped handlers, the implementation uses CQRS `AsyncContext` when available and falls back to Nest `ContextIdFactory` when it is not.

The scoped-context test explicitly verifies that CQRS 10-style absence of `AsyncContext` returns `undefined`, and separately verifies current CQRS 11 behavior. 

What it does **not** establish is the important end-to-end property:

> Under actual CQRS 10, does a request-scoped handler and its request-scoped pipeline behavior resolve from the same effective Nest context?

Because the fallback creates/looks up context using handler/request objects differently from CQRS 11's explicit async context, this should be treated as a compatibility risk until tested.

## Recommendation

Create an actual compatibility matrix:

```text
Nest 10 + CQRS 10
Nest 11 + CQRS 11
```

For each, test:

- singleton handler + singleton behavior
- request-scoped handler
- request-scoped behavior
- transient behavior
- nested CommandBus dispatch
- QueryBus dispatch
- EventBus dispatch
- module destroy/restoration
- multiple application contexts in the same process.

Given that private Nest APIs are an explicit architectural trade-off, this matrix should be considered part of the feature, not optional QA.

If you do not want that maintenance burden, narrow the peer range instead.

---

# 13. Finding F-11 — architecture documentation has become a second, stale source of truth

**Severity:** MEDIUM  
**Category:** Documentation / Maintainability  
**Status:** Mandatory cleanup

`docs/architecture-audit.el.md` identifies itself as a snapshot from `master @ ea72fe...` on September 6, 2026. 

`docs/Architecture.md` still presents several findings as unresolved at the newer `ae9f820` head.

For example, it says mutation command handlers load aggregates from read-side `IQueryRepository/@FromCache`. 

Current `UpdateUserHandler` demonstrably uses `IWriteSideAggregateRepository.findById()`. 

Likewise the architecture document claims `CreateUserCommandRepository` omits secondary email invalidation, but current code explicitly invalidates the email cache key. 

This is particularly damaging because `AGENTS.md` tells agents to treat architecture documentation as guidance.

## Fix

Turn the audit into an actual status ledger:

```markdown
## F-02
Status: RESOLVED
Introduced: <sha>
Resolved: ae9f820
Regression test: write-side-hydration.e2e-spec.ts
```

At the top:

```text
Verified against: <commit sha>
```

Do not leave resolved findings in an apparently current “problems” table.

A historical audit is fine; label it explicitly as historical.

## More important improvement

Add automated architecture tests for stable dependency rules.

The repository now has excellent behavioral regression tests—for example write-side hydration and HTTP not-found mapping—but the broad rules themselves are not mechanically enforced.  

A simple source dependency test could reject imports such as:

```text
application/** -> @persistence/*
domain/**      -> @nestjs/common
cqrs/events/** -> @nestjs/bullmq
```

That would have caught multiple current findings immediately.

---

# ~~14. Finding F-12 — OpenTelemetry readiness detection relies on implementation details~~

> **Resolved.** Verified at commit `ba0b57d`. `TraceBehavior` documents that it relies on the OTel API's no-op tracer contract instead of inspecting `ProxyTracerProvider` internals. See [Claude.Review.md](Claude.Review.md#6-status-of-the-earlier-reviews).

**Severity:** LOW/MEDIUM  
**Category:** Observability / Third-party compatibility  
**Status:** Optional improvement  
**Package:** `pipeline-opentelemetry`

`isSdkInitialized()` checks implementation details such as:

```ts
provider.constructor?.name === 'NoopTracerProvider'
delegateTracer.constructor?.name === 'NoopTracer'
provider.getDelegate()
provider.getDelegateTracer()
```



The repository already acknowledges this as a heuristic, and it has real-API regression tests. 

## Assessment

Do **not** build a complex OTel abstraction just to eliminate this.

The API itself deliberately returns no-op tracers, making reliable readiness introspection awkward.

## Better direction

The existing `enabled` override is already the correct escape hatch.

I would:

1. keep automatic detection as convenience,
2. document it as best-effort,
3. prefer explicit application configuration when telemetry readiness matters,
4. expand compatibility tests when upgrading `@opentelemetry/api`.

This is a managed compatibility risk, not an architectural crisis.

---

# 15. Finding F-13 — event and aggregate contracts need stronger architectural tests, not more mocks

**Severity:** MEDIUM  
**Category:** Test architecture  
**Status:** Strongly recommended

The repository has many useful low-level tests and several good E2Es.

The recent regression tests are particularly valuable because they test architecture as externally observable behavior.

However, important contracts are still tested mostly at the implementation level.

## Add these architectural tests

### Dependency direction tests

Fail if:

```text
domain -> Nest HTTP
application -> @persistence/*
application event handler -> @nestjs/bullmq
```

### Aggregate lifecycle contract

Test:

```text
rehydrate v1
mutate
save v2
mutate same instance
save v3
```

### Event publication contract

Test:

```text
saved aggregate publishes events exactly once
response mapping does not affect publication
two changed aggregates publish both sets
persistence failure publishes none
```

### Authentication composition

Fail boot if revocation is required but the validator is not registered.

### Compatibility matrix

Run core integration tests on supported Nest/CQRS major combinations.

## Avoid

Do not add mocks merely to increase coverage.

The highest-value tests here are architectural integration contracts.

---

# 16. Secondary observations

These are lower priority and should not distract from the root problems.

## Query-inside-command in authentication

`UserLoginService.signToken()` resolves capabilities via `QueryBus` during the login command workflow. 

I would **not** treat “a command calls a query” as categorically forbidden.

The real issue is that authentication application logic depends on another CQRS transport mechanism to retrieve data it needs.

When F-01 is fixed, inject:

```ts
UserCapabilityReader
```

and let its adapter decide how capabilities are obtained.

That fixes the dependency for the right reason instead of following dogmatic CQRS rules.

## Correlation package

The correlation package is appropriately transport-flexible and uses Node `AsyncLocalStorage` directly. 

I would leave it alone.

The only subtle semantic point is that calling `getCorrelationId()` with no active context can generate a fresh UUID each time. The README documents this; it is acceptable as long as code that needs stable correlation first enters `runWithCorrelationId()`.

## Feature flags

The OpenFeature choice is a good abstraction boundary. 

Do not add a custom provider-neutral feature flag abstraction on top of OpenFeature.

That would be abstraction over an abstraction.

## Rate limiting

Using a structural `RateLimiterLike` instead of wrapping every backend is the right level of abstraction. 

## Resilience

The package's explicit composition order:

```text
fallback
  → retry
    → circuit breaker
      → bulkhead
        → timeout
          → handler
```

is understandable and documented. 

The actual problem in the users API is the persistence-specific predicate placement, not `ResilienceBehavior`.

## Idempotency

The idempotency implementation is one of the stronger packages.

It has:

- atomic claims,
- unique claim ownership,
- conditional completion/deletion,
- payload fingerprints,
- bounded reclaim retry,
- response snapshots,
- stale-owner protection.



Do not simplify it into “check key, run handler, set response”; that would reintroduce distributed race conditions.

One thing that should remain prominently documented is that a replay returns a serialized snapshot rather than necessarily reconstructing the original class prototype.

---

# 17. Package-by-package conclusion

| Package / area | Recommendation |
|---|---|
| `pipeline` core | **Keep architecture. Harden multi-version compatibility.** |
| `pipeline-correlation` | **Keep. Cohesive.** |
| `pipeline-zod` | **Keep in-place model.** |
| `pipeline-opentelemetry` | **Keep; readiness heuristic is managed risk.** |
| `pipeline-casl` | **Keep; good separation between type-level and entity-level auth.** |
| `pipeline-resilience` | **Keep; move persistence classifiers out of handlers.** |
| `pipeline-cache` | **Keep; current security warnings/key guidance are important.** |
| `pipeline-feature-flags` | **Keep OpenFeature abstraction.** |
| `pipeline-deadletter` | **Keep transport interface; application example should use messaging ports.** |
| `pipeline-rate-limit` | **Keep structural backend interface.** |
| `pipeline-audit` | **Keep sink abstraction.** |
| `pipeline-idempotency` | **Keep; implementation is deliberately robust.** |
| `ddd/core` | **Clarify/split boundary; fix aggregate lifecycle.** |
| `ddd/users-api` | **Primary refactoring target.** |

---

# 18. Proposed target architecture

The repository does **not** need a rewrite.

A stronger version of the current philosophy would look like:

```text
HTTP / Fastify / Nest filters/controllers
                  │
                  ▼
        application / CQRS handlers
                  │
          ┌───────┴────────┐
          ▼                ▼
       domain          application ports
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 persistence adapter   auth adapter      messaging adapter
 MikroORM/Postgres     jose/config        BullMQ
        │                 │                  │
        └─────────────────┴──────────────────┘
                 composition root
```

The pipeline remains outside this diagram as a Nest/CQRS execution concern wrapping handlers.

That is important.

Do **not** force the pipeline library itself to obey the same framework-independence rules as the business application.

---

# 19. Concrete dependency-direction rules

I would make these executable rules:

```text
domain/
  may depend on:
    pure ddd primitives

  must not depend on:
    Nest
    MikroORM
    BullMQ
    Fastify
    environment/config
    JOSE

application/cqrs/
  may depend on:
    domain
    application ports
    pipeline behavior APIs
    Nest CQRS handler interfaces/decorators (intentional pragmatic choice)

  must not depend on:
    concrete persistence
    BullMQ
    Fastify
    process.env
    JOSE
    HTTP exceptions

presentation/
  may depend on:
    Nest HTTP
    Fastify
    application/CQRS

infrastructure/
  may depend on:
    application ports
    concrete external technology

composition root/
  may depend on:
    everything required to bind adapters
```

Notice I intentionally allow Nest CQRS decorators/interfaces in the application handlers.

Removing those would cost much more complexity than it would buy here.

---

# 20. Implementation order

## Phase 0 — synchronize the architecture specification

Before large new features:

1. Mark fixed audit findings resolved.
2. Add `verified commit`.
3. Remove contradictory README claims.
4. Add basic dependency-boundary tests.

This prevents further work from being designed against stale architecture.

## Phase 1 — authentication boundary

Refactor F-01 and F-03 together.

Create:

```text
LoginCodeVerifier
AccessTokenIssuer
CurrentTenant
UserCapabilityReader
TokenSessionValidator
```

Move Fastify/session/logout extraction to presentation.

Make revocation mode explicit/fail-closed.

This produces the largest immediate improvement.

## Phase 2 — messaging / tenant boundary

Create use-case-specific job ports.

Move:

```text
@InjectQueue
Queue<T>
JobsOptions
addCorrelationId
TenantSchemaContext restoration
```

into BullMQ adapters.

Keep mixed-tenant validation.

## Phase 3 — aggregate lifecycle and events

Fix `_persistedVersion` acknowledgment.

Then replace response-shape event publication with one explicit aggregate-change contract.

Do this before adding more domain aggregates, otherwise every new aggregate will inherit the ambiguity.

## Phase 4 — aggregate/persistence separation

Decide whether direct MikroORM mapping of domain aggregates remains an explicit demo compromise.

If not, introduce thin persistence records/mappers and remove invalid public construction paths.

Do **not** create generic repositories/mappers merely to remove 30 lines of duplication.

## Phase 5 — core compatibility matrix

Run the supported Nest/CQRS versions against the private bootstrap integration.

Either:

```text
prove ^10 || ^11
```

or narrow the peer range.

## Phase 6 — lower-priority compatibility cleanup

OpenTelemetry readiness, remaining documentation polish, and other minor maintainability work come last.

---

# 21. Root causes rather than local patches

Several findings should be fixed together.

### Root cause A — application ports are incomplete

Explains:

- `UserLoginService`
- direct `TenantSchemaContext`
- BullMQ queues in events
- QueryBus inside auth orchestration
- persistence retry classifier imports.

Do not fix these as five unrelated imports.

Complete the application-facing ports where external technology genuinely varies.

### Root cause B — aggregate lifecycle is partially implicit

Explains:

- public ORM construction
- mutation version bookkeeping
- stale `_persistedVersion`
- event publishing based on response shape.

The aggregate lifecycle needs a clear sequence:

```text
reconstitute
→ domain mutation
→ persist
→ acknowledge persisted version
→ publish recorded events
```

Today those steps are distributed between decorators, repositories, return types, and `CommandBaseHandler`.

### Root cause C — architectural policy exists primarily in prose

Explains how newly explicit rules and older violating implementations coexist.

A small number of dependency tests will provide more value than another architecture document.

---

# 22. What is genuinely wrong vs imperfect vs intentional

## Genuinely wrong / should change

- `UserLoginService` boundary collapse.
- optional revocation dependency silently disabling security.
- application CQRS event handlers owning BullMQ/persistence tenant mechanics.
- persistence retry classifier imported by application handlers.
- aggregate persisted-version baseline not updated after successful write.
- implicit event publication based on result shape.
- UUID syntax deciding principal type.
- stale architecture documentation being presented as current.

## Imperfect but acceptable temporarily

- direct MikroORM aggregate hydration/public setters, **if explicitly retained as sample simplification**.
- `ddd-core` mixing framework integrations, because it is private rather than a published pure-domain package.
- OpenTelemetry readiness heuristic.

## Intentional and should remain

- Nest/CQRS coupling in pipeline core.
- private Nest APIs as a controlled compatibility risk.
- global pipeline module semantics.
- `forFeature()` being organizational rather than a DI-isolation boundary.
- behavior-per-cross-cutting-concern package architecture.
- CASL entity authorization after materialization.
- Zod's in-place validated request transformation.
- transport-specific adapters inside actual infrastructure packages.
- EventBus not pretending to be a transactional outbox.

---

# 23. Final architectural judgment

The core library is architecturally stronger than the example application around it.

That is the main conclusion.

I would **not redesign `nestjs-pipeline` from scratch**. Its central abstraction—composable Nest CQRS pipeline behaviors—is justified, understandable, and is being applied consistently across the published packages.

The architectural work should instead make the DDD reference implementation live up to the standards the pipeline packages already demonstrate:

```text
small interfaces at actual technology seams
explicit aggregate lifecycle
strong domain invariants
application orchestration without concrete infrastructure
composition-root ownership of technologies
tests that enforce dependency direction
```

Most importantly, resist solving the remaining problems by introducing a generic “clean architecture framework.”

The repository does not need more abstraction.

It needs **fewer hidden contracts and clearer ownership of the abstractions it already has**.