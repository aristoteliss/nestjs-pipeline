# Application execution context ports

Application code must depend on neutral execution-context contracts from this directory, not concrete persistence implementations.

`ITenantContext` exposes the active tenant identity required by authentication, authorization and event orchestration. `TENANT_CONTEXT` is the Nest DI token consumed by application services. `PersistenceModule` binds that token to `TenantSchemaContext`, which remains the infrastructure adapter that owns AsyncLocalStorage and schema normalization.

When adding another application consumer, inject `TENANT_CONTEXT` and type it as `ITenantContext`. Importing `@persistence/tenant-schema.context` from CQRS handlers or application services is an architecture violation.
