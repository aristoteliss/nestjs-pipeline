/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception';

/**
 * Framework-neutral lookup failure for an aggregate or entity required by a use case.
 *
 * Application and persistence layers may throw this exception without importing
 * HTTP/Nest presentation semantics. Transport adapters are responsible for mapping
 * it to their own not-found representation (HTTP 404 in the users-api).
 */
export class EntityNotFoundException extends DomainException {
  constructor(
    readonly entityName: string,
    readonly entityId?: string,
  ) {
    super(`${entityName} not found`);
  }
}
