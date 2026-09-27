/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPersistenceDialect } from '@cqrs-ddd/core/persistence';
import {
  type EntityMetadata,
  type MetadataStorage,
  type MikroORM,
  type NamingStrategy,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';

interface UniqueConstraint {
  /** The entity property it covers, or its declared name when it spans several. */
  readonly key: string;
  /** The constraint name PostgreSQL reports. */
  readonly name: string;
  /** The `table.column` list SQLite reports; absent for an expression. */
  readonly columns?: string;
}

const SQLITE_COLUMNS = /UNIQUE constraint failed: (.+)$/m;

function constraintsOf(
  meta: EntityMetadata,
  naming: NamingStrategy,
): UniqueConstraint[] {
  const describe = (
    key: string,
    properties: string[],
    name: string | undefined,
  ): UniqueConstraint => {
    const fields = properties.flatMap(
      (property) => meta.properties[property].fieldNames,
    );
    return {
      key,
      name: name ?? naming.indexName(meta.tableName, fields, 'unique'),
      columns: fields.map((field) => `${meta.tableName}.${field}`).join(', '),
    };
  };
  const constraints = Object.values(meta.properties)
    .filter((property) => property.unique)
    .map((property) =>
      describe(
        property.name,
        [property.name],
        typeof property.unique === 'string' ? property.unique : undefined,
      ),
    );
  for (const unique of meta.uniques) {
    const properties = [unique.properties ?? []].flat() as string[];
    const key = properties.length === 1 ? properties[0] : unique.name;
    if (key === undefined) {
      throw new TypeError(
        `${meta.className}: a unique constraint over several properties needs a name to be mapped.`,
      );
    }
    constraints.push(
      properties.length > 0
        ? describe(key, properties, unique.name)
        : { key, name: key },
    );
  }
  return constraints;
}

function assertDistinctColumns(
  meta: EntityMetadata,
  constraints: readonly UniqueConstraint[],
): void {
  const seen = new Map<string, string>();
  for (const { name, columns } of constraints) {
    if (columns === undefined) continue;
    const other = seen.get(columns);
    if (other !== undefined) {
      throw new TypeError(
        `${meta.className}: unique constraints ${other} and ${name} cover the same columns; SQLite cannot tell them apart.`,
      );
    }
    seen.set(columns, name);
  }
}

/**
 * The MikroORM persistence dialect: it reads the violated unique constraint of a
 * `UniqueConstraintViolationException` through the ORM's entity metadata, so a
 * repository maps it by entity property and never names a constraint or column.
 *
 * - PostgreSQL reports the constraint name; it is matched against the names in
 *   the mapping (`unique: 'name'` on a property, `uniques[].name`) or, when none
 *   is declared, the naming strategy's `indexName`.
 * - SQLite and libSQL report the `table.column` list; it is matched against the
 *   columns of each constraint.
 *
 * Any other error, an entity without metadata, or an unknown constraint yields
 * `undefined`, so the decorator rethrows the original error.
 *
 * @throws {TypeError} On construction, when a multi-property unique constraint
 *   has no name, or two constraints of one entity cover the same columns.
 *
 * @example
 * ```ts
 * const orm = await MikroORM.init(options);
 * setPersistenceDialect(new MikroOrmDialect(orm));
 * ```
 */
export class MikroOrmDialect implements IPersistenceDialect {
  private readonly constraints = new Map<
    EntityMetadata,
    readonly UniqueConstraint[]
  >();
  private readonly metadata: MetadataStorage;

  constructor(orm: Pick<MikroORM, 'getMetadata' | 'config'>) {
    const naming = orm.config.getNamingStrategy();
    this.metadata = orm.getMetadata();
    for (const meta of this.metadata.getAll().values()) {
      if (!meta.tableName) continue;
      const constraints = constraintsOf(meta, naming);
      assertDistinctColumns(meta, constraints);
      this.constraints.set(meta, constraints);
    }
  }

  uniqueViolation(error: unknown, entity: object): string | undefined {
    if (!(error instanceof UniqueConstraintViolationException))
      return undefined;
    const meta = this.metadata.find(entity.constructor);
    const constraints = meta ? this.constraints.get(meta) : undefined;
    if (!constraints) return undefined;
    const { constraint } = error as { constraint?: unknown };
    if (typeof constraint === 'string') {
      return constraints.find(({ name }) => name === constraint)?.key;
    }
    const columns = SQLITE_COLUMNS.exec(error.message)?.[1].trim();
    return constraints.find((unique) => unique.columns === columns)?.key;
  }
}
