# LLM Agent Implementation Brief — Final Remaining Work

**Branch:** review/remaining-findings  
**Companion review:** docs/reviews/Final.Review.md  
**Purpose:** execute the remaining verified work without reopening resolved findings or making architecture decisions on behalf of the repository owner.

This is an implementation contract, not a new review. The current code plus AGENTS.md and .agents/skills/nestjs-pipeline-architecture/SKILL.md remain authoritative. Historical review files have been consolidated into Final.Review.md and should not be used as competing sources of truth.

At the reviewed head there is no separate instructions.md file. The historical docs/reviews/Intstractions.md was review-process guidance and is consumed by this brief. Do not recreate it. For implementation, obey AGENTS.md, the architecture SKILL, this brief, and the current code.

---

## 1. Mission

Implement only the executable findings in Final.Review.md Table 1:

- **E-01** — complete packed-consumer coverage for every published package.
- **E-02** — reconcile the authoritative agent instructions with the current ConcurrencyConflictError contract.

Do not implement Table 2 decisions until the repository owner explicitly chooses an outcome:

- **D-01** — transactional outbox / durable event delivery.
- **D-02** — whether ddd-core remains private Nest-oriented support or becomes framework-neutral reusable code.
- **D-03** — whether strict aggregate encapsulation justifies persistence records/mappers.

After E-01 and E-02, run the complete verification gate. Do not mark V-01 or the branch fully verified merely because source inspection looks correct.

---

## 2. Mandatory pre-work

Before editing any file:

1. Read AGENTS.md completely.
2. Read .agents/skills/nestjs-pipeline-architecture/SKILL.md completely.
3. Read docs/reviews/Final.Review.md completely.
4. Inspect the closest current implementation before changing it.
5. Treat current repository code as authoritative when old terminology conflicts with it.
6. Do not use a historical review as a reason to revert a later accepted repository decision.

The following current repository decisions are fixed for this work:

- @nestjs-pipeline/core remains intentionally Nest CQRS-specific.
- Existing private Nest CQRS bootstrap integration is an accepted managed risk.
- Domain/application outcomes remain transport-neutral.
- Entity-level authorization remains after the real aggregate/result is loaded.
- Cache/idempotency security keys fail closed when required context is missing.
- CommandBaseHandler owns aggregate event publication.
- Nest in-memory EventBus is not claimed to be an outbox.
- Persistence save decorator order remains @Cache -> @AcknowledgePersisted -> @MapPersistenceErrors.
- Updates/deletes remain version-conditioned.
- Cache mutation barriers and CAS behavior remain intact.
- No production export, option, parameter, mutable global, or branch may be introduced solely for a test.
- ddd-core layered entry points remain /domain, /application, and /persistence; the root barrel is compatibility-only.
- RootDomainEvent does not expose a live entity reference.
- Zod constructor/behavior property-presence semantics remain aligned, including explicit undefined own properties.
- The example log-only event handlers remain an accepted showcase trade-off; do not delete them under this brief.

If an implementation path would violate one of these, stop that path and choose a compliant implementation. Do not reinterpret the task into an architecture rewrite.

---

# 3. E-01 — Complete packed-consumer verification for all published packages

## 3.1 Problem statement

The current release path does three different things:

1. integration/packages/pack-all.mjs packs every non-private package.
2. integration/packages/inspect-tarballs.mjs inspects every produced archive.
3. integration/packages/casl-matrix.mjs installs and executes only packed core and packed CASL.

That means ten published packages are archive-inspected but are never proven to install, type-resolve, and runtime-load outside the monorepo from their actual tgz artifacts.

This is a release-confidence defect, not a package-runtime defect already proven in those packages.

## 3.2 Current exact evidence

Inspect before editing:

- package.json: test:release and verify:all scripts.
- integration/packages/pack-all.mjs.
- integration/packages/inspect-tarballs.mjs.
- integration/packages/casl-matrix.mjs.
- integration/packages/consumer/tsconfig.json.
- integration/packages/consumer/src/smoke.ts.
- integration/packages/consumer/src/two-app-lifecycle.ts.
- integration/packages/consumer/src/casl-smoke.ts.
- packages/*/package.json for current peer contracts.

Current published packages expected by the gate:

- @nestjs-pipeline/core
- @nestjs-pipeline/audit
- @nestjs-pipeline/cache
- @nestjs-pipeline/casl
- @nestjs-pipeline/correlation
- @nestjs-pipeline/deadletter
- @nestjs-pipeline/feature-flags
- @nestjs-pipeline/idempotency
- @nestjs-pipeline/opentelemetry
- @nestjs-pipeline/rate-limit
- @nestjs-pipeline/resilience
- @nestjs-pipeline/zod

Do not hard-code the count as the only discovery mechanism. The repository may gain another non-private package later.

## 3.3 Required design

Keep all release-test code under integration/packages or another private test-only location. Do not add public package APIs to make the fixture convenient.

The gate must derive the publishable package set from packages/*/package.json:

- include directories with package.json and private !== true;
- use each manifest's package name and version as identity;
- map each package to exactly one produced tgz;
- fail on missing or duplicate tarball matches;
- fail if a new published package exists but is not exercised.

The isolated consumer must not be a member of the monorepo workspace. Preserve the existing explicit empty pnpm-workspace.yaml isolation or an equivalent mechanism.

The consumer dependency graph must install the packed tgz for every @nestjs-pipeline package rather than resolving one of them from the workspace.

### Required external peers in the all-package consumer

Provide only the package family's real required external peers, using versions inside currently advertised ranges. At the reviewed state this includes the relevant subset of:

- @nestjs/common ^11
- @nestjs/core ^11
- @nestjs/cqrs ^11
- reflect-metadata
- rxjs ^7
- cache-manager ^7
- keyv ^5
- @casl/ability
- @openfeature/server-sdk
- @opentelemetry/api
- cockatiel
- zod ^4

Do not install optional cache backend peers merely to make import succeed unless the public root entry point genuinely requires them. Optional peers must remain optional. If importing the public package unexpectedly requires an optional backend, treat that as a real package defect rather than masking it by installing every optional dependency.

### CASL matrix

Preserve explicit packed-CASL testing for both advertised ability ranges:

- @casl/ability ^6.0.0
- @casl/ability ^7.0.0

The all-package smoke can use one current supported CASL version. The separate CASL matrix must still prove both major ranges.

### Core lifecycle smoke

Preserve the existing packed-core behavioral verification:

- boot a real Nest application context;
- dispatch through CommandBus;
- prove a request-scoped behavior executes;
- boot two independent application contexts;
- prove their wrappers/behavior state do not leak;
- close one application and prove the second still works.

Do not replace these with import-only checks.

## 3.4 Public-entry-point compile smoke

Add a consumer source file dedicated to package-surface verification, for example:

integration/packages/consumer/src/all-packages-smoke.ts

The exact filename is flexible; its behavior is not.

It must import each package only through its supported public package entry point. Do not reach into dist/, src/, or private subpaths to make the test pass.

TypeScript compilation must therefore prove:

- package exports resolve from the tgz;
- declaration files resolve;
- required transitive @nestjs-pipeline peers resolve to packed artifacts;
- public exported symbols are consumable from outside the workspace.

Use small representative imports rather than copying package internals. Prefer stable public values/classes/types documented in each package README.

Avoid a test that imports only types if the runtime package could still fail to load.

## 3.5 Runtime load smoke

After compiling the isolated consumer, execute the all-package smoke with Node.

The runtime smoke must cause every published package public entry point to be loaded. It does not need to bootstrap every behavior with a live Redis/Postgres/OpenTelemetry provider; those are covered by package/application tests. The purpose here is artifact and dependency correctness.

Acceptable examples:

- instantiate an in-memory or no-backend behavior when construction requires no external service;
- reference a public class/function/token so the package module is evaluated;
- construct simple documented helpers;
- for provider-heavy packages, loading the public entry point plus a minimal no-I/O construction path is sufficient.

The runtime smoke must fail if an export points to a missing file, if a required dependency is absent, if a workspace-only resolution was accidentally relied upon, or if the compiled JS cannot be loaded.

Do not swallow import errors.

## 3.6 Tarball assertions

Retain the existing checks in inspect-tarballs.mjs:

- package/package.json exists;
- LICENSE exists;
- COMMERCIAL_LICENSE.txt exists;
- runtime JS exists under dist;
- declarations exist under dist;
- no spec/test files ship;
- no unresolved workspace: protocol remains;
- no private ddd workspace dependency is published.

Strengthen package-set completeness if needed:

- compare the discovered non-private package names with the tgz manifests;
- require exact set equality, not merely "at least 12 tarballs";
- fail on unexpected duplicate package names or missing expected packages.

Do not depend only on filename conventions when package/package.json inside the archive gives a stronger identity.

## 3.7 Suggested implementation structure

Prefer one clear orchestration path instead of accumulating loosely related scripts.

A compliant structure could be:

- pack-all.mjs — cleanly packs every publishable package.
- inspect-tarballs.mjs — validates archive contents and returns/proves exact package set.
- consumer-matrix.mjs — creates isolated consumers and executes:
  - all-package compile/runtime smoke,
  - packed-core lifecycle smoke,
  - CASL v6 smoke,
  - CASL v7 smoke.
- package.json test:release — rebuild -> copy licenses -> pack -> inspect -> consumer matrix.

Renaming casl-matrix.mjs is optional. If it is renamed, update package.json atomically and do not leave dead scripts.

Avoid creating a general-purpose release framework. This repository needs a small deterministic fixture.

## 3.8 Tests and negative checks

The implementation must itself be regression-resistant.

At minimum, prove locally by temporary mutation or focused test logic that the gate fails when:

- one expected package tgz is missing;
- a package manifest inside a tgz retains a workspace: dependency;
- a public entry point cannot be runtime-loaded;
- a required external peer is omitted;
- one published package is added to packages/ but not exercised by the consumer gate.

Do not retain destructive temporary mutations. They are validation techniques only.

## 3.9 E-01 acceptance criteria

E-01 is complete only when all are true:

- every current non-private package is packed;
- exact package/tarball set is checked;
- every packed @nestjs-pipeline package is installed from its tgz in an isolated consumer;
- consumer TypeScript compiles using the public package entry points;
- Node runtime loads every package public entry point;
- packed-core behavior/lifecycle smoke still passes;
- CASL v6 and v7 packed-consumer smokes both pass;
- optional peers are not accidentally made mandatory;
- no production package source was widened for the tests;
- pnpm test:release passes from a clean build.

## 3.10 E-01 prohibited shortcuts

Do not:

- point TypeScript paths back to packages/*/src;
- add the isolated consumer to the workspace;
- import packages from ../../packages;
- use workspace:* in the consumer;
- install every optional backend merely to hide a root-entry-point bug;
- add public test hooks to any package;
- reduce the check to tar tf/package.json inspection;
- mark a package covered merely because users-api depends on it in the monorepo.

---

# 4. E-02 — Reconcile AGENTS.md and architecture SKILL with ConcurrencyConflictError

## 4.1 Problem statement

The implementation and public documentation now use ConcurrencyConflictError as the framework-neutral application/domain error for version-conditioned write conflicts.

The mandatory agent instruction files still use the old OptimisticLockError name.

Because AGENTS.md and SKILL.md are read before architecture-sensitive changes, this drift is operationally dangerous: a later agent can follow the instructions and reintroduce the stale contract.

## 4.2 Current authoritative implementation

Inspect and preserve:

- ddd/core/persistence/optimistic-update.ts
  - imports ConcurrencyConflictError;
  - throws EntityNotFoundException when the refreshed row is absent;
  - throws ConcurrencyConflictError when the row exists at a different version.
- ddd/users-api/src/users/persistence/delete-user.command-repository.ts
  - same missing-vs-version-conflict distinction.
- ddd/users-api/src/roles/persistence/delete-role.command-repository.ts
  - same distinction.
- ddd/users-api/src/common/filters/domain-exception.filter.ts
  - maps ConcurrencyConflictError to HTTP 409.
- ddd/core/README.md and root README.md
  - already describe ConcurrencyConflictError.

Do not alter these production semantics as part of E-02.

## 4.3 Required edits

Update AGENTS.md current-contract references:

- rule 2 example;
- rule 13 update/delete conflict wording.

Update .agents/skills/nestjs-pipeline-architecture/SKILL.md current-contract references:

- transport-neutral error canonical pattern;
- HTTP mapping example;
- optimistic update zero-row behavior;
- conditional delete zero-row behavior;
- architecture anti-pattern guidance.

Use ConcurrencyConflictError wherever the text describes the current repository's application/domain conflict type.

If OptimisticLockError is ever mentioned for historical or ORM-specific explanation, it must be clearly identified as low-level/historical and must not be presented as the error handlers/applications should throw or catch. The simplest correct result is no stale OptimisticLockError reference in these two instruction files.

## 4.4 Required wording semantics

The guidance must communicate the boundary, not merely rename a token:

- persistence adapters may observe ORM/driver-specific conflict signals;
- repository/persistence helpers translate version conflicts to ConcurrencyConflictError;
- application/domain-facing code remains independent of MikroORM error classes;
- presentation filters map ConcurrencyConflictError to HTTP 409;
- absence remains EntityNotFoundException.

Do not imply that all database errors become ConcurrencyConflictError.

Do not change unique-constraint mapping semantics.

## 4.5 Guard against future drift

Add the smallest appropriate regression guard if one naturally fits existing architecture-instruction checks.

Preferred order:

1. If an existing documentation/search guard already validates canonical terminology, extend it.
2. Otherwise, a simple private repository test/script that checks only authoritative instruction text is acceptable.
3. Do not add production code.
4. Do not add a complex Markdown parser for one word.

A guard is useful but not mandatory if current repository conventions do not test instruction prose. The required acceptance condition is the instruction consistency itself.

## 4.6 E-02 acceptance criteria

- AGENTS.md contains no stale current-contract OptimisticLockError instruction.
- SKILL.md contains no stale current-contract OptimisticLockError instruction.
- Both documents name ConcurrencyConflictError consistently with current code.
- EntityNotFoundException remains the missing-row outcome.
- No production behavior changes.
- ddd/core and users-api typechecks/tests remain green.
- pnpm check and pnpm lint:persistence remain green.

---

# 5. D-01 — Durable domain-event delivery / transactional outbox

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 5.1 Existing contract to preserve until decision

CommandBaseHandler currently:

- executes the command;
- receives an aggregate-bearing result;
- publishes buffered events through Nest EventBus;
- clears the aggregate's uncommitted events;
- explicitly documents that database persistence and in-memory event publication are not atomic.

AGENTS.md explicitly says not to assume EventBus is an outbox.

This is a known limitation, not an accidentally missing retry.

## 5.2 Owner decision questions

Before any code, obtain explicit answers to:

1. Is durable event delivery actually required?
2. Which event classes/workflows require it: all domain events or only selected integration events?
3. Is at-least-once delivery acceptable?
4. Must aggregate write and outbox insertion be atomic in the same database transaction?
5. Which database owns the outbox in multi-tenant operation?
6. What is the target relay/transport: BullMQ, RabbitMQ, Kafka, database polling only, another broker?
7. Is per-aggregate ordering required?
8. Is global ordering required? Normally avoid promising it unless explicitly required.
9. What stable event identifier is used for deduplication?
10. Are consumers required to be idempotent?
11. What are retry/backoff/dead-letter semantics?
12. What is retention/cleanup policy?
13. What operational visibility is required?
14. Is the sample application expected to demonstrate the infrastructure or only the library contract?

Do not infer answers.

## 5.3 If the owner chooses NO

No production change is required.

Close D-01 by documenting the decision in Final.Review.md or a dedicated ADR if the repository uses one, preserving:

- in-memory EventBus semantics;
- explicit crash-window limitation;
- no durability claim.

Do not add an outbox port "for future use."

## 5.4 If the owner chooses YES

Do not start with CommandBaseHandler changes. First design transaction ownership.

Required invariant:

> The durable aggregate write and durable outbox record must commit atomically, or the design does not close the original failure window.

A compliant implementation will likely require persistence-layer transaction orchestration rather than a post-save application call.

### Required design artifacts before implementation

Define:

- durable OutboxRecord shape;
- event ID and aggregate identity/version fields;
- tenant partition/routing fields;
- serialized payload contract;
- created/available/attempted timestamps;
- delivery state and attempt count;
- relay ownership/lease mechanism if multiple workers run;
- deduplication contract;
- transaction boundary;
- mapper from in-memory domain event to durable record;
- relay port and infrastructure adapter;
- failure/retry/dead-letter behavior.

### Architecture boundaries

- Domain events remain framework-neutral data.
- CQRS handlers do not inject a concrete broker.
- Application code does not import BullMQ/RabbitMQ clients.
- Persistence code may own DB-specific transaction mechanics.
- Broker relay lives in infrastructure.
- Do not make Nest EventBus itself pretend to be durable.
- Do not duplicate event publication through both EventBus and outbox unless the owner explicitly defines the two-channel semantics.

### Tests required if YES

- aggregate write + outbox row commit together;
- failure before transaction commit persists neither;
- process-level relay can retry a durable pending record;
- duplicate relay attempts are safe;
- tenant routing is preserved;
- ordering guarantee matches the approved contract;
- cleanup does not delete pending records;
- application handler contains no concrete broker dependency.

Docker-backed database tests are required for the atomicity claim.

---

# 6. D-02 — ddd-core private Nest-oriented support vs framework-neutral reusable library

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 6.1 Current contract

ddd/core/package.json says:

- package is private;
- description explicitly calls it Nest-oriented DDD support for sample applications;
- @nestjs/common and @nestjs/cqrs are runtime dependencies;
- MikroORM is isolated to the persistence entry point as an optional peer;
- domain/application/persistence subpath exports already make internal layering explicit.

RootEntity extends Nest AggregateRoot.

This is coherent with the current repository purpose.

## 6.2 Owner decision questions

1. Is there a real planned consumer that needs domain/application primitives without Nest?
2. Is ddd-core intended to become published?
3. Which primitives are desired outside Nest:
   - DomainException?
   - RootEntity?
   - DomainEvent/RootDomainEvent?
   - repository interfaces?
   - CommandBaseHandler?
   - cache interfaces?
4. Should @nestjs-pipeline/core remain Nest-specific? The current answer should normally remain yes unless explicitly changed.
5. Is introducing another package acceptable?
6. Is duplicated migration/import churn justified by a real reuse requirement?
7. Should persistence helpers remain private sample code or become separately publishable?

Do not convert the repository into a framework-independent CQRS framework as an abstract cleanliness exercise.

## 6.3 If owner chooses KEEP PRIVATE / NEST-ORIENTED

No architecture implementation is needed.

Preserve:

- three ddd-core entry points;
- direct Nest AggregateRoot use;
- optional MikroORM peer for persistence;
- current guardrails.

Optionally record the explicit decision so future reviews do not repeatedly reopen it.

## 6.4 If owner chooses EXTRACT FRAMEWORK-NEUTRAL PRIMITIVES

First produce an approved package-boundary plan. Do not immediately move files.

A valid plan must state:

- exact new package name(s);
- whether each package is public/private;
- dependency direction;
- which existing imports migrate;
- compatibility strategy;
- what happens to ddd-core root compatibility exports;
- where Nest-specific adapters live.

### Key design constraint

If RootEntity is moved into a framework-neutral package, it cannot extend @nestjs/cqrs AggregateRoot.

Therefore event buffering must be represented by a small own abstraction whose API is driven by current repository needs, not by recreating all CQRS concepts.

Possible required surface, only after approval:

- apply/record event;
- getUncommittedEvents;
- clear/uncommit events.

Then a Nest-oriented application/handler adapter can publish those events.

Do not hide @nestjs/cqrs behind a broad "mediator" interface if the only consumer remains Nest. Abstraction must be smaller than the dependency it replaces.

### Migration tests if extraction is approved

- domain package imports load without Nest installed;
- no MikroORM import loads through the domain/application entry;
- existing users-api handlers still compile through approved entry points;
- event buffering/publication semantics remain equivalent;
- packed artifact tests cover any newly published package;
- package-boundary Grit/tests are updated.

---

# 7. D-03 — Strict aggregate encapsulation vs direct MikroORM accessor mapping

**Status: DECISION REQUIRED. DO NOT IMPLEMENT WITHOUT OWNER APPROVAL.**

## 7.1 Current contract

RootEntity exposes setters for id, createdAt, and updatedAt as persistence hydration escape hatches.

MikroORM EntitySchema maps aggregate accessor properties directly with accessor: true.

Application/domain rules prohibit callers from using those setters for business mutations.

The arrangement is intentionally pragmatic: it keeps the sample small but means the domain class surface is not maximally closed.

## 7.2 Owner decision questions

1. Is strict compile-time encapsulation of hydration state a required teaching/product goal?
2. Is additional persistence mapper/record boilerplate acceptable in the sample?
3. Should all mapped aggregates migrate together?
4. Should persistence records mirror domain snapshots 1:1 or use database-shaped fields?
5. Who owns date/version conversion?
6. Should repositories return/hydrate aggregates exclusively through fromJSON?
7. Is MikroORM identity-map behavior still needed for persistence records?
8. Is the direct-schema sample simplicity more valuable than setter elimination?

Do not remove setters before answering these.

## 7.3 If owner chooses RETAIN DIRECT MAPPING

No production change.

Preserve:

- setters documented as hydration-only;
- application guardrails against direct setter mutation;
- accessor: true schema mapping.

Optionally add a small static guard only if current enforcement is insufficient. Do not create records/mappers anyway.

## 7.4 If owner chooses STRICT ENCAPSULATION

Design persistence records before touching RootEntity.

A compliant migration should separate:

- domain aggregate state and invariants;
- persistence record shape;
- mapper/hydrator;
- MikroORM EntitySchema target.

### Required migration sequence

1. Define persistence record types/classes in persistence/infrastructure.
2. Map MikroORM schemas to records rather than domain aggregates.
3. Add record -> snapshot/domain rehydration mapping.
4. Add domain snapshot -> persistence record mapping.
5. Migrate query repositories.
6. Migrate write-side repositories.
7. Verify optimistic update/delete version predicates operate on records correctly.
8. Verify cache snapshot contracts remain detached and serializable.
9. Only after all persistence paths no longer need the setters, remove/restrict domain hydration setters.
10. Update positive examples and boundary tests.

### Required tests

- rehydration preserves id/timestamps/version;
- new aggregate creation semantics unchanged;
- update/delete optimistic concurrency unchanged;
- repository cache snapshots unchanged;
- no application layer imports persistence records;
- domain package no longer exposes persistence-only mutation escape hatches;
- E2E user/role/auth CRUD remains green.

Do not use synthetic domain instances merely to satisfy repository APIs.

---

# 8. Full-scan regression checklist for the implementation agent

While implementing E-01/E-02, do not intentionally reopen unrelated areas. Before completion, run focused searches/inspection for:

- Nest HTTP exceptions under domain/application/CQRS business paths;
- ORM imports under domain/application/CQRS handlers;
- BullMQ/JWT concrete dependencies in application services instead of ports;
- process.env hidden in domain/application/package core logic;
- bare @nestjs-pipeline/ddd-core imports in users-api production code;
- persistence imports from domain/application/CQRS paths;
- event.entity reads or a public RootDomainEvent.entity field;
- production comments/API mentioning "for testability", "test-only seam", or equivalent retained test surface;
- command repositories with manual persistence try/catch where declarative mapping applies;
- save decorator order drift;
- missing version predicates on update/delete;
- direct aggregate setters used by application code;
- pipeline cache/idempotency keys that omit security partitions for protected results;
- stale OptimisticLockError current-contract instructions.

A search hit is not automatically a defect. Evaluate layer and intent before changing anything. For example, presentation pipes/filters may legitimately use HTTP exceptions and infrastructure adapters may legitimately read environment variables.

---

# 9. Verification sequence

Run narrow checks after each task, then the complete gate once.

## After E-02

At minimum:

- verify no stale OptimisticLockError current-contract text remains in AGENTS.md or SKILL.md;
- pnpm check;
- pnpm lint:persistence.

Because E-02 is documentation-only, do not manufacture a production test change merely for churn.

## During E-01

Iterate with:

- pnpm test:build or pnpm rebuild as required by the release fixture;
- pnpm test:release.

When changing release scripts, execute them from a clean state at least once.

## Final mandatory gate

Run:

pnpm verify:all

This must exercise:

- lint;
- persistence/architecture plugins;
- all workspace unit tests;
- all builds;
- clean packed release gate;
- isolated packed consumers;
- CASL peer matrix;
- Docker/Testcontainers E2E.

Do not replace pnpm verify:all with a set of narrower commands and then claim equivalent final verification unless every subcommand is demonstrably identical.

## Docker/Testcontainers requirement

The E2E phase is not optional for final closure.

Confirm that PostgreSQL and Redis Testcontainers tests actually execute. A skipped suite because Docker is unavailable does not close V-01.

Capture evidence tied to the exact final commit:

- CI status/workflow, or
- retained local command output in an appropriate review/evidence location if this branch intentionally has no CI.

Do not put transient machine paths, secrets, JWTs, connection strings, or credentials into the evidence.

---

# 10. Commit structure

Keep changes reviewable.

Recommended sequence:

1. fix(docs): align agent concurrency error contract
   - AGENTS.md
   - SKILL.md
   - optional minimal documentation guard only if justified

2. test(release): install and smoke every packed package
   - integration/packages/*
   - package.json if orchestration script changes

3. docs(reviews): close executable findings and record final verification evidence
   - Final.Review.md
   - this brief only if implementation facts/paths changed materially

Do not mix D-01/D-02/D-03 architecture implementation into these commits.

---

# 11. Definition of done for this branch

The branch is ready for owner review when:

- E-01 is fully implemented;
- E-02 is fully implemented;
- D-01/D-02/D-03 are untouched unless explicit owner decisions were supplied after this brief;
- pnpm verify:all passes on the exact final commit;
- Docker-backed E2E is not skipped;
- release consumer testing covers every published package tgz;
- CASL 6 and 7 matrix remains green;
- no stale OptimisticLockError current-contract instruction remains;
- no new production test seam exists;
- Final.Review.md is updated so Table 1 rows are closed with concrete commit/test evidence;
- Table 2 records owner decisions if any were made, otherwise remains decision-gated;
- Table 3 V-01 is closed only with independent execution evidence.

---

# 12. Stop conditions

Stop implementation and request an owner decision rather than guessing if any change would require:

- introducing a transactional outbox;
- changing event-delivery guarantees;
- publishing/splitting ddd-core;
- replacing Nest AggregateRoot in domain entities;
- removing hydration setters by introducing persistence records;
- changing supported Nest major versions;
- changing cache/idempotency security partition semantics;
- changing public package compatibility ranges beyond what is needed to make declared current ranges truthful.

For E-01 and E-02, no such owner decision should be necessary.

---

# 13. Final agent handoff format

When the implementation agent finishes, report:

- exact commits created;
- files changed for E-01;
- files changed for E-02;
- how every packed package is proven to install/typecheck/runtime-load;
- CASL 6 and 7 results;
- pnpm verify:all result;
- Docker/Testcontainers E2E file/test counts;
- any skipped test — if any are skipped, state that final verification is not closed;
- whether D-01/D-02/D-03 were left untouched;
- any new finding discovered during implementation, with exact file/line evidence.

Do not report "all good" without the command/evidence details above.
