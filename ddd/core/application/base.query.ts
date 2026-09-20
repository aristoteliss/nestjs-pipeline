/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryOptions } from './query.options';

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
    Object.defineProperty(this, 'hydrate', {
      value: options?.hydrate ?? false,
      enumerable: false,
    });
    Object.defineProperty(this, 'refresh', {
      value: options?.refresh ?? false,
      enumerable: false,
    });
    if (sessionUser !== undefined) {
      Object.defineProperty(this, 'sessionUser', {
        value: sessionUser,
        enumerable: false,
      });
    }
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
    const json: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (value !== undefined) {
        json[key] = value;
      }
    }
    return json;
  }
}
