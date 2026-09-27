# Task Context

## Task

Replace `MikroOrmStore` (libSQL) and `PostgresMikroOrmStore` with one tenant-aware store,
built on a framework-neutral implementation in `@cqrs-ddd/mikro-orm`. Part of
[persistence-refactor](persistence-refactor.md).

## Goal

One store class exposes `em` and `transactional()` for the active tenant, with two
strategies: database per tenant (libSQL) and schema per tenant (PostgreSQL). The api keeps
only a thin NestJS provider around it.

## Scope

In scope: `api/src/persistence/mikro-orm.store.ts`, `postgres-mikro-orm.store.ts`,
`tenant-entity-manager.resolver.ts`, `entity-manager-tenant.registry.ts`,
`persistence.module.ts`, the api repositories that type their store, and the specs
`mikro-orm.store.spec.ts`, `tenant-entity-manager.resolver.spec.ts`,
`entity-manager-tenant.registry.spec.ts`, `api/test/store-context.spec.ts`,
`api/test/entity-manager-tenant-registry.e2e-spec.ts`.

Out of scope: the tenant context itself (see [execution-context](execution-context.md)).

## Current Status

not started. Depends on: nothing left (mikro-orm-package and persistence-config are done).

## Plan

- [ ] Move `TenantEntityManagerResolver` to `@cqrs-ddd/mikro-orm` and merge
      `EntityManagerTenantRegistry` into it (a `WeakMap` wrapper used only by the resolver).
- [ ] Add the store to `@cqrs-ddd/mikro-orm`: it takes a tenant supplier and a strategy, and
      implements `IEntityManagerSource` plus the transactional source `MikroOrmCache` needs.
      No NestJS and no driver import; the api passes the ORM options.
- [ ] In the api, one provider wraps the store with `OnModuleInit`/`OnModuleDestroy`, chosen
      by the engine from persistence-config.
- [ ] Fix the store type: repositories and the `CACHE_TOKEN` factory
      (`persistence.module.ts:38`) type the store as `MikroOrmStore`, the libSQL class, even
      when the PostgreSQL store is injected.
- [ ] Move the resolver specs to the package; keep `api/test/store-context.spec.ts` running
      the same cases against both strategies.

## Decisions

- The two stores differ only in ORM bootstrap (one ORM per tenant versus one ORM with a
  schema per fork), fork options and shutdown; `em`, `transactional()` and the resolver use
  are copied. Evidence: `mikro-orm.store.ts:66-101` and `postgres-mikro-orm.store.ts:23-74`.
- The `WeakMap` rule stays: never attach tenant data to MikroORM objects
  (`api/src/persistence/README.md`).

## Modified Files

None yet.

## Tests and Verification

Not run.

## Risks

- Tenant isolation: the resolver decides whether a contextual `EntityManager` can be reused.
  Every existing reuse and rejection case must pass unchanged in both strategies.

## Open Questions

- Store name. Proposed: `TenantStore` in the package; the api token `MIKRO_ORM_CLIENT` stays
  (renaming a token is breaking for the api's own modules only, but out of scope here).

## Next Steps

Move the resolver and registry first; they have no NestJS dependency.

## Snapshot Impact

Yes: Critical Modules (store), Architecture (tenant resolution path).

## Last Updated

2026-09-27
