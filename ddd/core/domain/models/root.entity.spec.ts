/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { uuidv7 } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { DddCoreModule } from '../../ddd-core.module';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from './root.entity';

interface TestSnapshot extends Partial<RootEntitySnapshot> {
  name: string;
}

class TestEntity extends RootEntity<TestSnapshot> {
  prefixKey = 'test:';
  name: string;
  afterUpdateHook = vi.fn();

  constructor(snapshot?: Partial<TestSnapshot>) {
    super(snapshot);
    this.name = snapshot?.name ?? 'default';
  }

  get cacheKey(): string {
    return `${this.prefixKey}${this.id}`;
  }

  triggerUpdate(): void {
    this.onUpdate();
  }

  afterUpdate(): void {
    this.afterUpdateHook();
  }

  toJSON(): RootEntitySnapshot & TestSnapshot {
    return this.freezeState({
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
    });
  }

  static fromJSON(snapshot: TestSnapshot): TestEntity {
    return new TestEntity(snapshot);
  }
}

describe('RootEntity', () => {
  it('initializes new entity with generated UUIDv7 and current timestamps', () => {
    const entity = new TestEntity({ name: 'Alpha' });

    expect(entity.id).toBeDefined();
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
    expect(entity.cacheKey).toBe(`test:${entity.id}`);
  });

  it('rehydrates an entity when id, createdAt, and updatedAt are provided together', () => {
    const id = uuidv7();
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const entity = new TestEntity({
      id,
      createdAt,
      updatedAt,
      name: 'Rehydrated',
    });

    expect(entity.id).toBe(id);
    expect(entity.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(entity.updatedAt.toISOString()).toBe(updatedAt.toISOString());
    expect(entity.name).toBe('Rehydrated');
  });

  it('normalizes whitespace around a valid rehydrated id', () => {
    const id = uuidv7();
    const entity = new TestEntity({
      id: `  ${id}\n`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      name: 'Rehydrated',
    });

    expect(entity.id).toBe(id);
    expect(entity.cacheKey).toBe(`test:${id}`);
  });

  it('throws when only partial rehydration fields are provided', () => {
    const id = uuidv7();
    expect(() => new TestEntity({ id })).toThrowError(
      'id, createdAt, and updatedAt must be provided together when rehydrating an entity.',
    );
  });

  it('throws on invalid UUIDv7 id during rehydration', () => {
    expect(
      () =>
        new TestEntity({
          id: 'invalid-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).toThrowError('id must be a valid UUID v7.');
  });

  it('throws when date string is empty or whitespace', () => {
    const id = uuidv7();
    expect(
      () =>
        new TestEntity({
          id,
          createdAt: '   ',
          updatedAt: new Date(),
        }),
    ).toThrow('Date is empty.');
  });

  it('throws on invalid date during rehydration', () => {
    const id = uuidv7();
    expect(
      () =>
        new TestEntity({
          id,
          createdAt: 'invalid-date' as any,
          updatedAt: new Date(),
        }),
    ).toThrowError('Date must be a valid non-empty date.');
  });

  it('updates updatedAt and calls afterUpdate hook on mutation', () => {
    const entity = new TestEntity({ name: 'Initial' });
    const initialUpdatedAt = entity.updatedAt;

    entity.triggerUpdate();

    expect(entity.afterUpdateHook).toHaveBeenCalledTimes(1);
    expect(entity.updatedAt.getTime()).toBeGreaterThanOrEqual(
      initialUpdatedAt.getTime(),
    );
  });

  it('serializes state with toJSON', () => {
    const entity = new TestEntity({ name: 'Serialized' });
    const json = entity.toJSON();

    expect(json.id).toBe(entity.id);
    expect(json.name).toBe('Serialized');
    expect(Object.isFrozen(json)).toBe(true);
  });

  describe('authorize()', () => {
    it('throws Error when no authorizer or default is configured', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      expect(() => entity.authorize('read')).toThrow(
        /No entity authorizer configured/,
      );
    });

    it('authorizes read and masks non-permitted fields from partial snapshot', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(
          (
            action: string,
            _subject: string,
            _entity: Record<string, unknown>,
            field?: string,
          ) => {
            if (action === 'read' && field === 'name') return false;
            if (action === 'read') return true;
            return false;
          },
        ),
      };

      const snapshot = entity.authorize('read', undefined, authorizer);
      expect(snapshot.name).toBeUndefined();
      expect(snapshot.id).toBe(entity.id);
      expect(snapshot.createdAt).toBeDefined();
    });

    it('throws UnauthorizedActionException when read on subject is forbidden', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => false),
      };

      expect(() => entity.authorize('read', undefined, authorizer)).toThrow(
        UnauthorizedActionException,
      );

      try {
        entity.authorize('read', undefined, authorizer);
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedActionException);
        const ex = err as UnauthorizedActionException;
        expect(ex.action).toBe('read');
        expect(ex.subject).toBe('TestEntity');
        expect(ex.entityId).toBe(entity.id);
      }
    });

    it('allows create action when authorizer permits it and returns snapshot', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => true),
      };

      const snapshot = entity.authorize('create', undefined, authorizer);
      expect(snapshot.name).toBe('Alpha');
      expect(authorizer.can).toHaveBeenCalledWith(
        'create',
        'TestEntity',
        expect.any(Object),
      );
    });

    it('throws UnauthorizedActionException when create is forbidden', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => false),
      };

      expect(() => entity.authorize('create', undefined, authorizer)).toThrow(
        UnauthorizedActionException,
      );
    });

    it('allows update action when all requested fields are permitted', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => true),
      };

      const snapshot = entity.authorize('update', ['name'], authorizer);
      expect(snapshot.name).toBe('Alpha');
      expect(authorizer.can).toHaveBeenCalledWith(
        'update',
        'TestEntity',
        expect.any(Object),
        'name',
      );
    });

    it('throws UnauthorizedActionException when update on entity is forbidden', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(
          (_action: string, _subj: string, _e: unknown, field?: string) => {
            if (field === undefined) return false;
            return true;
          },
        ),
      };

      expect(() => entity.authorize('update', undefined, authorizer)).toThrow(
        UnauthorizedActionException,
      );
    });

    it('throws UnauthorizedActionException when update on specific field is forbidden', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(
          (
            action: string,
            _subj: string,
            _entity: Record<string, unknown>,
            field?: string,
          ) => action === 'update' && field !== 'name',
        ),
      };

      expect(() => entity.authorize('update', ['name'], authorizer)).toThrow(
        UnauthorizedActionException,
      );

      try {
        entity.authorize('update', ['name'], authorizer);
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedActionException);
        const ex = err as UnauthorizedActionException;
        expect(ex.action).toBe('update');
        expect(ex.subject).toBe('TestEntity');
        expect(ex.entityId).toBe(entity.id);
        expect(ex.fields).toContain('name');
      }
    });

    it('allows delete action when authorizer permits it and returns snapshot', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => true),
      };

      const snapshot = entity.authorize('delete', undefined, authorizer);
      expect(snapshot.name).toBe('Alpha');
    });

    it('throws UnauthorizedActionException when delete is forbidden', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const authorizer = {
        can: vi.fn(() => false),
      };

      expect(() => entity.authorize('delete', undefined, authorizer)).toThrow(
        UnauthorizedActionException,
      );
    });

    it('falls back to RootEntity.defaultAuthorizer when authorizer argument is omitted', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const mockAuthorizer = {
        can: vi.fn(() => true),
      };

      RootEntity.defaultAuthorizer = mockAuthorizer;
      try {
        const result = entity.authorize('read');
        expect(mockAuthorizer.can).toHaveBeenCalled();
        expect(result.name).toBe('Alpha');
      } finally {
        RootEntity.defaultAuthorizer = undefined;
      }
    });

    it('prioritizes explicit authorizer over RootEntity.defaultAuthorizer', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const defaultAuth = {
        can: vi.fn(() => false),
      };
      const explicitAuth = {
        can: vi.fn(() => true),
      };

      RootEntity.defaultAuthorizer = defaultAuth;
      try {
        const result = entity.authorize('read', undefined, explicitAuth);
        expect(explicitAuth.can).toHaveBeenCalled();
        expect(defaultAuth.can).not.toHaveBeenCalled();
        expect(result.name).toBe('Alpha');
      } finally {
        RootEntity.defaultAuthorizer = undefined;
      }
    });

    it('registers authorizer from DI via DddCoreModule on module init', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const mockAuth = {
        can: vi.fn(() => true),
      };

      const module = new DddCoreModule(mockAuth);
      module.onModuleInit();

      try {
        const result = entity.authorize('read');
        expect(mockAuth.can).toHaveBeenCalled();
        expect(result.name).toBe('Alpha');
      } finally {
        RootEntity.defaultAuthorizer = undefined;
      }
    });
  });

  describe('from()', () => {
    it('returns candidate as-is when already an entity instance', () => {
      const entity = new TestEntity({ name: 'Alpha' });
      const result = TestEntity.from(entity);
      expect(result).toBe(entity);
    });

    it('rehydrates snapshot into entity when plain object is given', () => {
      const snapshot: TestSnapshot = {
        id: uuidv7(),
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'FromSnapshot',
      };
      const result = TestEntity.from(snapshot);
      expect(result).toBeInstanceOf(TestEntity);
      expect(result?.name).toBe('FromSnapshot');
    });

    it('returns null when candidate is null or undefined', () => {
      expect(TestEntity.from(null)).toBeNull();
      expect(TestEntity.from(undefined)).toBeNull();
    });
  });
});
