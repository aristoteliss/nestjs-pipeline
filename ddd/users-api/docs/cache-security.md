# Authorization-sensitive cache keys

`CacheBehavior` can short-circuit the query handler. A cache hit therefore also skips any entity-level authorization performed inside that handler.

For authorization-sensitive results, a custom cache key must include every scope that can change the returned result. At minimum this means the active tenant and the authenticated principal when output is principal-specific. Missing tenant or principal context must fail closed; never substitute a shared value such as `default` or `anonymous` for a protected shared cache.

```ts
key: (ctx) => {
  if (!ctx.tenantId) throw new Error('Missing tenant context for protected cache');

  const principalId = ctx.sessionUser?.id;
  if (!principalId) throw new Error('Missing principal context for protected cache');

  return `${ctx.tenantId}:${principalId}:roles:all`;
},
```

If authorization can vary while the same principal id remains stable (for example because permissions/roles can change independently), either include a stable authorization-version/fingerprint in the key or invalidate all affected principal-scoped entries when authorization changes.

The generic `@nestjs-pipeline/cache` package must remain authorization-framework agnostic. Security scoping belongs to the application-provided key factory; the package default is only a safe fallback, not a substitute for an application-specific shared-cache policy.
