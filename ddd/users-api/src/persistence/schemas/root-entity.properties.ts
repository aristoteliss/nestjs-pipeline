/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { UnixTimestampType } from '@nestjs-pipeline/ddd-core/persistence';

/**
 * Identity and timestamp columns shared by every `RootEntity` schema, mapped
 * through the entity's hydration accessors (`accessor: true`). Returns fresh
 * property definitions for each schema.
 */
export function rootEntityProperties() {
  return {
    id: { type: 'string', primary: true, fieldName: 'id', accessor: true },
    createdAt: {
      type: UnixTimestampType,
      fieldName: 'created_at',
      accessor: true,
    },
    updatedAt: {
      type: UnixTimestampType,
      fieldName: 'updated_at',
      accessor: true,
    },
  } as const;
}

/** Optimistic-concurrency version column for aggregates written with version checks. */
export function versionProperty() {
  return {
    type: 'number',
    fieldName: 'version',
    default: 1,
    accessor: true,
    version: true,
  } as const;
}
