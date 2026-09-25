/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryOptions } from './query.options';
import { definedFields, defineHidden } from './request-fields.helper';

/**
 * Base class for application CQRS queries.
 *
 * Query options and authentication context are pipeline metadata rather than request
 * payload. They are stored as non-enumerable properties so Zod validation and
 * cache-key serialization operate only on the query payload.
 *
 * @typeParam TSessionUser - Application-specific principal/session metadata type.
 *
 * @example
 * ```ts
 * export class GetUserQuery extends createQuery(GetUserSchema, BaseQuery) {}
 *
 * const query = new GetUserQuery(
 *   { id: userId },
 *   { hydrate: true },
 *   sessionUser,
 * );
 * ```
 */
export abstract class BaseQuery<TSessionUser = unknown>
  implements IQueryOptions
{
  public declare readonly hydrate?: boolean;
  public declare readonly refresh?: boolean;
  public declare readonly sessionUser?: TSessionUser;

  constructor(options?: Partial<IQueryOptions>, sessionUser?: TSessionUser) {
    defineHidden(this, 'hydrate', options?.hydrate ?? false);
    defineHidden(this, 'refresh', options?.refresh ?? false);
    if (sessionUser !== undefined)
      defineHidden(this, 'sessionUser', sessionUser);
  }

  /**
   * Serializes enumerable query payload fields to a plain object.
   *
   * `hydrate` and `sessionUser` remain out of the payload because they are
   * non-enumerable query metadata.
   *
   * @returns The query payload with `undefined` fields omitted.
   */
  toJSON(): Record<string, unknown> {
    return definedFields(this);
  }
}
