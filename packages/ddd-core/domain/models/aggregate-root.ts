/* Copyright (C) 2026-present Aristotelis — see repository license.
 * Derived from and compatible with NestJS CQRS AggregateRoot (MIT License).
 * Copyright (c) 2017-2026 Kamil Mysliwiec (https://kamilmysliwiec.com)
 */

import { IEvent } from '../events/event.interface';

const INTERNAL_EVENTS = Symbol('INTERNAL_EVENTS');
const IS_AUTO_COMMIT_ENABLED = Symbol('IS_AUTO_COMMIT_ENABLED');

/**
 * Options for applying an event to an aggregate root.
 */
export interface ApplyEventOptions {
  /**
   * Whether the event originates from historical rehydration.
   * If true, the event will not be buffered into uncommitted events.
   */
  readonly fromHistory?: boolean;

  /**
   * Whether to skip calling the corresponding `on<EventName>` handler.
   */
  readonly skipHandler?: boolean;
}

/**
 * Abstract base class representing a Domain-Driven Design (DDD) aggregate root.
 *
 * Provides a framework-neutral event buffering lifecycle:
 * - Records uncommitted domain events via {@link apply}.
 * - Dispatches events to optional `on<EventName>` instance handlers for internal state updates.
 * - Supports state rehydration via {@link loadFromHistory}.
 * - Exposes buffered events via {@link getUncommittedEvents} for out-of-band application dispatch.
 * - Clears buffered events via {@link uncommit} once reliably persisted or published.
 *
 * @template EventBase The base event type, defaults to {@link IEvent}.
 */
export abstract class AggregateRoot<EventBase extends IEvent = IEvent> {
  private [IS_AUTO_COMMIT_ENABLED] = false;
  private readonly [INTERNAL_EVENTS]: EventBase[] = [];

  /**
   * Sets whether the aggregate root should automatically commit and publish events upon application.
   */
  set autoCommit(value: boolean) {
    this[IS_AUTO_COMMIT_ENABLED] = value;
  }

  /**
   * Gets whether the aggregate root automatically commits and publishes events upon application.
   */
  get autoCommit(): boolean {
    return this[IS_AUTO_COMMIT_ENABLED];
  }

  /**
   * Called by apply() for each event while autoCommit is enabled; a no-op unless overridden.
   */
  publish<T extends EventBase = EventBase>(_event: T): void {}

  /**
   * Called by commit() with a copy of the buffered events; a no-op unless overridden.
   */
  publishAll<T extends EventBase = EventBase>(_events: T[]): void {}

  /**
   * Commits all uncommitted events by publishing them via {@link publishAll} and clearing the buffer.
   */
  commit(): void {
    this.publishAll([...this[INTERNAL_EVENTS]]);
    this[INTERNAL_EVENTS].length = 0;
  }

  /**
   * Clears all uncommitted events without publishing.
   */
  uncommit(): void {
    this[INTERNAL_EVENTS].length = 0;
  }

  /**
   * Returns all uncommitted events currently buffered on this aggregate.
   */
  getUncommittedEvents(): EventBase[] {
    return this[INTERNAL_EVENTS];
  }

  /**
   * Loads domain events from history to rehydrate the aggregate's internal state.
   * Historical events invoke event handlers without being re-buffered.
   */
  loadFromHistory(history: EventBase[]): void {
    for (const event of history) {
      this.apply(event, true);
    }
  }

  /**
   * Applies an event to the aggregate root.
   *
   * If `fromHistory` is false and `autoCommit` is disabled, the event is appended to
   * the uncommitted events buffer. If `autoCommit` is enabled, the event is published
   * immediately. Unless `skipHandler` is true, routes to `on<EventName>(event)` if present.
   *
   * @param event The domain event to apply.
   * @param optionsOrIsFromHistory Boolean indicating historical event or options object.
   */
  apply<T extends EventBase = EventBase>(
    event: T,
    optionsOrIsFromHistory: boolean | ApplyEventOptions = {},
  ): void {
    const isFromHistory =
      (typeof optionsOrIsFromHistory === 'boolean'
        ? optionsOrIsFromHistory
        : optionsOrIsFromHistory.fromHistory) ?? false;

    const skipHandler =
      (typeof optionsOrIsFromHistory === 'boolean'
        ? false
        : optionsOrIsFromHistory.skipHandler) ?? false;

    if (!isFromHistory && !this.autoCommit) {
      this[INTERNAL_EVENTS].push(event);
    }

    if (this.autoCommit) {
      this.publish(event);
    }

    if (!skipHandler) {
      const handler = this.getEventHandler(event);
      if (handler) {
        handler.call(this, event);
      }
    }
  }

  /**
   * Resolves the method handler corresponding to the applied event name (`on<EventName>`).
   */
  protected getEventHandler<T extends EventBase = EventBase>(
    event: T,
  ): ((event: T) => void) | undefined {
    const handler = `on${this.getEventName(event)}`;
    const method = (this as Record<string, unknown>)[handler];
    return typeof method === 'function'
      ? (method as (event: T) => void)
      : undefined;
  }

  /**
   * Resolves the constructor name of the event.
   */
  protected getEventName(event: unknown): string {
    const proto = Object.getPrototypeOf(event);
    return proto?.constructor?.name ?? 'Event';
  }
}
