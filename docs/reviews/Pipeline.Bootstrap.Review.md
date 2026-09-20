# Pipeline package and bootstrap review

Date: 2026-09-20. Baseline: `2acb8a32` (`review/remaining-findings`).
Delivery branch: `fix/pipeline-bootstrap-review`.

## Scope and method

This review covers `packages/pipeline`: bootstrap/discovery, provider lifetimes,
method wrapping, decorator metadata, options and module registration, contract
validation, request context, logging, serialization, composite keys, UUIDs, public
exports and package boundaries. `ddd/users-api` supplies real Nest composition,
CQRS buses and HTTP usage; it is not treated as the boundary of the reusable API.

The supplied handoff was checked against a clean checkout. Its branch, task file
and temporary probe were absent. Its findings were leads, not accepted evidence.
The current core baseline passed 242 tests before edits. New regression assertions
were run against that implementation before repairs: ten decorator cases, five
Nest lifecycle/declaration cases and six logging cases failed. Additional tests
cover strict diagnostics rollback, concurrent applications, dual command/event
handlers and scope bubbling.

The add-on pass is bounded to cache, idempotency, dead-letter, resilience, audit
and Zod behavior execution and their composition with core. It is not a fresh
exhaustive backend-adapter, database-concurrency or security audit of those packages.
Historical review documents remain separate from this checkout-specific evidence.

## Findings and disposition

| Priority | Classification | Finding | Disposition and evidence |
| --- | --- | --- | --- |
| High | Reproduced defect | Rejected bootstrap retains scoped prototype dispatchers and earlier singleton wrappers. Nest initialization failure does not itself undo these process-shared mutations. | Bootstrap catches failures, unwinds its registered cleanup operations and rethrows the original failure. Unit and real Nest tests cover missing providers, aggregated diagnostics and a second failing app while the first remains live. |
| High | Reproduced defect | A scoped child discovered after its parent sees the inherited `__pipelined` marker and skips its own pipeline. The parent's chain executes instead. | Resolve the underlying method through the owned prototype registry, then install a child-owned dispatcher. Tests cover both discovery orders and distinct parent/child behavior options. |
| Medium | Reproduced defect | Cleanup of an inherited method leaves an own property on the child, changing prototype inheritance. A child override calling `super.execute()` can reenter the child's pipeline through the parent dispatcher. | Save and restore the original property descriptor, deleting temporary own properties when appropriate. Dispatch bindings identify their target so ancestor calls invoke the underlying method. Real Nest tests exercise `super` and verify prototype restoration. |
| High | Code-path inference with regression coverage | One instance-level runner slot cannot represent both `execute` and `handle` when one scoped provider is a command and event handler. The later binding can select the wrong chain/method. | Bind runners per instance **and method**. A real Nest test uses the same `AsyncContext` for command and event dispatch and verifies the two kinds and methods separately. |
| Medium | Reproduced defect | `@UsePipeline(A, A)` executes A twice, although global declarations are deduplicated and options are keyed by one identity. This can double-charge rate limiting or duplicate other effects. | Normalize local declarations by `BehaviorId`: first position, last tuple options, bare repeats retain options. Tests cover execution, option precedence and explicit stable IDs. Same-named distinct constructors remain separate. |
| Medium | Reproduced defect | Undefined or malformed declarations fail late with reflection/provider errors lacking useful origin information. `@SkipPipeline` accepts invalid entries until bootstrap. | Shared internal entry validation produces `TypeError` naming decorator/handler/index or module registration/index. Validate use, skip, root, async and feature registrations. Global entries returned by async configuration are checked during planning. |
| High | Reproduced defect | Logging failures can prevent handler execution or replace a successful result/original business error. Payload getters can fail during serialization too. | Isolate the three logging phases. Logger or serialization failures never rerun `next()` or change its outcome. Tests cover throwing request, success and error log methods, and throwing payload getters. |
| High | Reproduced defect | Error `optionalParams` bypass request/response redaction, exposing sensitive structured fields even with default redaction enabled. | Apply the same sanitizer to error parameters in text and structured output. Tests verify redaction and preservation of the original error. Free-form message/stack text still requires caller discipline. |
| Medium | Contract risk, documented | Scoped behaviors have no instance at bootstrap. Their static validators receive raw merged options, not request-dependent defaults from `resolveEffectiveOptions`; instance-only contracts are unavailable. | Correct the README and API comment. Do not instantiate fake request scopes or guess defaults. Scoped validators must tolerate absent instances and runtime code must validate request-dependent configuration. A static resolver API would require a separate public contract decision. |
| Low | Documentation defect | `PIPELINE_BEHAVIOR_ID` documentation claimed the fallback was the class name. Actual identity is the constructor reference. | Correct the documentation while preserving all existing exports and symbol values. |
| Medium | Architectural proposal, implemented | Bootstrap combines independent planning, validation, execution and Nest patch ownership in one large unit. | Extract internal plan, contract and runner modules. Keep private framework integration and cleanup in one bootstrap service. Tests continue to use public decorators, modules, buses and lifecycle methods. |

## Contract decisions retained

- Global-before guards keep their position outside local short-circuit behaviors.
  A local declaration overrides matching global option fields without relocating it.
- Option merging remains shallow; nested objects are whole values. Global configs
  retain their existing order, scope matching and first-placement/last-tuple rules.
- Skipping and locally declaring the same behavior remains an unconditional error.
  The existing README promises immediate failure. `diagnostics: 'warn' | 'off'`
  controls optional behavior-contract diagnostics, not contradictory declarations,
  malformed configuration or missing providers.
- Default-scoped behaviors with request-scoped dependencies are dynamically resolved
  by the installed Nest container. A real test observes three distinct dependency
  instances across three executions. The handoff's suspected singleton-capture bug
  is not reproduced and that resolution mechanism is preserved.
- Correlation/tenant inheritance, per-request items, handler response capture,
  behavior order, event handling and shared CQRS context IDs remain in place.
- Both singleton and scoped paths remain. The singleton path still captures behavior
  instances once; request-scoped/transient resolution remains in the Nest adapter.
- `forRootAsync` exporting the bootstrap provider while `forRoot` does not is an
  existing asymmetry, not a reproduced failure. Neither export shape was changed.
- No cache layer, published API, behavior, extension point or adapter was removed.
  The new helpers are imported by production modules and are not barrel exports.
- The existing behavior for manually constructed, unowned scoped instances remains:
  use a sole registered application chain, otherwise warn and invoke the original
  method. This fallback is **not an authorization guarantee**; use CQRS/Nest-created
  instances. Changing it to throw would be a separate compatibility decision.

## Simplification and maintenance

The bootstrap service shrinks from 881 lines to approximately 540. This is a
separation of responsibilities, not a claim that total implementation size or
runtime cost is lower: validation and lifecycle repairs add necessary code.

| Internal unit | Responsibility | Extension rule |
| --- | --- | --- |
| `helpers/behavior-id.ts` | Exact/stable identity, same public re-exports | Keep identity independent of class names. |
| `helpers/behavior-entries.ts` | Validate inputs and normalize local declarations | Change declaration semantics here and test through decorators/modules. |
| `services/pipeline-plan.ts` | Read metadata, resolve global scopes, compose chains/options | No provider resolution or method mutation. Preserve guard position. |
| `services/pipeline-contracts.ts` | Contract lookup, effective singleton options, ordering and diagnostics | Keep core add-on-agnostic; behaviors own their contracts. |
| `services/pipeline-runner.ts` | Request context, nesting, correlation bridge, behavior chain and result | No private Nest imports or process-global mutable request state. |
| `services/pipeline.bootstrap.service.ts` | Discovery, DI lifetimes, prototype ownership, installation and rollback | Keep Nest compatibility changes here; test through actual buses. |

No generic middleware framework, replacement CQRS bus, dependency graph engine,
new runtime dependency or test-only production seam is introduced. A further
prototype-registry abstraction is not justified merely to reach a line-count
number; it would move the hard lifecycle rules away from the Nest wrapper hooks
that establish ownership.

## Comment hygiene

The package-spec sweep found 82 decorative comment lines across 21 files in this
checkout. A separate cleanup commit removes those lines and history-narrating
core comments. Test assertions and production behavior remain unchanged by that
cleanup. No ticket identifiers matching the handoff examples were found in the
current package specs; its earlier counts are not reused as current evidence.
Protocol layout documentation, license headers and comments explaining concurrency
or security constraints are retained.

## Research and compatibility reasoning

The supported peer major is Nest/Nest CQRS **11**, with this checkout pinning
common/core `11.2.1` and CQRS `11.0.3`. These exact installed implementations were
checked alongside the official documentation. This run does not establish a
complete matrix over every version allowed by `^11.0.0`.

- [Nest CQRS request scoping](https://docs.nestjs.com/recipes/cqrs#request-scoping)
  documents `AsyncContext` propagation through commands/events. Preserve its
  context ID instead of manufacturing separate DI scopes for each behavior.
- [Nest injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes)
  documents request-scope propagation through dependencies. The real-container
  regression, rather than only explicit decorator scope, verifies that behavior.
- [Nest lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events)
  describes bootstrap and shutdown hooks. Pipeline-owned mutations are rolled
  back where pipeline bootstrap throws, without requiring later shutdown.

The public APIs reviewed do not demonstrate an equivalent handler middleware
covering commands, queries, events and these scoped lifetimes. That is an
architectural inference, not a proof that no alternative exists. Retaining the
accepted explorer/wrapper integration costs less compatibility risk than replacing
it with custom buses. No private framework imports were added by this change.
A future version-matrix job should run packed-consumer and scoped composition
checks before widening peer versions.

## Wider package review

| Area | Assessment and verification boundary |
| --- | --- |
| Module registration | Preserve sync/async provider-graph distinction, optional logger token checks and feature imports. Async execution options cannot register providers after Nest constructs the graph. Malformed entries have targeted tests. |
| Context and propagation | Context remains invocation-local; parent correlation and tenant state are inherited through AsyncLocalStorage. Behavior options are shared configuration references, not immutable snapshots; custom behaviors must treat them as read-only. Existing context/scoped suites and Nest integration pass. |
| Logging | Default payload exclusion and key redaction remain. Error metadata receives the same sanitizer. This is best-effort observation, not a durable audit sink. Async logger rejection behavior is outside the synchronous `LoggerService` contract tested here. |
| Serialization/redaction helpers | Read normalization, ancestor-cycle handling, rich types, data-property construction and strict JSON boundaries. Existing tests cover deterministic keys, invalid JSON, cycles and prototype-related keys. Getter failures remain observable to direct helper callers; LoggingBehavior isolates them. No blanket claim of safety against arbitrary hostile proxies. |
| UUID and key helpers | UUID timestamp/random layout and escaping/absent-segment behavior remain; existing deterministic/range/collision tests pass. UUIDv7 is not monotonic within one millisecond. |
| Public package boundaries | Existing barrel surface retained. Published packages remain standalone peers of core. Release verification packs all 12 packages and executes an isolated consumer. |
| users-api | Reviewed global observability wiring, delete/create/update command patterns and entity-authorized queries. Existing real HTTP/CQRS tests supplement the nine new Nest composition regressions. No application handler or persistence behavior changed. |

## Bounded add-on pass and remaining risks

| Package | Preserved mechanism | Remaining observation |
| --- | --- | --- |
| Cache | Explicit key requirement, authorized partition ownership, scoped kinds and fail-open store policy | A throwing custom logger in cache hit/miss/error paths can still affect execution. This is a code-path inference outside the core LoggingBehavior repair. |
| Idempotency | Owner-conditioned claims, fingerprint checking, retained claims on post-success completion failure | Custom logger calls can replace an intended completion/business error. TTL expiry still requires caller-owned replay safety; no exactly-once guarantee. |
| Dead-letter | Capture only eligible failures; swallow only after successful delivery when configured | Transport-failure logging itself is not isolated against throwing custom loggers. EventBus remains an in-memory bus, not an outbox. |
| Audit | Separate success/failure recording, record redaction, explicit fail-open/fail-closed policy | Secondary logger failures can break intended failure preservation. Audit policy is distinct from best-effort diagnostic logging. |
| Resilience | Policy reuse, whole-handler replay-safety validation and attempt-local cancellation context | Cancellation is cooperative. No rewrite of retry semantics or policy order; composed behavior tests pass. |
| Zod | Async parsing, plain-object output checks, revalidation and parsed-data application | Existing transform/mutation and type tests pass. This bounded pass does not assert exhaustive behavior for arbitrary getters/proxies. |

For the four custom-logger risks above, the next focused change should reproduce
throwing logger methods at each success/error boundary, isolate diagnostic calls
without swallowing sink/store failures, and assert original error identity and
single business execution. Do not add a public logging utility solely to share
these tests. These are explicitly **unfixed code-path inferences**, not findings
silently marked resolved by the core logging patch.

## Verification

- Core baseline: 242 tests passed before edits.
- Core final: 265 tests passed, including 23 added cases.
- Real Nest regressions: nine added cases; users-api total 521 passed.
- `pnpm test`: all 14 workspaces passed, including 310 ddd-core tests.
- `pnpm build`: all 14 workspace builds passed.
- `pnpm lint`: persistence plugins and all workspace typechecks passed.
- `pnpm check`: passed.
- `pnpm test:release`: 12 packed packages, core lifecycle and CASL consumer checks passed.
- `pnpm test:e2e`: 28 files and 139 tests passed.
- `pnpm context:validate`: 58 checks passed, zero failures or warnings.

Sandbox attempts could not spawn Biome/tar subprocesses or listen on local HTTP
ports (`EPERM`). Permission-enabled runs completed those checks. An early test run
also overlapped a clean release rebuild and is not used as final evidence. No
native-module installation or lockfile/dependency change was needed in this run.
