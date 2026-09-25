/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Marker interface for domain events.
 *
 * Framework-neutral base contract for all domain events buffered by
 * {@link AggregateRoot} and published through {@link IDomainEventPublisher}.
 */
// biome-ignore lint/suspicious/noEmptyInterface: framework-neutral marker interface for domain events
export interface IEvent {}
