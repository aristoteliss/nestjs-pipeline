# Write-side persistence rules

Mutation commands must hydrate aggregates from authoritative persistence, never from CQRS read-side caches.

`UpdateUserHandler`, `DeleteUserHandler`, `UpdateRoleHandler`, and `DeleteRoleHandler` therefore depend on `IWriteSideAggregateRepository`. Its `findById()` operation is implemented by command repositories with MikroORM `refresh: true`, bypassing both `@FromCache` and the ORM identity map before domain mutation and optimistic-concurrency checks.

Read/query handlers remain free to use `IQueryRepository` and `@FromCache`. Do not reintroduce `GetUserQuery`, `GetRoleQuery`, `QueryBus`, or `IQueryRepository` into mutation handlers merely to load an aggregate.

## Tenant-bound EntityManager metadata

`MikroOrmStore` and `PostgresMikroOrmStore` associate request/transaction EntityManager instances with the active tenant through `EntityManagerTenantRegistry`, an internal `WeakMap<object, string>`.

Do not attach application-owned properties such as `__tenant` to MikroORM EntityManager instances. Third-party runtime objects are not extension points; mutating them creates hidden coupling to undocumented implementation details and can collide with future library changes. Tenant ownership metadata must remain external to MikroORM objects.

When a contextual EntityManager is reused, the store validates driver/config/schema compatibility plus the registry tenant. Fresh forks are registered immediately and remain otherwise untouched.

When adding a command that mutates an existing aggregate:

1. expose authoritative loading through the command/write-side repository port;
2. rehydrate through the aggregate's `fromJSON()` factory;
3. authorize against that aggregate;
4. mutate only through domain methods;
5. save through the same write-side repository;
6. add unit coverage proving the handler calls the write-side loader and E2E coverage that pre-warms a stale read cache before the mutation.
