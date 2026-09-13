import { describe, expect, it, vi } from 'vitest';
import { AcknowledgePersisted } from './acknowledge-persisted.decorator';

describe('AcknowledgePersisted', () => {
  it('selects a non-first argument and preserves this, arguments, result, and entry version', async () => {
    const aggregate = { version: 2, acknowledgePersisted: vi.fn() };
    const result = { saved: true };
    class Writer {
      readonly prefix = 'writer';
      @AcknowledgePersisted<[string, typeof aggregate]>({
        entity: ([, entity]) => entity,
      })
      async write(label: string, entity: typeof aggregate) {
        expect(this.prefix).toBe('writer');
        expect(label).toBe('update');
        expect(entity.acknowledgePersisted).not.toHaveBeenCalled();
        entity.version = 3;
        return result;
      }
    }
    expect(await new Writer().write('update', aggregate)).toBe(result);
    expect(aggregate.acknowledgePersisted).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('does not acknowledge a rejected operation', async () => {
    const aggregate = { version: 2, acknowledgePersisted: vi.fn() };
    const error = new Error('write failed');
    class Writer {
      @AcknowledgePersisted<[typeof aggregate]>({
        entity: ([entity]) => entity,
      })
      async write(_entity: typeof aggregate) {
        throw error;
      }
    }
    await expect(new Writer().write(aggregate)).rejects.toBe(error);
    expect(aggregate.acknowledgePersisted).not.toHaveBeenCalled();
  });
});

describe('AcknowledgePersisted completion contract', () => {
  it('waits for completion and isolates overlapping calls on different aggregates', async () => {
    type Entity = {
      version: number;
      acknowledgePersisted: (version: number) => void;
    };
    const first = { version: 2, acknowledgePersisted: vi.fn() };
    const second = { version: 7, acknowledgePersisted: vi.fn() };
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const pendingFirst = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const pendingSecond = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    class Writer {
      @AcknowledgePersisted<[Entity, Promise<void>]>({
        entity: ([entity]) => entity,
      })
      async write(_entity: Entity, completion: Promise<void>) {
        await completion;
      }
    }
    const writer = new Writer();
    const one = writer.write(first, pendingFirst);
    const two = writer.write(second, pendingSecond);
    expect(first.acknowledgePersisted).not.toHaveBeenCalled();
    expect(second.acknowledgePersisted).not.toHaveBeenCalled();
    second.version = 8;
    finishSecond();
    await two;
    expect(second.acknowledgePersisted).toHaveBeenCalledExactlyOnceWith(7);
    expect(first.acknowledgePersisted).not.toHaveBeenCalled();
    finishFirst();
    await one;
    expect(first.acknowledgePersisted).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('does not execute the method when aggregate selection fails', async () => {
    const failure = new Error('aggregate missing');
    const operation = vi.fn().mockResolvedValue('saved');
    const descriptor = { value: operation };
    AcknowledgePersisted<[]>({
      entity: () => {
        throw failure;
      },
    })({}, 'save', descriptor);
    await expect(descriptor.value()).rejects.toBe(failure);
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects a non-method descriptor at decoration time', () => {
    expect(() =>
      AcknowledgePersisted<[]>({
        entity: () => ({ version: 1, acknowledgePersisted: vi.fn() }),
      })({}, 'value', {}),
    ).toThrow(TypeError);
  });
});
