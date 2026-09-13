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
