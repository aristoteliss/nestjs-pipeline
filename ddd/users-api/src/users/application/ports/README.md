# User application ports

CQRS event handlers express side effects through application-owned ports rather than importing infrastructure transports.

- `IWelcomeEmailDispatcher` schedules the welcome-email intent.
- `IUserBatchDispatcher` schedules tenant-scoped user batch work.

The default adapter is `BullMqUserEventDispatcher` in `src/users/jobs`. Queue names, BullMQ `Queue` types, job options, and payload translation stay in that infrastructure adapter. Event handlers may continue to supply correlation and tenant values as application context, but they do not depend on BullMQ APIs.

This boundary keeps alternative delivery mechanisms possible without changing the domain events or application event handlers.
