/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it, vi } from 'vitest';
import { MapPersistenceErrors } from './map-persistence-errors.decorator';

function setup(failure?: unknown) {
  const entity = { id: 'entity-1' };
  const mapped = new Error('name already exists');
  const errorFactory = vi.fn().mockReturnValue(mapped);
  const selector = vi.fn((args: [string, typeof entity]) => args[1]);
  class Writer {
    readonly result = { saved: true };
    @MapPersistenceErrors<[string, typeof entity], typeof entity>({
      entity: selector,
      unique: [
        {
          constraint: 'other_unique',
          columns: 'items.other',
          error: () => new Error('other'),
        },
        {
          constraint: 'items_name_unique',
          columns: 'items.name',
          error: errorFactory,
        },
      ],
    })
    async write(label: string, value: typeof entity) {
      expect(label).toBe('update');
      expect(value).toBe(entity);
      if (failure !== undefined) throw failure;
      return this.result;
    }
  }
  const writer = new Writer();
  return {
    writer,
    entity,
    mapped,
    selector,
    errorFactory,
    run: () => writer.write('update', entity),
  };
}

describe('MapPersistenceErrors', () => {
  it('preserves receiver, arguments and successful result without invoking mapping callbacks', async () => {
    const { writer, run, selector, errorFactory } = setup();
    expect(await run()).toBe(writer.result);
    expect(selector).not.toHaveBeenCalled();
    expect(errorFactory).not.toHaveBeenCalled();
  });

  it.each([
    { code: '23505', constraint: 'items_name_unique' },
    new Error(
      'update failed: duplicate key value violates unique constraint "items_name_unique"',
    ),
    new Error('UNIQUE constraint failed: items.name'),
    new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: items.name'),
    new Error('driver failure\n  UNIQUE constraint failed: items.name\n'),
  ])(
    'selects the identified constraint and passes the selected aggregate: %s',
    async (failure) => {
      const { run, entity, mapped, errorFactory } = setup(failure);
      await expect(run()).rejects.toBe(mapped);
      expect(errorFactory).toHaveBeenCalledExactlyOnceWith(entity);
    },
  );

  it.each([
    null,
    'driver failure',
    42,
    new Error('unique application failure'),
    { code: '23505', constraint: 'unknown_unique' },
    { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    new Error('UNIQUE constraint failed: items.name, items.category'),
    new Error('UNIQUE constraint failed: items.namespace'),
    new Error('violates unique constraint "items_name_unique_suffix"'),
  ])(
    'preserves unrelated/ambiguous failures by identity: %s',
    async (failure) => {
      const { run, selector, errorFactory } = setup(failure);
      await expect(run()).rejects.toBe(failure);
      expect(selector).not.toHaveBeenCalled();
      expect(errorFactory).not.toHaveBeenCalled();
    },
  );

  it('rejects decorating a non-method', () => {
    const decorate = MapPersistenceErrors<[], object>({
      entity: () => ({}),
      unique: [],
    });
    expect(() => decorate({}, 'value', {})).toThrow(TypeError);
  });
});

/**
 * `otherwise` translates the failures no unique-constraint mapping claimed, such
 * as transient driver failures in delete command repositories.
 */
describe('MapPersistenceErrors otherwise translator', () => {
  function setupOtherwise(
    failure: unknown,
    translate: (error: unknown, entity: { id: string }) => unknown,
  ) {
    const entity = { id: 'entity-1' };
    const otherwise = vi.fn(translate);
    const constraintError = new Error('name already exists');
    const errorFactory = vi.fn().mockReturnValue(constraintError);

    class Writer {
      readonly result = { saved: true };
      @MapPersistenceErrors<[typeof entity], typeof entity>({
        entity: ([value]) => value,
        unique: [
          {
            constraint: 'items_name_unique',
            columns: 'items.name',
            error: errorFactory,
          },
        ],
        otherwise,
      })
      async write(_value: typeof entity) {
        if (failure !== undefined) throw failure;
        return this.result;
      }
    }

    const writer = new Writer();
    return {
      writer,
      entity,
      otherwise,
      errorFactory,
      constraintError,
      run: () => writer.write(entity),
    };
  }

  it('translates an unmatched failure and throws the replacement', async () => {
    const replacement = new Error('Transient persistence failure.');
    const failure = { code: 'ECONNRESET' };
    const { run, entity, otherwise } = setupOtherwise(
      failure,
      () => replacement,
    );

    await expect(run()).rejects.toBe(replacement);
    expect(otherwise).toHaveBeenCalledExactlyOnceWith(failure, entity);
  });

  it('preserves error identity when the translator returns the error unchanged', async () => {
    // This is the `mapPersistenceError` contract: non-transient failures pass
    // through, so repositories need no explicit re-throw guard for the domain
    // errors they raise deliberately (ConcurrencyConflictError, EntityNotFound…).
    const failure = new Error('deliberate domain failure');
    const { run, otherwise } = setupOtherwise(failure, (error) => error);

    await expect(run()).rejects.toBe(failure);
    expect(otherwise).toHaveBeenCalledOnce();
  });

  it('does not run when a unique constraint already claimed the failure', async () => {
    const { run, otherwise, constraintError, errorFactory } = setupOtherwise(
      { code: '23505', constraint: 'items_name_unique' },
      () => new Error('should not be reached'),
    );

    await expect(run()).rejects.toBe(constraintError);
    expect(errorFactory).toHaveBeenCalledOnce();
    expect(otherwise).not.toHaveBeenCalled();
  });

  it('does not run on success', async () => {
    const { writer, run, otherwise } = setupOtherwise(
      undefined,
      (error) => error,
    );

    expect(await run()).toBe(writer.result);
    expect(otherwise).not.toHaveBeenCalled();
  });
});
