/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityManager } from '@mikro-orm/core';

/**
 * Supplies the MikroORM `EntityManager` for the current operation.
 *
 * {@link AggregateRepository} and {@link MikroOrmCache} read `em` on every
 * operation and never keep it, so a source may return a different manager each
 * time: the current tenant's in a multi-tenant application, or the current
 * request's. A getter over the application's own store satisfies it, and so
 * does a plain `{ em }` object in a single-database setup or a test.
 *
 * @example
 * ```ts
 * const source: IEntityManagerSource = { em: orm.em.fork() };
 * ```
 */
export interface IEntityManagerSource {
  readonly em: EntityManager;
}
