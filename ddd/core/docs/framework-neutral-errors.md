# Framework-neutral persistence errors

DDD/application persistence examples must not throw NestJS HTTP exceptions. Repositories report persistence/application semantics; the presentation boundary decides how those semantics map to HTTP.

For optimistic concurrency, use a framework-neutral error such as:

```ts
export class OptimisticConcurrencyError extends Error {
  constructor(entity: string, id: string, expectedVersion: number) {
    super(
      `Optimistic lock failure: ${entity} ${id} was modified concurrently (expected version ${expectedVersion}).`,
    );
    this.name = OptimisticConcurrencyError.name;
  }
}
```

A command repository can then fail without importing `ConflictException`:

```ts
const affected = await em.nativeUpdate(
  User,
  { id: user.id, version: expectedVersion },
  user.toJSON(),
);

if (affected === 0) {
  throw new OptimisticConcurrencyError('User', user.id, expectedVersion);
}
```

For an HTTP application, map `OptimisticConcurrencyError` to HTTP 409 in the controller/filter/presentation boundary. Other transports may map the same error differently. This keeps `@nestjs-pipeline/ddd-core` examples aligned with the repository's Clean Architecture boundary while preserving NestJS integration at the edge.
