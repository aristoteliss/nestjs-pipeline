/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryOptions } from './query.options';

/**
 * Base class for application CQRS queries.
 *
 * Query options and authentication context are pipeline metadata rather than request
 * payload. Keeps them non-enumerable so payload validation and cache-key serialization
 * do not strip or include them.
 */
export abstract class BaseQuery<TSessionUser = unknown>
  implements IQueryOptions
{
  public declare readonly hydrate?: boolean;
  public declare readonly sessionUser?: TSessionUser;

  constructor(options?: Partial<IQueryOptions>, sessionUser?: TSessionUser) {
    Object.defineProperty(this, 'hydrate', {
      value: options?.hydrate ?? false,
      enumerable: false,
    });
    if (sessionUser !== undefined) {
      Object.defineProperty(this, 'sessionUser', {
        value: sessionUser,
        enumerable: false,
      });
    }
  }
}
