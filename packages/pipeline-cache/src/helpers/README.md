# Cache key security contract

`defaultCacheKey()` is intentionally request-scoped. It includes the active `correlationId` together with tenant, request name, and canonical request payload, so the package default cannot replay an authorization-sensitive response into another request.

This means the default is safe but not a cross-request cache. Applications that want shared caching must provide `CacheBehaviorOptions.key` explicitly and include every dimension that can change the returned data or authorization outcome, such as tenant, principal identity, role/capability scope, locale, or other policy inputs.

Do not weaken the built-in default to tenant + payload only. A short-circuiting cache can bypass downstream authorization work on a hit, so shared keys are part of the security boundary and must be reviewed as such.
