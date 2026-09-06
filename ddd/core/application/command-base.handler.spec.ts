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
import { DomainOutcome } from '../domain/outcomes/domain.outcome';
import { CommandBaseHandler } from './command-base.handler';

class CreateOrderCommand implements ICommand {
  constructor(public readonly orderId: string) {}
}

class OrderCreatedEvent extends DomainEvent {
  constructor(public readonly orderId: string) {
    super();
  }
}

class OrderOutcome extends DomainOutcome {
  constructor(
    public readonly orderId: string,
    events: DomainEvent[],
  ) {
    super(events);
  }
}

class CreateOrderHandler extends CommandBaseHandler<
  CreateOrderCommand,
  OrderOutcome
> {
  async handle(command: CreateOrderCommand): Promise<OrderOutcome> {
    const event = new OrderCreatedEvent(command.orderId);
    return new OrderOutcome(command.orderId, [event]);
  }
}

class PlainCommandHandler extends CommandBaseHandler<ICommand, string> {
  async handle(_command: ICommand): Promise<string> {
    return 'non-outcome-result';
  }
}

describe('CommandBaseHandler', () => {
  it('publishes domain events to eventBus when handle returns DomainOutcome', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    const handler = new CreateOrderHandler(eventBus);
    const command = new CreateOrderCommand('order-101');

    const result = await handler.execute(command);

    expect(result).toBeInstanceOf(OrderOutcome);
    expect(result.orderId).toBe('order-101');
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledWith(result.events);
  });

  it('does not publish events if handle returns non-DomainOutcome', async () => {
    const eventBus = {
      publishAll: vi.fn(),
    } as unknown as EventBus;

    const handler = new PlainCommandHandler(eventBus);
    const result = await handler.execute({} as ICommand);

    expect(result).toBe('non-outcome-result');
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
      expect.arrayContaining([expect.objectContaining({ orderId: 'custom-101' })]),
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
