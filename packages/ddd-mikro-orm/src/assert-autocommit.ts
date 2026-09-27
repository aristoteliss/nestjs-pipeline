/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { EntityManager } from '@mikro-orm/core';

/**
 * Rejects an externally active transaction before a write that reports durable
 * success.
 *
 * The lifecycle decorators treat a resolved `save()` as durable: `@AcknowledgePersisted`
 * advances the aggregate's persisted version baseline and `@Cache` synchronises or
 * invalidates cache entries. Inside a caller's transaction neither is true yet — the
 * statement is buffered until a commit this code does not observe, so a later rollback
 * would leave an acknowledged aggregate and a cache reflecting a write that never
 * landed. Participating in an outer transaction needs commit callbacks or unit-of-work
 * semantics; it must not be emulated by acknowledging early.
 *
 * Call it **before** issuing the statement, so a rejected operation mutates nothing.
 *
 * @param em The entity manager the operation will execute on.
 * @param operation Name used in the error message, e.g. `'optimisticDelete'`.
 * @throws {Error} When `em` is inside an active transaction.
 */
export function assertAutocommit(em: EntityManager, operation: string): void {
  if (typeof em.isInTransaction === 'function' && em.isInTransaction()) {
    throw new Error(
      `${operation} requires autocommit; external transactions need commit hooks.`,
    );
  }
}
