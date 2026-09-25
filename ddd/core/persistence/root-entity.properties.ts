/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnixTimestampType } from './types/unix-timestamp.type';

/** Column names for the {@link rootEntityProperties} mapping. */
export interface RootEntityColumns {
  /** Default `'id'`. */
  readonly id?: string;
  /** Default `'created_at'`. */
  readonly createdAt?: string;
  /** Default `'updated_at'`. */
  readonly updatedAt?: string;
}

/**
 * Identity and timestamp columns shared by every `RootEntity` schema, mapped
 * through the entity's hydration accessors (`accessor: true`). Timestamps are
 * stored as epoch milliseconds through {@link UnixTimestampType}. Returns fresh
 * property definitions for each schema.
 *
 * @param columns - Column names that differ from the defaults.
 *
 * @example
 * ```ts
 * export const UserSchema = new EntitySchema<User, AggregateRoot>({
 *   class: User as any,
 *   tableName: 'users',
 *   properties: {
 *     ...rootEntityProperties(),
 *     version: versionProperty(),
 *     email: { type: 'string', unique: true },
 *   },
 * });
 * ```
 */
export function rootEntityProperties(columns: RootEntityColumns = {}) {
  return {
    id: {
      type: 'string',
      primary: true,
      fieldName: columns.id ?? 'id',
      accessor: true,
    },
    createdAt: {
      type: UnixTimestampType,
      fieldName: columns.createdAt ?? 'created_at',
      accessor: true,
    },
    updatedAt: {
      type: UnixTimestampType,
      fieldName: columns.updatedAt ?? 'updated_at',
      accessor: true,
    },
  } as const;
}

/**
 * Optimistic-concurrency version column for aggregates written with version
 * checks. New rows start at version 1, matching a new `RootEntity`.
 *
 * @param column - Column name. Default `'version'`.
 */
export function versionProperty(column = 'version') {
  return {
    type: 'number',
    fieldName: column,
    default: 1,
    accessor: true,
    version: true,
  } as const;
}
