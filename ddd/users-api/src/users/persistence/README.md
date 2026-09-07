# Users persistence cache invariants

User write repositories must invalidate every stable secondary lookup that can already exist in the read-side cache.

For creation, `CreateUserCommandRepository` writes the canonical `user:id:<id>` entry and invalidates `user:email:<email>`. This matters even before an entity exists: an email lookup may have produced a stale/negative cache entry, and successful creation must make that lookup observable immediately.

Update and delete repositories must continue invalidating both id and email keys when their writes can make those cached representations stale. Mutable composite filters such as department are intentionally not cached by the query repository.

Any new stable secondary lookup added to `GetUserQueryRepository` must be reviewed against create/update/delete invalidation in the same change, with unit coverage for decorator effects and an E2E regression for the externally observable cache behavior.
