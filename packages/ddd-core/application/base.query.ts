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
 * export class GetUserQuery extends BaseQuery<SessionUser> {
 *   constructor(
 *     public readonly id: string,
 *     options?: Partial<IQueryOptions>,
 *     sessionUser?: SessionUser,
 *   ) {
 *     super(options, sessionUser);
 *   }
 * }
 *
 * const query = new GetUserQuery(userId, { hydrate: true }, sessionUser);
 * ```
 */
export abstract class BaseQuery<TSessionPrincipal = unknown>
  implements IQueryOptions
{
  public declare readonly hydrate?: boolean;
  public declare readonly refresh?: boolean;
  public declare readonly sessionPrincipal?: TSessionPrincipal;
  public declare readonly sessionUser?: TSessionPrincipal;

  constructor(
    options?: Partial<IQueryOptions>,
    sessionPrincipal?: TSessionPrincipal,
  ) {
    defineHidden(this, 'hydrate', options?.hydrate ?? false);
    defineHidden(this, 'refresh', options?.refresh ?? false);
    if (sessionPrincipal !== undefined) {
      defineHidden(this, 'sessionPrincipal', sessionPrincipal);
      defineHidden(this, 'sessionUser', sessionPrincipal);
    }
  }

  /**
   * Serializes enumerable query payload fields to a plain object.
   *
   * `hydrate`, `refresh`, `sessionPrincipal` and `sessionUser` are non-enumerable metadata and stay
   * out of the payload.
   *
   * @returns The query payload with `undefined` fields omitted.
   */
  toJSON(): Record<string, unknown> {
    return definedFields(this);
  }
}
