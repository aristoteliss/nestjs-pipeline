# Write-side persistence rules

Mutation commands must hydrate aggregates from authoritative persistence, never from CQRS read-side caches.

`UpdateUserHandler`, `DeleteUserHandler`, `UpdateRoleHandler`, and `DeleteRoleHandler` therefore depend on `IWriteSideAggregateRepository`. Its `findById()` operation is implemented by command repositories with MikroORM `refresh: true`, bypassing both `@FromCache` and the ORM identity map before domain mutation and optimistic-concurrency checks.

Read/query handlers remain free to use `IQueryRepository` and `@FromCache`. Do not reintroduce `GetUserQuery`, `GetRoleQuery`, `QueryBus`, or `IQueryRepository` into mutation handlers merely to load an aggregate.

When adding a command that mutates an existing aggregate:

1. expose authoritative loading through the command/write-side repository port;
2. rehydrate through the aggregate's `fromJSON()` factory;
3. authorize against that aggregate;
4. mutate only through domain methods;
5. save through the same write-side repository;
6. add unit coverage proving the handler calls the write-side loader and E2E coverage that pre-warms a stale read cache before the mutation.
