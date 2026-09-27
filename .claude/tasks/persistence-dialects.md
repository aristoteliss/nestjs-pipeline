# Task Context

## Task

Remove PostgreSQL- and SQLite-specific knowledge from `@cqrs-ddd/core` and place it in
`@cqrs-ddd/mikro-orm` as dialects, and stop repositories from maintaining constraint-name and
column strings. Part of [persistence-refactor](persistence-refactor.md).

## Goal

- Core decorators translate persistence errors through a dialect contract they do not
  implement; the implementations live in `@cqrs-ddd/mikro-orm`.
- A repository maps a unique violation by the entity's property name, type-checked, with no
  constraint name and no `table.column` string:
  ```ts
  unique: { email: (user) => new UniqueEmailException(user) }
  ```
- Each constraint is declared once, in the ORM mapping (the `EntitySchema`), never in the
  domain class and never in a repository.

## Scope

In scope:
- `decorators/map-persistence-errors.decorator.ts` and `persisted-write.decorator.ts`:
  `matchesUniqueConstraint` hard-codes PostgreSQL `23505` and message text, and SQLite
  `UNIQUE constraint failed` lines; `UniqueConstraintMapping` requires `constraint`
  (PostgreSQL name) and `columns` (SQLite identity) as free strings.
- `is-transient-persistence-error.ts`: PostgreSQL SQLSTATE codes, SQLite busy/locked codes.
  `mapPersistenceError` is opt-in (`otherwise`), never a core default.
- The three api repositories with unique mappings: `create-user`, `create-role`,
  `update-role` command repositories.

Out of scope: `TransientOperationError`, which stays in core as the neutral retry signal;
the applied migration (its index names already match the derived names).

## Current Status

in progress. Already in place (owner, `cbbfd44e`): each unique index is declared by name in
its schema (`USER_EMAIL_UNIQUE`, `ROLE_NAME_UNIQUE` beside the schema); repositories still
pass `constraint` and `columns` strings.

## Plan

- [ ] Core contract: a dialect receives the error and the entity and returns the key of the
      violated unique constraint, or `undefined`. Core knows no database.
- [ ] Core mapping type: `unique` becomes a record keyed by `UniqueKey<TEntity>` (a property
      name of the entity, or a declared composite-constraint name) whose values build the
      domain error. Replaces `UniqueConstraintMapping`.
- [ ] Dialect selection: `setPersistenceDialect(dialect)` registers the default at the
      composition root; `@MapPersistenceErrors({ dialect })` and
      `@PersistedWrite({ dialect })` override it per repository. A method that declares
      `unique` with no dialect available throws a configuration error (fail closed).
- [ ] `@cqrs-ddd/mikro-orm` dialect, built from ORM metadata (`orm.getMetadata()`):
      - accept only `UniqueConstraintViolationException`, which MikroORM already produces
        for PostgreSQL (`23505`) and SQLite (`UNIQUE constraint failed`);
      - PostgreSQL: map the reported constraint name to the property through the entity
        metadata (`unique: true` names come from the naming strategy, `unique: 'name'` and
        `uniques[].name` from the schema);
      - SQLite: map the reported `table.column` list to properties through the metadata.
- [ ] Composite or expression uniques: declared in the schema's `uniques` with a name taken
      from a typed constant exported beside the schema (`as const` object), and referenced
      by that constant in the repository. Single-column uniques need no constant.
- [ ] Move `isTransientPersistenceError` and `mapPersistenceError` to `@cqrs-ddd/mikro-orm`.
- [ ] Migrate the three api repositories; delete every `constraint`/`columns` string.
- [ ] Drift spec in the api: the names derived from metadata equal the unique indexes in the
      migrated database, for both engines.
- [ ] Update the lifecycle Grit plugin and its fixtures if import names change; update the
      READMEs.

## Decisions

- Dialect selection uses both mechanisms (owner, 2026-09-27): a registered default, used
  now, and a per-decorator `dialect` option for repositories on another store (a different
  database, Redis, etc.).
- Constraint names are never maintained as strings in repositories (owner, 2026-09-27). When
  a name must be written, because a composite unique has no property to key on, it is a
  typed constant, declared once.
- The index name is declared in each ORM's own mapping, not on `RootEntity` or any domain
  class: core must stay ORM-agnostic, and an index name is a storage detail. The domain
  contributes only the property name, which every ORM mapping shares.
- The dialect reads MikroORM metadata instead of parsing names from strings, so a custom
  name in the schema needs no change anywhere else.
- Evidence: MikroORM 7.1.13 `SqliteExceptionConverter` and `PostgreSqlExceptionConverter`
  both return `UniqueConstraintViolationException`; the default `indexName()` produces
  `{table}_{columns}_unique`, which matches `users_email_unique`, `roles_name_unique` and
  `auth_refresh_token_hash_unique` in `Migration20260830000000.ts`.

## Modified Files

None yet.

## Tests and Verification

Not run. The evidence above comes from reading the MikroORM 7.1.13 sources in
`node_modules` and the api migration.

## Risks

- A wrong or missing dialect turns unique violations into generic 500s instead of domain
  exceptions; the fail-closed check and the api e2e unique-constraint suites must cover it.
- SQLite reports columns, not constraint names; two uniques over the same column set cannot
  be told apart. Reject that schema shape when the dialect is built.
- Metadata comes from one ORM instance; the api runs one ORM per libSQL tenant with the same
  entities, so any instance's metadata is valid. A store with different entities needs its
  own dialect (the per-decorator option).

## Open Questions

- Does `auth_refresh_token_hash_unique` need a domain mapping? No repository maps it today,
  so a collision surfaces as a raw error.

## Next Steps

Write the core contract and its spec with a fake dialect, then the MikroORM dialect against
real libSQL and PostgreSQL errors.

## Snapshot Impact

Yes: Conventions (error translation) and Critical Modules.

## Last Updated

2026-09-27
