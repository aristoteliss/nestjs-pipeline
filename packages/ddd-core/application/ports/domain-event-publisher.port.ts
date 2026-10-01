/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IEvent } from '../../domain/events/event.interface.js';

/**
 * Publishes the buffered domain events of an aggregate after a command succeeds.
 *
 * Any bus with a `publishAll(events)` method fits, including the NestJS CQRS
 * `EventBus`, so a Nest handler passes its injected `EventBus` unchanged.
 * `CommandBaseHandler` passes the aggregate as `dispatcherContext`, which the
 * NestJS `EventBus` hands to its configured publisher.
 *
 * @example
 * ```ts
 * const publisher: IDomainEventPublisher = {
 *   publishAll: (events) => events.forEach((event) => emitter.emit('event', event)),
 * };
 * ```
 */
export interface IDomainEventPublisher {
  publishAll(events: IEvent[], dispatcherContext?: unknown): unknown;
}
