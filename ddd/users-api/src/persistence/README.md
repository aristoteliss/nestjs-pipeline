# Write-side persistence rules

Mutation commands must hydrate aggregates from authoritative persistence, never from CQRS read-side caches.

`UpdateUserHandler`, `DeleteUserHandler`, `UpdateRoleHandler`, and `DeleteRoleHandler` therefore depend on `IWriteSideAggregateRepository`. Its `findById()` operation is implemented by command repositories with MikroORM `refresh: true`, bypassing both `@FromCache` and the ORM identity map before domain mutation and optimistic-concurrency checks.

Read/query handlers remain free to use `IQueryRepository` and `@FromCache`. Do not reintroduce `GetUserQuery`, `GetRoleQuery`, `QueryBus`, or `IQueryRepository` into mutation handlers merely to load an aggregate.

## Tenant-bound EntityManager metadata

`MikroOrmStore` and `PostgresMikroOrmStore` associate request/transaction EntityManager instances with the active tenant through `EntityManagerTenantRegistry`, an internal `WeakMap<object, string>`.

Do not attach application-owned properties such as `__tenant` to MikroORM EntityManager instances. Third-party runtime objects are not extension points; mutating them creates hidden coupling to undocumented implementation details and can collide with future library changes. Tenant ownership metadata must remain external to MikroORM objects.

When a contextual EntityManager is reused, the store validates driver/config/schema compatibility plus the registry tenant. Fresh forks are registered immediately and remain otherwise untouched.

When adding a command that mutates an existing aggregate:

1. expose authoritative loading through the command/write-side repository port;
2. rehydrate through the aggregate's `fromJSON()` factory;
3. authorize against that aggregate;
4. mutate only through domain methods;
5. save through the same write-side repository;
6. add unit coverage proving the handler calls the write-side loader and E2E coverage that pre-warms a stale read cache before the mutation.

## Decorated persistence lifecycle

Command repositories across `users-api` apply declarative lifecycle decorators and helpers from `@nestjs-pipeline/ddd-core`:

### 1. Creation Repositories
`CreateUserCommandRepository`, `CreateRoleCommandRepository`, and `CreateAuthCommandRepository` use:
- `@Cache`: caches the newly created aggregate by ID and invalidates secondary lookups (e.g. `user:email:<email>`) to eliminate negative/stale cache entries.
- `@AcknowledgePersisted`: captures initial entity version and advances `_persistedVersion` on write success.
- `@MapPersistenceErrors`: translates database unique constraint collisions (e.g. `users_email_unique` → `UniqueEmailException`, `roles_name_unique` → `UniqueRoleNameException`) to domain exceptions without raw `try/catch` blocks.

### 2. Update Repositories
`UpdateRoleCommandRepository` and `UpdateUserCommandRepository` import
`AcknowledgePersisted`, `MapPersistenceErrors`, and `optimisticUpdate` from
`@nestjs-pipeline/ddd-core`. Shared implementations and their lifecycle contract live in
[`ddd-core` persistence documentation](../../../core/README.md#decorated-versioned-updates).
The application owns aggregate-specific fields, cache keys, and constraint mappings.

### 3. Deletion Repositories
`DeleteUserCommandRepository` and `DeleteRoleCommandRepository` execute conditional `nativeDelete`
targeting `{ id: aggregate.id, version: aggregate.getExpectedVersion() }`. If 0 rows are affected,
a diagnostic existence read distinguishes a missing record (`EntityNotFoundException`) from a concurrent
modification conflict (`OptimisticLockError`).

### 4. Biome Grit Lint Enforcement
The [Biome Grit plugin](../../../../biome/plugins/persistence-lifecycle.grit)
checks repository `save()` methods calling `optimisticUpdate`.
It requires `Cache → AcknowledgePersisted → MapPersistenceErrors`, awaited helper calls,
and no manual acknowledgment. Use the canonical named imports from
`@nestjs-pipeline/ddd-core`; renamed imports are rejected by the plugin.

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
- **Isolation Parity (`MemoryCache` vs `MikroOrmCache`)**: `MemoryCache` enforces deep detachment parity with database/network caches (`MikroOrmCache`) by cloning payloads on both `set()` and `get()` through a JSON round-trip. Any mutation on an aggregate returned to a caller or handler cannot bleed back into or corrupt cached entries. Conformance is guarded by `test/persistence/cache/cache-adapter-conformance.spec.ts`.
- **Query Repository Contract (`alwaysHydrate: true`)**: Query repositories (`GetUserQueryRepository`, `GetRoleQueryRepository`) configure `@FromCache({ alwaysHydrate: true, ... })` and return strictly `Promise<User | null>` and `Promise<Role | null>`. This eliminates ambiguous union types (`User | UserSnapshot`) from query handlers (`GetUserHandler`, `GetRoleHandler`), allowing handlers to operate cleanly on domain aggregates before CASL authorization and response projection.

