/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * The canonical UUIDv7 implementation, from `@cqrs-ddd/uuidv7`, which
 * `@nestjs-pipeline/core` also re-exports. UUIDs are timestamp-sortable across
 * different milliseconds; random bits mean values generated within the same
 * millisecond are not monotonic.
 */
export { uuidv7 } from '@cqrs-ddd/uuidv7';
