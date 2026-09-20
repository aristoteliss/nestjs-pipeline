/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Domain primitives. Free of ORM and persistence dependencies.
 *
 * Import from here — `@nestjs-pipeline/ddd-core/domain` — in domain code, so a
 * file that only needs `DomainException` does not pull the persistence layer in
 * behind it.
 */

export * from './decorators/ApplyMutation';
export * from './decorators/Mutable';
export * from './events/domain.event';
export * from './events/event.interface';
export * from './events/root-domain.event';
export * from './exceptions/concurrency-conflict.error';
export * from './exceptions/domain.exception';
export * from './exceptions/entity-not-found.exception';
export * from './exceptions/missing-tenant-context.exception';
export * from './exceptions/transient-operation.error';
export * from './exceptions/unknown-mutable-field.error';
export * from './interfaces/root-entity-snapshot.interface';
export * from './models/aggregate-root';
export * from './models/root.entity';
