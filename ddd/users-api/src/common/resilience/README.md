# Application resilience boundary

Application handlers configure retry and circuit-breaker policy against framework-neutral failure semantics. They must not inspect database driver codes, network error codes, ORM classes, or persistence helper functions.

`TransientOperationError` is the neutral signal used by `ResilienceBehavior`. Infrastructure adapters classify their own low-level failures and translate only retryable failures into this error; deterministic failures pass through unchanged.

For example, the delete-user and delete-role repositories classify PostgreSQL/libSQL/network failures inside the persistence layer. Their handlers depend only on `isTransientOperationError`, keeping resilience policy separate from infrastructure error taxonomy.
