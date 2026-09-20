# Users persistence cache and authorization invariants

User write repositories must invalidate every stable secondary lookup that can already exist in the read-side cache.

For creation, `CreateUserCommandRepository` writes the canonical `user:id:<id>` entry and invalidates `user:email:<email>`. This matters even before an entity exists: an email lookup may have produced a stale/negative cache entry, and successful creation must make that lookup observable immediately.

Update and delete repositories must continue invalidating both id and email keys when their writes can make those cached representations stale. Mutable composite filters such as department are intentionally not cached by the query repository.

## CASL principal boundary

Principal and rule loading for authorization lives in `src/auths/persistence/casl-permission.source.ts`, a request-scoped adapter bound through `AuthorizationModule`. The query repositories here stay singleton and never inspect sessions or AsyncLocalStorage.

Explicit principal classification (`principalType: 'user' | 'service'`) is enforced: user principals are always re-read from persistence regardless of identifier syntax, while service principals use the `grants` their authenticator attached without querying the user database. Missing principal classification fails closed.

Any new stable secondary lookup added to `GetUserQueryRepository` must be reviewed against create/update/delete invalidation in the same change, with unit coverage for decorator effects and an E2E regression for the externally observable cache behavior.
