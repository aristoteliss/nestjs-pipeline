/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import {
  rootEntityProperties,
  versionProperty,
} from './root-entity.properties';
import { UnixTimestampType } from './types/unix-timestamp.type';

describe('rootEntityProperties', () => {
  it('maps id and epoch-millisecond timestamps through accessors under the default column names', () => {
    expect(rootEntityProperties()).toEqual({
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
    });
  });

  it('uses the given column names and keeps the defaults for the others', () => {
    const properties = rootEntityProperties({
      createdAt: 'inserted_at',
      updatedAt: 'modified_at',
    });

    expect(properties.id.fieldName).toBe('id');
    expect(properties.createdAt.fieldName).toBe('inserted_at');
    expect(properties.updatedAt.fieldName).toBe('modified_at');
    expect(rootEntityProperties({ id: 'user_id' }).id.fieldName).toBe(
      'user_id',
    );
  });

  it('returns fresh definitions, so one schema cannot alter another', () => {
    const first = rootEntityProperties();
    const second = rootEntityProperties();

    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).not.toBe(second.createdAt);
  });

  it('is accepted by an EntitySchema together with versionProperty', () => {
    class Row {
      id!: string;
      createdAt!: Date;
      updatedAt!: Date;
      version!: number;
    }
    const schema = new EntitySchema<Row>({
      class: Row,
      tableName: 'rows',
      properties: { ...rootEntityProperties(), version: versionProperty() },
    });

    expect(Object.keys(schema.meta.properties)).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'version',
    ]);
    expect(schema.meta.properties.version.version).toBe(true);
  });
});

describe('versionProperty', () => {
  it('declares an accessor-mapped optimistic-lock column that starts at 1', () => {
    expect(versionProperty()).toEqual({
      type: 'number',
      fieldName: 'version',
      default: 1,
      accessor: true,
      version: true,
    });
  });

  it('uses the given column name', () => {
    expect(versionProperty('row_version').fieldName).toBe('row_version');
  });

  it('returns a fresh definition on every call', () => {
    expect(versionProperty()).not.toBe(versionProperty());
  });
});
