# User background-job tenant contract

Every BullMQ job is a single tenant-scoped unit of work. A worker must validate the complete payload before entering `TenantSchemaContext`; it must never derive the schema from only the first item and then process unrelated items under that schema.

`BatchUpdateUsersProcessor` uses `resolveBatchTenant()` before `TenantSchemaContext.run()`. Homogeneous batches continue to use their tenant normally. Mixed-tenant batches throw `MixedTenantBatchError` and perform no processing, preventing cross-tenant writes or reads caused by first-item tenant selection.

When adding another batch processor, keep the same ordering: validate tenant consistency, enter the tenant context, then perform work. Unit tests must prove invalid input never calls the context runner, and E2E coverage must exercise the processor as resolved from the real application module.
