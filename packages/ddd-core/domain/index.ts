/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Domain primitives. Free of ORM and persistence dependencies.
 *
 * Import from here — `@cqrs-ddd/core/domain` — in domain code, so a
 * file that only needs `DomainException` does not pull the persistence layer in
 * behind it.
 */

export * from './decorators/apply-mutation.decorator.js';
export * from './decorators/mutable.decorator.js';
export * from './events/domain.event.js';
export * from './events/event.interface.js';
export * from './events/root-domain.event.js';
export * from './exceptions/concurrency-conflict.error.js';
export * from './exceptions/domain.exception.js';
export * from './exceptions/entity-not-found.exception.js';
export * from './exceptions/invalid-value.exception.js';
export * from './exceptions/missing-tenant-context.exception.js';
export * from './exceptions/transient-operation.error.js';
export * from './exceptions/unknown-mutable-field.error.js';
export * from './interfaces/aggregate-root.interface.js';
export * from './interfaces/root-entity-snapshot.interface.js';
export * from './models/aggregate-root.js';
export * from './models/root.entity.js';
export * from './rules/number.rule.js';
export * from './rules/text.rule.js';
export * from './rules/value-violation.js';
