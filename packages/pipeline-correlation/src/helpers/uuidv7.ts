/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Canonical UUIDv7 implementation shared with `@nestjs-pipeline/core`.
 * UUIDs are timestamp-sortable across different milliseconds; random bits mean
 * values generated within the same millisecond are not monotonic.
 */
export { uuidv7 } from '@nestjs-pipeline/core';
