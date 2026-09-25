# Write-side persistence rules

Mutation commands must hydrate aggregates from authoritative persistence, never from CQRS read-side caches.

`UpdateUserHandler`, `DeleteUserHandler`, `UpdateRoleHandler`, and `DeleteRoleHandler` therefore depend on `IWriteSideAggregateRepository<TEntity>`. Its `findById()` operation is implemented via `MikroOrmWriteSideCommandRepository` with MikroORM `{ refresh: true }` and `mapPersistenceError(...)`, bypassing both `@FromCache` and the ORM identity map before domain mutation and optimistic-concurrency checks. Command handlers receive the fully rehydrated domain aggregate (`Promise<TEntity | null>`) directly, without importing snapshot types or calling `fromJSON()` manually.

Read/query handlers remain free to use `IQueryRepository` and `@FromCache`. Do not reintroduce `GetUserQuery`, `GetRoleQuery`, `QueryBus`, or `IQueryRepository` into mutation handlers merely to load an aggregate.

## Tenant-bound EntityManager metadata

`MikroOrmStore` and `PostgresMikroOrmStore` delegate EntityManager selection to one `TenantEntityManagerResolver`, which associates request/transaction EntityManager instances with the active tenant through `EntityManagerTenantRegistry`, an internal `WeakMap<object, string>`. Each store keeps only its driver-specific ORM bootstrap, fork options (the PostgreSQL store forks with the tenant `schema`) and shutdown.

Do not attach application-owned properties such as `__tenant` to MikroORM EntityManager instances. Third-party runtime objects are not extension points; mutating them creates hidden coupling to undocumented implementation details and can collide with future library changes. Tenant ownership metadata must remain external to MikroORM objects.

A contextual EntityManager (request context or active transaction) is reused only when it is not the ORM's global manager and its driver, configuration and schema match the tenant's ORM and it is not registered to another tenant. Fresh forks are registered immediately and remain otherwise untouched. `test/store-context.spec.ts` runs the same cases against both stores.

When adding a command that mutates an existing aggregate:

1. extend `MikroOrmWriteSideCommandRepository<TSnapshot, TEntity, TResult>` from `@nestjs-pipeline/ddd-core/persistence`, passing `MikroOrmStore` as its `IEntityManagerSource` and `hydrateFn: (s) => TEntity.fromJSON(s)`;
2. inject `IWriteSideAggregateRepository<TEntity>` into the command handler;
3. load the aggregate authoritatively via `await this.repository.findById(id)`;
4. verify presence or throw `EntityNotFoundException`;
5. authorize against that aggregate;
6. mutate only through domain methods;
7. save through the same write-side repository;
8. add unit coverage proving the handler calls the write-side loader and E2E coverage that pre-warms a stale read cache before the mutation.

## Decorated persistence lifecycle

Command repositories across `users-api` apply declarative lifecycle decorators and helpers from `@nestjs-pipeline/ddd-core/persistence`:

### 1. Creation Repositories
`CreateUserCommandRepository`, `CreateRoleCommandRepository`, and `CreateAuthCommandRepository` use `@PersistedWrite`, which applies, outermost first:
- `@Cache`: caches the newly created aggregate by ID and invalidates secondary lookups (e.g. `user:email:<email>`) to eliminate negative/stale cache entries.
- `@AcknowledgePersisted`: captures initial entity version and advances `_persistedVersion` on write success.
- `@MapPersistenceErrors`: translates database unique constraint collisions (e.g. `users_email_unique` → `UniqueEmailException`, `roles_name_unique` → `UniqueRoleNameException`) to domain exceptions without raw `try/catch` blocks.

### 2. Update Repositories
`UpdateRoleCommandRepository`, `UpdateUserCommandRepository` and
`UpdateAuthCommandRepository` use `@PersistedWrite` and `optimisticUpdate` from
`@nestjs-pipeline/ddd-core/persistence`. Shared implementations and their lifecycle contract live in
[`ddd-core` persistence documentation](../../../core/README.md#decorated-versioned-updates).
The application owns aggregate-specific fields, cache keys, and constraint mappings.

### 3. Deletion Repositories
`DeleteUserCommandRepository` and `DeleteRoleCommandRepository` call `optimisticDelete`, a conditional
delete on `{ id: aggregate.id, version: aggregate.getExpectedVersion() }`, under `@Cache` (`deleteKeys`)
and `@MapPersistenceErrors`. If 0 rows are affected, a diagnostic existence read distinguishes a missing
record (`EntityNotFoundException`) from a concurrent modification (`ConcurrencyConflictError`).

### 4. Biome Grit Lint Enforcement
The [Biome Grit plugin](../../../../biome/plugins/persistence-lifecycle.grit)
checks repository `save()` methods calling `optimisticUpdate`.
It requires `Cache → AcknowledgePersisted → MapPersistenceErrors`, awaited helper calls,
and no manual acknowledgment. Use the canonical named imports from
`@nestjs-pipeline/ddd-core/persistence`; renamed imports are rejected by the plugin.

Run `pnpm lint:persistence` for only these Biome diagnostics, or `pnpm check` for
the complete Biome check. Root `lint` and `test:unit` also run the plugin. The rules
are registered in `biome.json`, so normal Biome editor diagnostics use the same
implementation. There is no custom JavaScript lint runner.

The plugin currently requires exactly these three method decorators, in order.
Additional decorators/modifiers require extending its structural pattern and
fixtures. It is a convention check, not semantic symbol resolution or a proof of
SQL correctness/transaction safety.

The real libSQL regression suites are `test/role-update-lifecycle.spec.ts` and
`test/user-update-lifecycle.spec.ts`: repeated saves, stale writers, real
unique-constraint translation, and rejection of outer transactions. Shared unit
and Biome plugin tests live in `ddd/core/persistence`.

### 5. Cache Isolation Parity and Representation Contracts
- **Snapshot Storage Contract**: Cache adapters and repositories inject `ICache<TSnapshot>` (e.g. `ICache<UserSnapshot>`, `ICache<RoleSnapshot>`). Caches store exclusively JSON-serializable snapshots, never live domain aggregates.
- **Isolation Parity (`MemoryCache` vs `MikroOrmCache`)**: `MemoryCache` enforces deep detachment parity with database/network caches (`MikroOrmCache`) by cloning payloads on both `set()` and `get()` through a JSON round-trip. Any mutation on an aggregate returned to a caller or handler cannot bleed back into or corrupt cached entries. Conformance is guarded by `ddd/core/persistence/cache/cache-adapter-conformance.spec.ts`.
- **Query Repository Contract (repository hydration)**: Query repositories (`GetUserQueryRepository`, `GetRoleQueryRepository`) pass `{ hydrateFn }` to the `QueryRepository` constructor, so every `@FromCache` hit is rehydrated, and return strictly `Promise<User | null>` and `Promise<Role | null>`. This eliminates ambiguous union types (`User | UserSnapshot`) from query handlers (`GetUserHandler`, `GetRoleHandler`), allowing handlers to operate cleanly on domain aggregates before CASL authorization and response projection.

### 6. MikroOrmCache Concurrency and Identity Map Isolation
`MikroOrmCache` comes from `@nestjs-pipeline/ddd-core/persistence`; `persistence.module.ts`
registers it with this application's store and `mikroOrmCacheLogger`.
- **Identity Map Isolation**: Every cache entry lookup in `MikroOrmCache` (`readState()`, and the reads inside each compare-and-set write) uses `{ disableIdentityMap: true }`. Because cache rows represent ephemeral infrastructure state rather than unit-of-work domain entities, bypassing the identity map ensures reads always reflect fresh persistence state regardless of request-scoped EntityManager reuse.
- **No Expired-Row Deletion**: A reader never deletes an expired row, so it cannot purge a fresh value a concurrent writer just stored. `readState()` reports the row as `expired` and keeps its revision, and the next write replaces it through the same compare-and-set as any other write.
- **Fail-Closed Deserialization**: Cache reading enforces fail-closed semantics: corrupted JSON payloads throw `SyntaxError` rather than being swallowed into a false cache miss.

### 7. Anti-Resurrection Protocol & Mutation Barriers
- **Stale Resurrection Problem**: When a record is deleted or updated in the database and evicted from cache, an in-flight, slow database read that started *before* the mutation could complete *after* the mutation, repopulating the cache with deleted/stale data ("cache resurrection").
- **Invalidation on Mutation**: On entity deletion (`deleteKeys`) and secondary invalidation (`invalidateKeys`), `@Cache` calls `invalidate(key)` on an `IVersionedCache` (`MemoryCache`, `MikroOrmCache`), which clears the value and advances the key's revision. Only an unversioned adapter receives a `CacheMutationBarrier` sentinel (`{ __cacheBarrier: true, token: uuidv7(), reason: 'deleted' | 'invalidated', createdAt: ... }`) instead, kept for `barrierTtl` (default `DEFAULT_BARRIER_TTL_MS`, 60 seconds).
- **Revision-Fenced Read-Through**: `@FromCache` observes the key's revision before the database read and fills with `tryFill`, which commits only if nothing advanced that revision in between. An invalidation during an in-flight read advances it, so the stale snapshot is rejected rather than written over the barrier; the same fence covers ABA sequences (Delete -> Recreate -> Delete) because every mutation moves the revision. A rejected fill re-reads, returns a strictly newer snapshot if one exists, and retries a bounded number of times before returning the database result uncached. `MikroOrmCache` implements this contract; an adapter that does not is bypassed for both reads and fills.
- **E2E Conformance**: The anti-resurrection guarantees across concurrent deletes, updates, secondary keys, create races, and ABA sequences are guarded by `test/cache-stale-resurrection.e2e-spec.ts`.
