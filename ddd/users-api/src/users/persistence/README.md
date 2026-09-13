# Users persistence cache and authorization invariants

User write repositories must invalidate every stable secondary lookup that can already exist in the read-side cache.

For creation, `CreateUserCommandRepository` writes the canonical `user:id:<id>` entry and invalidates `user:email:<email>`. This matters even before an entity exists: an email lookup may have produced a stale/negative cache entry, and successful creation must make that lookup observable immediately.

Update and delete repositories must continue invalidating both id and email keys when their writes can make those cached representations stale. Mutable composite filters such as department are intentionally not cached by the query repository.

## CASL user-context boundary

`GetUserContextQueryRepository` is a persistence-only, singleton-safe query repository. It loads authoritative user authorization attributes for `GetUserContextQuery` and does not inspect HTTP requests, sessions, CASL subject paths, or AsyncLocalStorage.

`CaslUserContextResolver` is the dedicated request-scoped adapter registered with `CaslModule`. It resolves the authenticated principal from configured request/session context and refreshes persisted user attributes before authorization. Keeping these responsibilities separate prevents a query repository from becoming request-scoped merely because CASL needs request extraction.

Explicit principal classification (`type: 'user' | 'service'`) is enforced: user principals are always verified against persistence regardless of identifier syntax, while service principals rely on their issued capabilities without querying the user database. Missing principal classification fails closed.

Any new stable secondary lookup added to `GetUserQueryRepository` must be reviewed against create/update/delete invalidation in the same change, with unit coverage for decorator effects and an E2E regression for the externally observable cache behavior.
