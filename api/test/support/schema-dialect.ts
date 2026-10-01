/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setPersistenceDialect } from '@cqrs-ddd/core/persistence';
import { MikroOrmDialect } from '@cqrs-ddd/mikro-orm';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/libsql';
import { afterAll, beforeAll } from 'vitest';
import { createLibsqlOrmOptions } from '../../src/persistence/orm-options.js';

/**
 * Registers the dialect built from the application's real entity schemas for
 * the enclosing suite, as `MikroOrmStore` does at startup. The ORM discovers
 * metadata only; it never connects.
 */
export function useSchemaDialect(): MikroOrmDialect {
  const orm = new MikroORM({
    ...createLibsqlOrmOptions(':memory:'),
    debug: false,
  });
  const dialect = new MikroOrmDialect(orm);
  beforeAll(() => setPersistenceDialect(dialect));
  afterAll(async () => {
    setPersistenceDialect(undefined);
    await orm.close();
  });
  return dialect;
}

/** The exception MikroORM raises for a PostgreSQL unique violation. */
export const postgresUniqueViolation = (constraint: string) =>
  new UniqueConstraintViolationException(
    Object.assign(
      new Error(
        `insert - duplicate key value violates unique constraint "${constraint}"`,
      ),
      { code: '23505', constraint },
    ),
  );

/** The exception MikroORM raises for a SQLite or libSQL unique violation. */
export const sqliteUniqueViolation = (columns: string) =>
  new UniqueConstraintViolationException(
    new Error(`SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: ${columns}`),
  );
