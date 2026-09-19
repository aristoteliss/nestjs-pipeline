/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { EventBus, ICommand } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { DomainEvent } from '../domain/events/domain.event';
import { RootEntity } from '../domain/models/root.entity';
import {
  type AggregateBearingResult,
  CommandBaseHandler,
} from './command-base.handler';

class OrderCreatedEvent extends DomainEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

/**
 * `CommandBaseHandler`'s constructor is protected: a concrete handler declares
 * its own public constructor with `@Inject(EventBus)`. This is the test
 * equivalent, so the specs build handlers the way an application does instead
 * of reaching past the modifier.
 */
abstract class TestableHandler<
  TResult extends AggregateBearingResult,
> extends CommandBaseHandler<ICommand, TResult> {
  // biome-ignore lint/complexity/noUselessConstructor: can init test
  constructor(eventBus: EventBus) {
    super(eventBus);
  }
}

class PlainCommandHandler extends TestableHandler<// @ts-expect-error — the constraint forbids a non-aggregate result. The
// runtime guard is what this test exercises: JavaScript callers and `as any`
// still reach it, and it must not publish anything.
string> {
  async handle(_command: ICommand): Promise<string> {
    return 'non-aggregate-result';
  }
}

describe('CommandBaseHandler', () => {
  it('does not publish events if handle returns plain non-aggregate result', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    const handler = new PlainCommandHandler(eventBus);
    const result = await handler.execute({} as ICommand);

    expect(result).toBe('non-aggregate-result');
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('publishes uncommitted events and uncommits when handle returns AggregateRoot', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    class TestAggregate extends RootEntity {
      afterUpdate(): void {}
      toJSON() {
        return this.freezeState({
          id: this.id,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        });
      }
    }

    class AggregateCommandHandler extends TestableHandler<TestAggregate> {
      async handle(_command: ICommand): Promise<TestAggregate> {
        const agg = new TestAggregate();
        agg.apply(new OrderCreatedEvent('agg-101'));
        return agg;
      }
    }

    const handler = new AggregateCommandHandler(eventBus);
    const agg = await handler.execute({} as ICommand);

    expect(agg).toBeInstanceOf(TestAggregate);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ orderId: 'agg-101' })]),
    );
    expect(agg.getUncommittedEvents()).toHaveLength(0);
  });

  it('automatically publishes uncommitted events and clears them when handle returns an object containing an aggregate', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    class TestAggregate extends RootEntity {
      afterUpdate(): void {}
      toJSON() {
        return this.freezeState({
          id: this.id,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        });
      }
    }

    class ResultWithAggregateCommandHandler extends TestableHandler<{
      aggregate: TestAggregate;
      meta: string;
    }> {
      async handle(
        _command: ICommand,
      ): Promise<{ aggregate: TestAggregate; meta: string }> {
        const agg = new TestAggregate();
        agg.apply(new OrderCreatedEvent('agg-in-result-101'));
        return { aggregate: agg, meta: 'test-meta' };
      }
    }

    const handler = new ResultWithAggregateCommandHandler(eventBus);
    const result = await handler.execute({} as ICommand);

    expect(result.meta).toBe('test-meta');
    expect(result.aggregate).toBeInstanceOf(TestAggregate);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ orderId: 'agg-in-result-101' }),
      ]),
    );
    expect(result.aggregate.getUncommittedEvents()).toHaveLength(0);
  });

  it('publishes uncommitted events via protected commit() helper when returning non-aggregate result', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    class TestAggregate extends RootEntity {
      afterUpdate(): void {}
      toJSON() {
        return this.freezeState({
          id: this.id,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        });
      }
    }

    class CustomReturnCommandHandler extends TestableHandler<// @ts-expect-error — as above: a result carrying no aggregate is rejected
    // by the type, and this asserts the explicit commit() path still works.
    { success: boolean }> {
      async handle(_command: ICommand): Promise<{ success: boolean }> {
        const agg = new TestAggregate();
        agg.apply(new OrderCreatedEvent('custom-101'));
        this.commit(agg);
        return { success: true };
      }
    }

    const handler = new CustomReturnCommandHandler(eventBus);
    const result = await handler.execute({} as ICommand);

    expect(result).toEqual({ success: true });
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ orderId: 'custom-101' }),
      ]),
    );
  });

  it('does not publish events when aggregate has no uncommitted events', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    class TestAggregate extends RootEntity {
      afterUpdate(): void {}
      toJSON() {
        return this.freezeState({
          id: this.id,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        });
      }
    }

    class NoEventsCommandHandler extends TestableHandler<TestAggregate> {
      async handle(_command: ICommand): Promise<TestAggregate> {
        return new TestAggregate();
      }
    }

    const handler = new NoEventsCommandHandler(eventBus);
    await handler.execute({} as ICommand);

    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('does not throw or publish when handle returns null or undefined', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    class NullCommandHandler extends TestableHandler<// @ts-expect-error — as above: null is not an aggregate-bearing result.
    null> {
      async handle(_command: ICommand): Promise<null> {
        return null;
      }
    }

    const handler = new NullCommandHandler(eventBus);
    const result = await handler.execute({} as ICommand);

    expect(result).toBeNull();
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });
});
