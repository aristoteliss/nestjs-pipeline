/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IEvent } from '@nestjs/cqrs';
import { uuidv7 } from '@nestjs-pipeline/core';

/**
 * Base class for all domain events.
 *
 * Carries a unique `id` (a time-sortable `uuidv7`) generated on construction
 * unless one is supplied. Concrete events extend this to describe something that
 * has happened in the domain.
 */
export abstract class DomainEvent implements IEvent {
  public readonly id: string;

  protected constructor(id?: string) {
    this.id = id ?? uuidv7();
  }
}
