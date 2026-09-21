# Cache key security contract

Every active `CacheBehavior` declaration requires an explicit cache key. There is no implicit or request-scoped default cache key. Omitting `key` in an active cache behavior declaration fails fast during application bootstrap.

Correlation IDs are distributed tracing metadata, not principal, authorization, or cache partition boundaries. Never use correlation IDs as cache key segments or security boundaries.

Applications must define cache keys explicitly and include every security and context dimension that can affect the returned data or authorization outcome:
- Active tenant (`context.tenantId`)
- Principal identity (e.g. user ID / subject)
- Effective permission or role scope when responses vary by authority
- Request parameters and operation identity

Use `createPartitionedCacheKeyFactory` to construct secure, partitioned cache keys. It fails closed with `MissingCachePartitionError` if required security context (such as tenant or principal) is absent, preventing shared fallback namespaces.
