/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IEvent } from '../events/event.interface.js';

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
 * The event-buffering contract of an aggregate root, matching NestJS CQRS 12's
 * `IAggregateRoot`, so an aggregate built on either class satisfies it.
 *
 * A dispatcher context is any value the publisher understands, such as
 * `{ transaction }`; `undefined` lets the publisher choose its default.
 */
export interface IAggregateRoot<EventBase extends IEvent = IEvent> {
  /** When true, `apply()` publishes each event at once instead of buffering it. */
  autoCommit: boolean;
  /** Returns what the connected publisher returns, or `undefined` when none is. */
  publish<T extends EventBase = EventBase>(
    event: T,
    dispatcherContext?: unknown,
  ): unknown;
  /** Returns what the connected publisher returns, or `undefined` when none is. */
  publishAll<T extends EventBase = EventBase>(
    events: T[],
    dispatcherContext?: unknown,
  ): unknown;
  /**
   * Hands the buffered events to `publishAll()` and clears the buffer once it
   * returns, before an asynchronous publisher settles; returns its result.
   */
  commit(dispatcherContext?: unknown): unknown;
  uncommit(): void;
  getUncommittedEvents(): EventBase[];
  loadFromHistory(history: EventBase[]): void;
  apply<T extends EventBase = EventBase>(
    event: T,
    isFromHistory?: boolean,
  ): void;
  apply<T extends EventBase = EventBase>(
    event: T,
    options?: ApplyEventOptions,
  ): void;
}
