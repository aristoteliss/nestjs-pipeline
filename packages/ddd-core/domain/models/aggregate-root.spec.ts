/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { IEvent } from '../events/event.interface';
import { AggregateRoot } from './aggregate-root';

class OrderPlacedEvent implements IEvent {
  constructor(
    readonly orderId: string,
    readonly amount: number,
  ) {}
}

class OrderCancelledEvent implements IEvent {
  constructor(
    readonly orderId: string,
    readonly reason: string,
  ) {}
}

class TestOrderAggregate extends AggregateRoot {
  public handledPlacedEvents: OrderPlacedEvent[] = [];
  public handledCancelledEvents: OrderCancelledEvent[] = [];

  onOrderPlacedEvent(event: OrderPlacedEvent): void {
    this.handledPlacedEvents.push(event);
  }

  onOrderCancelledEvent(event: OrderCancelledEvent): void {
    this.handledCancelledEvents.push(event);
  }

  placeOrder(orderId: string, amount: number): void {
    this.apply(new OrderPlacedEvent(orderId, amount));
  }

  cancelOrder(orderId: string, reason: string): void {
    this.apply(new OrderCancelledEvent(orderId, reason));
  }
}

describe('AggregateRoot', () => {
  it('buffers uncommitted events on apply()', () => {
    const order = new TestOrderAggregate();
    order.placeOrder('ord-1', 100);

    const uncommitted = order.getUncommittedEvents();
    expect(uncommitted).toHaveLength(1);
    expect(uncommitted[0]).toBeInstanceOf(OrderPlacedEvent);
    expect((uncommitted[0] as OrderPlacedEvent).orderId).toBe('ord-1');
  });

  it('routes to on<EventName> handler on apply()', () => {
    const order = new TestOrderAggregate();
    order.placeOrder('ord-1', 100);

    expect(order.handledPlacedEvents).toHaveLength(1);
    expect(order.handledPlacedEvents[0].amount).toBe(100);
  });

  it('skips on<EventName> handler when skipHandler is true', () => {
    const order = new TestOrderAggregate();
    order.apply(new OrderPlacedEvent('ord-2', 200), { skipHandler: true });

    expect(order.handledPlacedEvents).toHaveLength(0);
    expect(order.getUncommittedEvents()).toHaveLength(1);
  });

  it('clears uncommitted events on uncommit()', () => {
    const order = new TestOrderAggregate();
    order.placeOrder('ord-1', 100);
    expect(order.getUncommittedEvents()).toHaveLength(1);

    order.uncommit();
    expect(order.getUncommittedEvents()).toHaveLength(0);
  });

  it('calls publishAll and clears events on commit()', () => {
    const order = new TestOrderAggregate();
    const publishAllSpy = vi.spyOn(order, 'publishAll');

    order.placeOrder('ord-1', 100);
    order.cancelOrder('ord-1', 'changed mind');

    order.commit();

    expect(publishAllSpy).toHaveBeenCalledTimes(1);
    expect(publishAllSpy).toHaveBeenCalledWith([
      expect.any(OrderPlacedEvent),
      expect.any(OrderCancelledEvent),
    ]);
    expect(order.getUncommittedEvents()).toHaveLength(0);
  });

  it('publishes immediately and does not buffer when autoCommit is enabled', () => {
    const order = new TestOrderAggregate();
    const publishSpy = vi.spyOn(order, 'publish');
    order.autoCommit = true;

    expect(order.autoCommit).toBe(true);

    order.placeOrder('ord-auto', 50);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith(expect.any(OrderPlacedEvent));
    expect(order.getUncommittedEvents()).toHaveLength(0);
    expect(order.handledPlacedEvents).toHaveLength(1);
  });

  it('rehydrates state without buffering events on loadFromHistory()', () => {
    const order = new TestOrderAggregate();
    const history = [
      new OrderPlacedEvent('ord-hist', 500),
      new OrderCancelledEvent('ord-hist', 'refund requested'),
    ];

    order.loadFromHistory(history);

    expect(order.handledPlacedEvents).toHaveLength(1);
    expect(order.handledCancelledEvents).toHaveLength(1);
    expect(order.getUncommittedEvents()).toHaveLength(0);
  });

  it('falls back to "Event" when applied event has no constructor name', () => {
    class DynamicHandlerAggregate extends AggregateRoot {
      handledDefault = false;
      onEvent() {
        this.handledDefault = true;
      }
    }
    const agg = new DynamicHandlerAggregate();
    const eventWithoutProto = Object.create(null);
    agg.apply(eventWithoutProto as any);
    expect(agg.handledDefault).toBe(true);
  });
});
