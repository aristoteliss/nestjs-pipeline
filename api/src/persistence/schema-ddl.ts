/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EntityProperty, EntitySchema } from '@mikro-orm/core';
import { PERSISTENCE_ENTITIES } from './persistence-entities.js';

interface ForeignKeyRef {
  readonly table: string;
  readonly column: string;
  readonly onDelete?: string;
}

const FOREIGN_KEY_REFERENCES: Record<string, Record<string, ForeignKeyRef>> = {
  role_capabilities: {
    role_id: { table: 'roles', column: 'id', onDelete: 'cascade' },
    capability_id: { table: 'capabilities', column: 'id', onDelete: 'cascade' },
  },
  user_roles: {
    user_id: { table: 'users', column: 'id', onDelete: 'cascade' },
    role_id: { table: 'roles', column: 'id', onDelete: 'cascade' },
  },
  user_additional_capabilities: {
    user_id: { table: 'users', column: 'id', onDelete: 'cascade' },
    capability_id: { table: 'capabilities', column: 'id', onDelete: 'cascade' },
  },
  user_denied_capabilities: {
    user_id: { table: 'users', column: 'id', onDelete: 'cascade' },
    capability_id: { table: 'capabilities', column: 'id', onDelete: 'cascade' },
  },
  user_permission_rules: {
    user_id: { table: 'users', column: 'id', onDelete: 'cascade' },
    role_id: { table: 'roles', column: 'id', onDelete: 'cascade' },
    capability_id: { table: 'capabilities', column: 'id', onDelete: 'cascade' },
  },
  auth: {
    user_id: { table: 'users', column: 'id', onDelete: 'cascade' },
  },
  auth_consumed_refresh_tokens: {
    auth_id: { table: 'auth', column: 'id', onDelete: 'cascade' },
  },
};

function resolveColumnType(prop: EntityProperty): string {
  const customType = prop.columnTypes?.[0];
  if (customType) return customType;
  const t = prop.type as unknown;
  if (t === 'integer') return 'integer';
  if (t === 'int' || t === 'number') return 'int';
  if (t === 'boolean') return 'boolean';
  if (t === 'text') return 'text';
  if (
    t === 'bigint' ||
    (typeof t === 'object' &&
      t !== null &&
      (t as { constructor?: { name?: string } }).constructor?.name ===
        'BigIntType') ||
    (typeof t === 'function' &&
      (t as { name?: string }).name === 'UnixTimestampType')
  ) {
    return 'bigint';
  }
  if (t === 'string') {
    return `varchar(${prop.length ?? (prop.primary ? 64 : 255)})`;
  }
  return 'varchar(255)';
}

/**
 * Generates DDL statements from registered EntitySchema metadata, creating tables
 * and indexes according to schema properties and constraints.
 *
 * @param entities - Entity schemas to derive DDL from. Defaults to {@link PERSISTENCE_ENTITIES}.
 * @returns An array of SQL statements creating the tables and their indexes.
 *
 * @example
 * ```ts
 * const sqlStatements = generateSchemaSql(PERSISTENCE_ENTITIES);
 * for (const sql of sqlStatements) {
 *   this.addSql(sql);
 * }
 * ```
 */
export function generateSchemaSql(
  entities: readonly EntitySchema[] = PERSISTENCE_ENTITIES,
): string[] {
  const statements: string[] = [];

  for (const entity of entities) {
    const meta = entity.meta;
    const tableName = meta.tableName;
    const columns: string[] = [];
    const pks: string[] = [];
    const tableRefs = FOREIGN_KEY_REFERENCES[tableName] ?? {};

    for (const [propName, prop] of Object.entries(meta.properties)) {
      if (prop.persist === false) continue;
      const rawProp = prop as { fieldName?: string; fieldNames?: string[] };
      const colName = rawProp.fieldName ?? rawProp.fieldNames?.[0] ?? propName;
      if (prop.primary) pks.push(colName);

      const colType = resolveColumnType(prop);
      const ref = tableRefs[colName];
      const refSql = ref
        ? ` references ${ref.table}(${ref.column})${ref.onDelete ? ` on delete ${ref.onDelete}` : ''}`
        : '';
      const nullableSql = prop.nullable ? ' null' : ' not null';
      const defaultSql =
        prop.default !== undefined ? ` default ${prop.default}` : '';

      columns.push(`${colName} ${colType}${nullableSql}${defaultSql}${refSql}`);
    }

    const pkSql = pks.length > 0 ? `primary key (${pks.join(', ')})` : '';
    const body = pkSql
      ? [...columns, pkSql].join(',\n      ')
      : columns.join(',\n      ');
    statements.push(`create table ${tableName} (\n      ${body}\n    );`);

    const columnsOf = (properties: unknown) =>
      ([properties ?? []].flat() as string[])
        .map((p) => {
          const rawP = meta.properties[p] as
            | { fieldName?: string; fieldNames?: string[] }
            | undefined;
          return rawP?.fieldName ?? rawP?.fieldNames?.[0] ?? p;
        })
        .join(', ');
    for (const unique of meta.uniques ?? []) {
      statements.push(
        `create unique index ${unique.name} on ${tableName} (${columnsOf(unique.properties)});`,
      );
    }
    for (const idx of meta.indexes ?? []) {
      statements.push(
        `create index ${idx.name} on ${tableName} (${columnsOf(idx.properties)});`,
      );
    }
  }

  return statements;
}

/**
 * Generates drop statements for registered EntitySchema tables in reverse dependency order.
 *
 * @param entities - Entity schemas to derive drop statements from. Defaults to {@link PERSISTENCE_ENTITIES}.
 * @returns An array of SQL statements dropping the tables safely.
 *
 * @example
 * ```ts
 * const dropStatements = generateDropSchemaSql(PERSISTENCE_ENTITIES);
 * for (const sql of dropStatements) {
 *   this.addSql(sql);
 * }
 * ```
 */
export function generateDropSchemaSql(
  entities: readonly EntitySchema[] = PERSISTENCE_ENTITIES,
): string[] {
  const statements: string[] = [];
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (entity) {
      statements.push(`drop table if exists ${entity.meta.tableName};`);
    }
  }
  return statements;
}
