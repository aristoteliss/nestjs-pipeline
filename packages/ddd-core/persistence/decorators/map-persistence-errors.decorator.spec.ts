/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type IPersistenceDialect,
  persistenceDialect,
  setPersistenceDialect,
} from '../persistence-dialect.js';
import { MapPersistenceErrors } from './map-persistence-errors.decorator.js';

type Item = { id: string; name: string; code: string };

/** Reports the `violated` key an error carries, as a real dialect reads a constraint. */
const fakeDialect = (): IPersistenceDialect & {
  uniqueViolation: ReturnType<typeof vi.fn>;
} => ({
  uniqueViolation: vi.fn((error: unknown) =>
    typeof error === 'object' && error !== null && 'violated' in error
      ? String((error as { violated: unknown }).violated)
      : undefined,
  ),
});

const violation = (key: string) =>
  Object.assign(new Error(`unique ${key}`), { violated: key });

function setup(
  failure: unknown,
  options: { dialect?: IPersistenceDialect; withUnique?: boolean } = {},
) {
  const entity: Item = { id: 'entity-1', name: 'n', code: 'c' };
  const mapped = new Error('name already exists');
  const nameError = vi.fn().mockReturnValue(mapped);
  const selector = vi.fn((args: [string, Item]) => args[1]);
  const body = vi.fn();
  class Writer {
    readonly result = { saved: true };
    @MapPersistenceErrors<[string, Item], Item, 'items_pair'>({
      entity: selector,
      unique:
        options.withUnique === false
          ? undefined
          : { name: nameError, items_pair: () => new Error('pair') },
      dialect: options.dialect,
    })
    async write(label: string, value: Item) {
      body(label, value);
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
    nameError,
    body,
    run: () => writer.write('update', entity),
  };
}

describe('MapPersistenceErrors', () => {
  afterEach(() => setPersistenceDialect(undefined));

  it('preserves receiver, arguments and successful result without invoking mapping callbacks', async () => {
    const dialect = fakeDialect();
    const { writer, run, selector, nameError, body, entity } = setup(
      undefined,
      { dialect },
    );

    expect(await run()).toBe(writer.result);
    expect(body).toHaveBeenCalledWith('update', entity);
    expect(selector).not.toHaveBeenCalled();
    expect(nameError).not.toHaveBeenCalled();
    expect(dialect.uniqueViolation).not.toHaveBeenCalled();
  });

  it('builds the domain error the dialect names, from the selected entity', async () => {
    const dialect = fakeDialect();
    const failure = violation('name');
    const { run, entity, mapped, nameError } = setup(failure, { dialect });

    await expect(run()).rejects.toBe(mapped);
    expect(dialect.uniqueViolation).toHaveBeenCalledWith(failure, entity);
    expect(nameError).toHaveBeenCalledExactlyOnceWith(entity);
  });

  it('maps a declared multi-column constraint by its name', async () => {
    const { run } = setup(violation('items_pair'), { dialect: fakeDialect() });

    await expect(run()).rejects.toThrow('pair');
  });

  it('uses the registered dialect when the options name none', async () => {
    setPersistenceDialect(fakeDialect());
    const { run, mapped } = setup(violation('name'));

    await expect(run()).rejects.toBe(mapped);
    expect(persistenceDialect()).toBeDefined();
  });

  it('prefers the dialect in the options over the registered one', async () => {
    const registered = fakeDialect();
    setPersistenceDialect(registered);
    const own = fakeDialect();
    const { run, mapped } = setup(violation('name'), { dialect: own });

    await expect(run()).rejects.toBe(mapped);
    expect(own.uniqueViolation).toHaveBeenCalledOnce();
    expect(registered.uniqueViolation).not.toHaveBeenCalled();
  });

  it.each([
    ['an error the dialect does not recognize', new Error('driver failure')],
    ['a constraint with no mapping', violation('code')],
    ['a non-object failure', 'driver failure'],
  ])('rethrows %s unchanged', async (_case, failure) => {
    const { run, nameError } = setup(failure, { dialect: fakeDialect() });

    await expect(run()).rejects.toBe(failure);
    expect(nameError).not.toHaveBeenCalled();
  });

  it('refuses to run a method that maps unique errors without any dialect', async () => {
    const { run, body } = setup(undefined);

    await expect(run()).rejects.toThrow(
      'Unique-constraint mapping needs a persistence dialect',
    );
    expect(body).not.toHaveBeenCalled();
  });

  it('needs no dialect when it maps no unique errors', async () => {
    const failure = violation('name');
    const { run } = setup(failure, { withUnique: false });

    await expect(run()).rejects.toBe(failure);
  });

  it('rejects decorating a non-method', () => {
    const decorate = MapPersistenceErrors<[], object>({ entity: () => ({}) });
    expect(() => decorate({}, 'value', {})).toThrow(TypeError);
  });
});

/**
 * `otherwise` translates the failures no unique mapping claimed, such as
 * transient driver failures in delete command repositories.
 */
describe('MapPersistenceErrors otherwise translator', () => {
  function setupOtherwise(
    failure: unknown,
    translate: (error: unknown, entity: Item) => unknown,
  ) {
    const entity: Item = { id: 'entity-1', name: 'n', code: 'c' };
    const otherwise = vi.fn(translate);
    const constraintError = new Error('name already exists');
    const nameError = vi.fn().mockReturnValue(constraintError);

    class Writer {
      readonly result = { saved: true };
      @MapPersistenceErrors<[Item], Item>({
        entity: ([value]) => value,
        unique: { name: nameError },
        dialect: fakeDialect(),
        otherwise,
      })
      async write(_value: Item) {
        if (failure !== undefined) throw failure;
        return this.result;
      }
    }

    const writer = new Writer();
    return {
      writer,
      entity,
      otherwise,
      nameError,
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

  it('runs with this bound to the decorated instance', async () => {
    const { writer, run, otherwise } = setupOtherwise(
      new Error('lost'),
      (error) => error,
    );

    await expect(run()).rejects.toThrow('lost');
    expect(otherwise.mock.contexts[0]).toBe(writer);
  });

  it('preserves error identity when the translator returns the error unchanged', async () => {
    const failure = new Error('deliberate domain failure');
    const { run, otherwise } = setupOtherwise(failure, (error) => error);

    await expect(run()).rejects.toBe(failure);
    expect(otherwise).toHaveBeenCalledOnce();
  });

  it('does not run when a unique mapping already claimed the failure', async () => {
    const { run, otherwise, constraintError, nameError } = setupOtherwise(
      violation('name'),
      () => new Error('should not be reached'),
    );

    await expect(run()).rejects.toBe(constraintError);
    expect(nameError).toHaveBeenCalledOnce();
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
