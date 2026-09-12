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

import type { EventBus, ICommand } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { DomainEvent } from '../domain/events/domain.event';
import { RootEntity } from '../domain/models/root.entity';
import { CommandBaseHandler } from './command-base.handler';

class OrderCreatedEvent extends DomainEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

class PlainCommandHandler extends CommandBaseHandler<ICommand, string> {
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

    class AggregateCommandHandler extends CommandBaseHandler<
      ICommand,
      TestAggregate
    > {
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

    class ResultWithAggregateCommandHandler extends CommandBaseHandler<
      ICommand,
      { aggregate: TestAggregate; meta: string }
    > {
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

    class CustomReturnCommandHandler extends CommandBaseHandler<
      ICommand,
      { success: boolean }
    > {
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

    class NoEventsCommandHandler extends CommandBaseHandler<
      ICommand,
      TestAggregate
    > {
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

    class NullCommandHandler extends CommandBaseHandler<ICommand, null> {
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
