/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { DomainEvent } from '../domain/events/domain.event';
import { AggregateRoot } from '../domain/models/aggregate-root';
import { RootEntity } from '../domain/models/root.entity';
import {
  type AggregateBearingResult,
  CommandBaseHandler,
} from './command-base.handler';
import type { IDomainEventPublisher } from './domain-event-publisher.port';

type TestCommand = object;

class BufferedAggregate extends AggregateRoot {}

class OrderCreatedEvent extends DomainEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

/**
 * `CommandBaseHandler`'s constructor is protected: a concrete handler declares
 * its own public constructor that receives its event publisher (a Nest handler
 * injects `EventBus`). This is the test
 * equivalent, so the specs build handlers the way an application does instead
 * of reaching past the modifier.
 */
abstract class TestableHandler<
  TResult extends AggregateBearingResult,
> extends CommandBaseHandler<TestCommand, TResult> {
  // biome-ignore lint/complexity/noUselessConstructor: can init test
  constructor(eventBus: IDomainEventPublisher) {
    super(eventBus);
  }
}

class PlainCommandHandler extends TestableHandler<// @ts-expect-error — the constraint forbids a non-aggregate result. The
// runtime guard is what this test exercises: JavaScript callers and `as any`
// still reach it, and it must not publish anything.
string> {
  async handle(_command: TestCommand): Promise<string> {
    return 'non-aggregate-result';
  }
}

describe('CommandBaseHandler', () => {
  it('does not publish events if handle returns plain non-aggregate result', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

    const handler = new PlainCommandHandler(eventBus);
    const result = await handler.execute({} as TestCommand);

    expect(result).toBe('non-aggregate-result');
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('publishes uncommitted events and uncommits when handle returns AggregateRoot', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

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
      async handle(_command: TestCommand): Promise<TestAggregate> {
        const agg = new TestAggregate();
        agg.apply(new OrderCreatedEvent('agg-101'));
        return agg;
      }
    }

    const handler = new AggregateCommandHandler(eventBus);
    const agg = await handler.execute({} as TestCommand);

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
    } as unknown as IDomainEventPublisher;

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
        _command: TestCommand,
      ): Promise<{ aggregate: TestAggregate; meta: string }> {
        const agg = new TestAggregate();
        agg.apply(new OrderCreatedEvent('agg-in-result-101'));
        return { aggregate: agg, meta: 'test-meta' };
      }
    }

    const handler = new ResultWithAggregateCommandHandler(eventBus);
    const result = await handler.execute({} as TestCommand);

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

  it('does not publish buffered events when command handling fails', async () => {
    const aggregate = new BufferedAggregate();
    const event = new OrderCreatedEvent('failed-command');
    const failure = new Error('persistence failed');
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

    class FailingHandler extends TestableHandler<AggregateRoot> {
      async handle(): Promise<AggregateRoot> {
        aggregate.apply(event);
        throw failure;
      }
    }

    await expect(new FailingHandler(eventBus).execute({})).rejects.toBe(
      failure,
    );
    expect(eventBus.publishAll).not.toHaveBeenCalled();
    expect(aggregate.getUncommittedEvents()).toEqual([event]);
  });

  it('preserves buffered events when publication throws', async () => {
    const aggregate = new BufferedAggregate();
    const event = new OrderCreatedEvent('failed-publication');
    aggregate.apply(event);
    const failure = new Error('publication failed');
    const publishAll = vi.fn(() => {
      throw failure;
    });
    const eventBus = { publishAll } as unknown as IDomainEventPublisher;

    class Handler extends TestableHandler<AggregateRoot> {
      async handle(): Promise<AggregateRoot> {
        return aggregate;
      }
    }

    await expect(new Handler(eventBus).execute({})).rejects.toBe(failure);
    expect(publishAll).toHaveBeenCalledExactlyOnceWith([event]);
    expect(aggregate.getUncommittedEvents()).toEqual([event]);
  });

  it('does not publish events when aggregate has no uncommitted events', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

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
      async handle(_command: TestCommand): Promise<TestAggregate> {
        return new TestAggregate();
      }
    }

    const handler = new NoEventsCommandHandler(eventBus);
    await handler.execute({} as TestCommand);

    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('does not throw or publish when handle returns null or undefined', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

    class NullCommandHandler extends TestableHandler<// @ts-expect-error — as above: null is not an aggregate-bearing result.
    null> {
      async handle(_command: TestCommand): Promise<null> {
        return null;
      }
    }

    const handler = new NullCommandHandler(eventBus);
    const result = await handler.execute({} as TestCommand);

    expect(result).toBeNull();
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('does not publish events if result has getUncommittedEvents but lacks uncommit', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as IDomainEventPublisher;

    class IncompleteAggregateHandler extends TestableHandler<any> {
      async handle(_command: TestCommand): Promise<any> {
        return { getUncommittedEvents: () => [new OrderCreatedEvent('123')] };
      }
    }

    const handler = new IncompleteAggregateHandler(eventBus);
    await handler.execute({} as TestCommand);

    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });
});
