# Aggregate construction rules

Domain aggregates expose semantic construction paths rather than permissive empty-state construction.

- Use `User.create()`, `Role.create()`, and `Auth.create()` for new aggregates. Creation factories validate invariants and buffer the corresponding creation event.
- Use `fromJSON()` only for persistence/cache rehydration. Rehydration must restore identity, timestamps, and version without publishing creation events.
- Do not introduce optional/no-argument aggregate constructors that manufacture invalid placeholder state. Command handlers should never use `new Aggregate(...)` as a transport or deletion shortcut.

`User` and `Role` constructors are private. `Auth` currently keeps a required-snapshot public constructor only for a legacy ORM/E2E compatibility call; application code must still use `create()`/`fromJSON()`. Once that legacy direct construction is migrated, `Auth` should be made private as well.
