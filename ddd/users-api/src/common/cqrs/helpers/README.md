# CQRS key helpers

Repository cache keys use one deterministic JSON serializer: ddd-core's `stableStringify`, whose output is byte-identical to `@nestjs-pipeline/core`'s. The tenant comes from ddd-core's tenant scope (`runWithTenant`), which `TenantScopeBehavior` (`src/infrastructure/behaviors/`) sets from the pipeline tenant for every command, query and event. `filterCacheKey` owns only repository-specific concerns such as tenant namespacing, top-level filter segments and escaping the `:` / `\\` delimiters used by its key format. Do not add another recursive object sorter or JSON canonicalizer in this application.

Security-sensitive short-circuit and throttling keys have a stricter tenant rule. Idempotency and rate-limit key factories must call `requireTenantId()` and fail closed when `IPipelineContext.tenantId` is absent. They must never use a shared fallback such as `ctx.tenantId ?? 'default'`, because a missing context would collapse unrelated tenants into one namespace.

Current protected factories include user-create idempotency/rate limiting, role-create idempotency, and auth-login rate limiting. Unit coverage verifies all of them reject missing tenant context and partition identical requests by tenant. `test/tenant-scoped-create-keys.e2e-spec.ts` verifies the same principal/request identity can operate independently in two real tenant schemas.
