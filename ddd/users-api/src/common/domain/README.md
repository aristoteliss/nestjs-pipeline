# Aggregate construction boundary

`User`, `Role`, and `Auth` expose semantic factories instead of public constructors. New aggregates are created through `create(...)`, which records the creation event, while persisted snapshots are restored through `fromJSON(...)` without replaying creation events.

The constructors remain compatible with MikroORM hydration but are private at the TypeScript domain boundary. MikroORM v7 requires the corresponding `EntitySchema.class` entries to use an explicit persistence-only cast for classes with private constructors; that escape hatch must not be copied into application or domain code.

This keeps invalid or event-less aggregate construction out of business code while preserving the repository's existing accessor-based ORM mappings.
