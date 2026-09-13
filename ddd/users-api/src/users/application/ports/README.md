# User application ports

CQRS event handlers express side effects through application-owned ports rather than importing infrastructure transports.

- `IWelcomeEmailDispatcher` schedules the welcome-email intent.
- `IUserBatchDispatcher` schedules tenant-scoped user batch work.

The default adapter is `BullMqUserEventDispatcher` in `src/users/jobs`. Queue names, BullMQ `Queue` types, job options, payload translation, and correlation propagation stay in that infrastructure adapter. Event handlers provide business data plus tenant context only; they do not carry BullMQ or correlation-envelope details.

Event logging is supplied declaratively by `LoggingBehavior`, so application event handlers do not construct `Logger` instances or manually format correlation-aware log lines.

This boundary keeps alternative delivery mechanisms possible without changing the domain events or application event handlers.
