# CQRS cache-key helpers

Repository cache keys use one deterministic JSON serializer: `stableStringify` from `@nestjs-pipeline/core`. `filterCacheKey` owns only repository-specific concerns such as tenant namespacing, top-level filter segments and escaping the `:` / `\\` delimiters used by its key format.

Do not add another recursive object sorter or JSON canonicalizer in this application. Nested/composite values must delegate to `stableStringify`, which is also used by pipeline cache and idempotency code. This keeps deterministic hashing/key behavior consistent across packages and centralizes strict JSON-domain validation.

Unit coverage locks the exact nested key format and strict unsupported-value behavior. `test/cache-key-canonicalization.e2e-spec.ts` boots the real application/cache adapter and proves differently ordered but structurally equal nested filters address the same cache entry.
